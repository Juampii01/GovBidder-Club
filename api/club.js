// api/club.js
// GovBidder Club — Support Desk, Funding Access (Alliance) y Task Work (bolsa de trabajo)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PLAN_LIMITS = {
  Elevate: { bidSupportPerMonth: 1, alliancePct: 0,  shopDiscount: 10 },
  Prime:   { bidSupportPerMonth: 3, alliancePct: 60, shopDiscount: 20 },
  Legacy:  { bidSupportPerMonth: 5, alliancePct: 90, shopDiscount: 50 },
};
const NO_PLAN_LIMITS = { bidSupportPerMonth: 0, alliancePct: 0, shopDiscount: 0 };
function planLimits(plan) { return PLAN_LIMITS[plan] || NO_PLAN_LIMITS; }
const ALLIANCE_FEE_PCT = 20; // fijo, sobre la ganancia — igual para Prime y Legacy
const PLAN_LEVEL = { Elevate: 1, Prime: 2, Legacy: 3 };

// ── AUTH HELPER ───────────────────────────────────────────
async function requireMember(token) {
  if (!token) return { error: 'Token requerido', status: 400 };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Sesión expirada', status: 401 };
  const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (pErr || !profile || !profile.active) return { error: 'Miembro no encontrado', status: 401 };
  return { profile };
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// ── MAIN HANDLER ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const action = req.query.action || '';
  const body = (req.method === 'POST' && req.body) ? req.body : {};

  try {
    const { profile, error, status } = await requireMember(body.token);
    if (error) return res.status(status).json({ success: false, error });

    // ── SUPPORT DESK ──────────────────────────────────
    if (action === 'ticket_create') {
      const { type, opportunityLink, message } = body;
      if (!type || !message) return res.status(400).json({ success: false, error: 'Tipo y mensaje requeridos' });

      const limit = planLimits(profile.plan).bidSupportPerMonth;
      const { count } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true })
        .eq('member_id', profile.id).gte('created_at', monthStart());
      if ((count || 0) >= limit) {
        return res.status(403).json({ success: false, error: `Ya usaste tus ${limit} BID Helps de este mes en tu plan ${profile.plan}.` });
      }

      const { data, error: insErr } = await supabase.from('support_tickets').insert({
        member_id: profile.id, type, opportunity_link: opportunityLink || '', message
      }).select().single();
      if (insErr) return res.status(500).json({ success: false, error: insErr.message });
      return res.status(200).json({ success: true, ticket: data });
    }

    if (action === 'ticket_list') {
      const limit = planLimits(profile.plan).bidSupportPerMonth;
      const { data: tickets } = await supabase.from('support_tickets').select('*')
        .eq('member_id', profile.id).order('created_at', { ascending: false });
      const { count: usedThisMonth } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true })
        .eq('member_id', profile.id).gte('created_at', monthStart());
      return res.status(200).json({ success: true, tickets: tickets || [], quota: { used: usedThisMonth || 0, limit } });
    }

    // ── FUNDING ACCESS (Alliance) ─────────────────────
    if (action === 'alliance_status') {
      const limits = planLimits(profile.plan);
      const daysAsMember = Math.floor((Date.now() - new Date(profile.member_since).getTime()) / 86400000);
      const eligible = profile.active && daysAsMember >= 60 && limits.alliancePct > 0;
      return res.status(200).json({
        success: true,
        plan: profile.plan,
        alliancePct: limits.alliancePct,
        feePct: ALLIANCE_FEE_PCT,
        daysAsMember,
        eligible,
        checks: { active: !!profile.active, days60: daysAsMember >= 60, planQualifies: limits.alliancePct > 0 }
      });
    }

    if (action === 'alliance_request_create') {
      const limits = planLimits(profile.plan);
      if (limits.alliancePct <= 0) {
        return res.status(403).json({ success: false, error: 'Tu plan no incluye acceso a GovBidder Alliance.' });
      }
      const { company, contractState, description, poDocumentBase64, poDocumentName } = body;
      const poValue = Number(body.poValue);
      const cost = Number(body.cost);
      if (!company || !Number.isFinite(poValue) || !Number.isFinite(cost) || poValue <= 0 || cost <= 0) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos o los montos no son válidos.' });
      }
      if (cost > poValue) {
        return res.status(400).json({ success: false, error: 'El costo de mercancía no puede ser mayor al valor de la PO.' });
      }
      if (!poDocumentBase64 || !poDocumentName || !/\.pdf$/i.test(poDocumentName)) {
        return res.status(400).json({ success: false, error: 'Adjuntá la orden de compra (PDF) para continuar.' });
      }

      const buffer = Buffer.from(poDocumentBase64, 'base64');
      if (buffer.length > 3 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'El PDF no puede superar los 3MB.' });
      }

      const path = `${profile.id}/${Date.now()}-${poDocumentName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('alliance-documents')
        .upload(path, buffer, { contentType: 'application/pdf' });
      if (upErr) return res.status(500).json({ success: false, error: 'No se pudo subir el documento: ' + upErr.message });

      const { data, error: insErr } = await supabase.from('alliance_requests').insert({
        member_id: profile.id, company, po_value: poValue, cost, contract_state: contractState || '', description: description || '',
        po_document_path: path
      }).select().single();
      if (insErr) return res.status(500).json({ success: false, error: insErr.message });
      return res.status(200).json({ success: true, request: data });
    }

    // ── TASK WORK (bolsa de trabajo) ───────────────────
    if (action === 'work_pool_list') {
      const myLevel = PLAN_LEVEL[profile.plan] || 0;
      const { data: catalog } = await supabase.from('task_catalog').select('*').order('sort_order');
      const visibleCatalogIds = (catalog || [])
        .filter(c => PLAN_LEVEL[c.required_plan] <= myLevel)
        .map(c => c.id);

      const { data: openJobs } = await supabase.from('work_pool_jobs')
        .select('*, task_catalog(name, price, required_plan)')
        .eq('status', 'open')
        .in('catalog_id', visibleCatalogIds.length ? visibleCatalogIds : [0]);

      const { data: myJobs } = await supabase.from('work_pool_jobs')
        .select('*, task_catalog(name, price, required_plan)')
        .eq('claimed_by', profile.id);

      const { data: myApplications } = await supabase.from('job_applications')
        .select('job_id, status').eq('member_id', profile.id);

      return res.status(200).json({
        success: true,
        open: openJobs || [],
        mine: myJobs || [],
        appliedJobIds: (myApplications || []).map(a => a.job_id)
      });
    }

    if (action === 'job_apply') {
      const { jobId } = body;
      if (!jobId) return res.status(400).json({ success: false, error: 'jobId requerido' });

      const { data: job } = await supabase.from('work_pool_jobs').select('*, task_catalog(required_plan)').eq('id', jobId).single();
      if (!job || job.status !== 'open') return res.status(400).json({ success: false, error: 'Esta tarea ya no está disponible.' });

      const myLevel = PLAN_LEVEL[profile.plan] || 0;
      if (PLAN_LEVEL[job.task_catalog.required_plan] > myLevel) {
        return res.status(403).json({ success: false, error: 'Necesitas un plan superior para postularte a esta tarea.' });
      }

      // Update condicional atómico: solo si sigue 'open' — evita que dos miembros la tomen a la vez
      const { data: claimed } = await supabase.from('work_pool_jobs')
        .update({ status: 'applied' }).eq('id', jobId).eq('status', 'open').select();
      if (!claimed || claimed.length === 0) {
        return res.status(400).json({ success: false, error: 'Esta tarea ya no está disponible.' });
      }

      const { error: insErr } = await supabase.from('job_applications').insert({ job_id: jobId, member_id: profile.id });
      if (insErr) {
        await supabase.from('work_pool_jobs').update({ status: 'open' }).eq('id', jobId).eq('status', 'applied');
        return res.status(500).json({ success: false, error: insErr.message });
      }
      return res.status(200).json({ success: true });
    }

    // ── LEADERBOARD ─────────────────────────────────────
    if (action === 'leaderboard') {
      const { data: completed } = await supabase.from('work_pool_jobs')
        .select('claimed_by, completed_at, task_catalog(price), profiles!work_pool_jobs_claimed_by_fkey(plan)')
        .eq('status', 'completed')
        .gte('completed_at', monthStart());

      const totals = {};
      for (const job of completed || []) {
        if (!job.claimed_by) continue;
        totals[job.claimed_by] = totals[job.claimed_by] || { plan: job.profiles?.plan || '—', amount: 0 };
        totals[job.claimed_by].amount += Number(job.task_catalog?.price || 0);
      }
      const ranking = Object.values(totals).sort((a, b) => b.amount - a.amount).slice(0, 10)
        .map((r, i) => ({ rank: i + 1, plan: r.plan, amount: r.amount }));
      return res.status(200).json({ success: true, ranking });
    }

    // ── ADMIN ────────────────────────────────────────────
    if (action.startsWith('admin_')) {
      if (profile.role !== 'admin') return res.status(403).json({ success: false, error: 'Solo administradores' });

      if (action === 'admin_catalog_list') {
        const { data } = await supabase.from('task_catalog').select('*').order('sort_order');
        return res.status(200).json({ success: true, catalog: data || [] });
      }

      if (action === 'admin_job_create') {
        const { catalogId, clientRef } = body;
        if (!catalogId) return res.status(400).json({ success: false, error: 'catalogId requerido' });
        const { data, error: insErr } = await supabase.from('work_pool_jobs')
          .insert({ catalog_id: catalogId, client_ref: clientRef || '' }).select().single();
        if (insErr) return res.status(500).json({ success: false, error: insErr.message });
        return res.status(200).json({ success: true, job: data });
      }

      if (action === 'admin_job_list') {
        const { data } = await supabase.from('work_pool_jobs')
          .select('*, task_catalog(name, price, required_plan), profiles!work_pool_jobs_claimed_by_fkey(name, email, plan)')
          .order('created_at', { ascending: false });
        return res.status(200).json({ success: true, jobs: data || [] });
      }

      if (action === 'admin_application_list') {
        const { data } = await supabase.from('job_applications')
          .select('*, work_pool_jobs(id, status, task_catalog(name, price)), profiles!job_applications_member_id_fkey(name, email, plan)')
          .eq('status', 'pending').order('created_at', { ascending: false });
        return res.status(200).json({ success: true, applications: data || [] });
      }

      if (action === 'admin_application_review') {
        const { applicationId, decision } = body; // decision: 'approved' | 'rejected'
        if (!applicationId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ success: false, error: 'applicationId y decision válidos requeridos' });
        }
        const { data: application } = await supabase.from('job_applications').select('*').eq('id', applicationId).single();
        if (!application) return res.status(404).json({ success: false, error: 'Postulación no encontrada' });
        if (application.status !== 'pending') {
          return res.status(400).json({ success: false, error: 'Esta postulación ya fue resuelta.' });
        }

        const { data: updatedApp } = await supabase.from('job_applications')
          .update({ status: decision }).eq('id', applicationId).eq('status', 'pending').select();
        if (!updatedApp || updatedApp.length === 0) {
          return res.status(400).json({ success: false, error: 'Esta postulación ya fue resuelta.' });
        }

        if (decision === 'approved') {
          await supabase.from('work_pool_jobs').update({ status: 'assigned', claimed_by: application.member_id })
            .eq('id', application.job_id).eq('status', 'applied');
          await supabase.from('job_applications').update({ status: 'rejected' })
            .eq('job_id', application.job_id).eq('status', 'pending').neq('id', applicationId);
        } else {
          await supabase.from('work_pool_jobs').update({ status: 'open' }).eq('id', application.job_id).eq('status', 'applied');
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_job_complete') {
        const { jobId } = body;
        if (!jobId) return res.status(400).json({ success: false, error: 'jobId requerido' });
        const { data: updated, error: updErr } = await supabase.from('work_pool_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', jobId).eq('status', 'assigned').select();
        if (updErr) return res.status(500).json({ success: false, error: updErr.message });
        if (!updated || updated.length === 0) {
          return res.status(400).json({ success: false, error: 'Solo se pueden completar tareas asignadas.' });
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_ticket_list') {
        const { data } = await supabase.from('support_tickets')
          .select('*, profiles!support_tickets_member_id_fkey(name, email, plan)')
          .order('created_at', { ascending: false });
        return res.status(200).json({ success: true, tickets: data || [] });
      }

      if (action === 'admin_ticket_review') {
        const { ticketId, status: newStatus } = body;
        if (!ticketId || !['in_review', 'resolved'].includes(newStatus)) {
          return res.status(400).json({ success: false, error: 'ticketId y status válidos requeridos' });
        }
        const { error: updErr } = await supabase.from('support_tickets').update({ status: newStatus }).eq('id', ticketId);
        if (updErr) return res.status(500).json({ success: false, error: updErr.message });
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_alliance_list') {
        const { data } = await supabase.from('alliance_requests')
          .select('*, profiles!alliance_requests_member_id_fkey(name, email, plan)')
          .order('created_at', { ascending: false });
        return res.status(200).json({ success: true, requests: data || [] });
      }

      if (action === 'admin_alliance_get_document') {
        const { requestId } = body;
        if (!requestId) return res.status(400).json({ success: false, error: 'requestId requerido' });
        const { data: reqRow } = await supabase.from('alliance_requests').select('po_document_path').eq('id', requestId).single();
        if (!reqRow || !reqRow.po_document_path) return res.status(404).json({ success: false, error: 'Esta solicitud no tiene documento adjunto.' });
        const { data: signed, error: signErr } = await supabase.storage.from('alliance-documents')
          .createSignedUrl(reqRow.po_document_path, 300);
        if (signErr) return res.status(500).json({ success: false, error: signErr.message });
        return res.status(200).json({ success: true, url: signed.signedUrl });
      }

      if (action === 'admin_alliance_review') {
        const { requestId, decision } = body; // decision: 'approved' | 'rejected'
        if (!requestId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ success: false, error: 'requestId y decision válidos requeridos' });
        }
        const { data: updated, error: updErr } = await supabase.from('alliance_requests')
          .update({ status: decision }).eq('id', requestId).eq('status', 'pending').select();
        if (updErr) return res.status(500).json({ success: false, error: updErr.message });
        if (!updated || updated.length === 0) {
          return res.status(400).json({ success: false, error: 'Esta solicitud ya fue resuelta.' });
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: `Acción admin inválida: ${action}` });
    }

    return res.status(400).json({ success: false, error: `Acción inválida: ${action}` });

  } catch (err) {
    console.error('Club error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
