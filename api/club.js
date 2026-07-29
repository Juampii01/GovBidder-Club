// api/club.js
// GovBidder Club — Support Desk, Funding Access (Alliance) y Task Work (bolsa de trabajo)

import { createClient } from '@supabase/supabase-js';
import { requireActiveMember, checkRateLimit } from './_lib/auth.js';
import { safeError } from './_lib/errors.js';
import { sendBrandedEmail, sendInvestorWelcomeEmail } from './_lib/email.js';

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

// ── AUTH HELPER ───────────────────────────────────────────
function requireMember(token) { return requireActiveMember(supabase, token); }

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// Sube un PDF en base64 a un bucket privado. Devuelve { path } o { error }.
async function uploadPdf(bucket, memberId, base64, filename, maxMB = 3) {
  if (!base64 || !filename || !/\.pdf$/i.test(filename)) {
    return { error: 'El archivo debe ser un PDF.' };
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > maxMB * 1024 * 1024) {
    return { error: `El PDF no puede superar los ${maxMB}MB.` };
  }
  const path = `${memberId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: 'application/pdf' });
  if (upErr) { console.error('uploadPdf storage error:', upErr.message); return { error: 'No se pudo subir el documento. Intentá de nuevo.' }; }
  return { path };
}

// Documentos del perfil de empresa (Fase 20-22): 2 documentos fijos 1:1 en `profiles`,
// más certificaciones en la tabla hija `profile_documents` (0 a 5 filas por miembro).
const FIXED_PROFILE_DOC_COLUMNS = { capability_statement: 'capability_statement_path', w9: 'w9_path' };
const CERT_KEY_TO_COLUMN = {
  '8a': 'cert_8a',
  hubzone: 'cert_hubzone',
  women_owned: 'cert_women_owned',
  veteran_owned: 'cert_veteran_owned',
  small_business: 'cert_small_business',
};

async function getAllianceMaxCap() {
  const { data } = await supabase.from('platform_settings').select('value').eq('key', 'alliance_max_cap').single();
  const val = Number(data?.value);
  return Number.isFinite(val) && val > 0 ? val : 15000;
}

// ── INVESTMENT CLUB ───────────────────────────────────────
// Sube un comprobante de pago (PDF o imagen) a un bucket privado. Devuelve { path } o { error }.
async function uploadReceipt(bucket, memberId, base64, filename, maxMB = 5) {
  if (!base64 || !filename) return { error: 'Falta el comprobante.' };
  const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase();
  const CONTENT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return { error: 'El comprobante debe ser PDF, JPG o PNG.' };
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > maxMB * 1024 * 1024) return { error: `El archivo no puede superar los ${maxMB}MB.` };
  const path = `${memberId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, buffer, { contentType });
  if (upErr) { console.error('uploadReceipt storage error:', upErr.message); return { error: 'No se pudo subir el comprobante. Intentá de nuevo.' }; }
  return { path };
}

// Cuántos pagos mensuales corresponden desde start_date hasta hoy (tope term_months).
// El primer pago vence el día de inicio (mes 1), no un mes después.
function expectedPaymentsSoFar(startDateStr, termMonths) {
  const start = new Date(startDateStr);
  const now = new Date();
  if (now < start) return 0;
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.min(termMonths, Math.max(0, months + 1));
}

function investorSummary(investor, deposits) {
  const approved = (deposits || []).filter(d => d.status === 'approved');
  const totalApproved = approved.reduce((s, d) => s + Number(d.amount), 0);
  const monthlyAmount = Number(investor.monthly_amount) || 1;
  // Los pagos se cuentan por monto acumulado, no por cantidad de comprobantes: un solo
  // depósito de $3,000 cuenta como 3 cuotas, no como "1 pago".
  const paymentsMade = Math.min(investor.term_months, Math.floor(totalApproved / monthlyAmount));
  const expectedPayments = expectedPaymentsSoFar(investor.start_date, investor.term_months);
  const behind = Math.max(0, expectedPayments - paymentsMade);
  // El capital y la ganancia maduran con el tiempo real del plazo (24 meses), no con la
  // velocidad de pago — pagar por adelantado no acelera el desbloqueo. maturedMonths es
  // el mínimo entre lo efectivamente pagado y los meses que ya transcurrieron.
  const maturedMonths = Math.min(expectedPayments, paymentsMade);
  const progressPct = Math.min(100, Math.round((maturedMonths / investor.term_months) * 1000) / 10);
  const vestedFraction = Math.min(1, maturedMonths / investor.term_months);
  const accruedProfit = Math.round(investor.fixed_return * vestedFraction * 100) / 100;
  const projectedTotal = investor.term_months * monthlyAmount + Number(investor.fixed_return);
  return { totalApproved, paymentsMade, expectedPayments, behind, progressPct, accruedProfit, projectedTotal };
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
      const { type, opportunityLink, message, documentBase64, documentName } = body;
      if (!type || !message) return res.status(400).json({ success: false, error: 'Tipo y mensaje requeridos' });

      const limit = planLimits(profile.plan).bidSupportPerMonth;

      let documentPath = null;
      if (documentBase64) {
        const { path, error: upErr } = await uploadPdf('support-documents', profile.id, documentBase64, documentName);
        if (upErr) return res.status(400).json({ success: false, error: upErr });
        documentPath = path;
      }

      // Chequeo de cuota + insert atómicos en una sola función de Postgres (con advisory lock
      // por miembro) para que dos requests concurrentes no puedan superar el límite mensual.
      const { data: result, error: rpcErr } = await supabase.rpc('create_ticket_if_under_quota', {
        p_member_id: profile.id, p_type: type, p_opportunity_link: opportunityLink || '', p_message: message,
        p_document_path: documentPath, p_limit: limit, p_month_start: monthStart()
      });
      if (rpcErr) return safeError(res, rpcErr, 'club.js error');
      if (result?.error === 'quota_exceeded') {
        return res.status(403).json({ success: false, error: `Ya usaste tus ${limit} BID Helps de este mes en tu plan ${profile.plan}.` });
      }
      return res.status(200).json({ success: true, ticket: result });
    }

    if (action === 'ticket_list') {
      const limit = planLimits(profile.plan).bidSupportPerMonth;
      const { data: tickets } = await supabase.from('support_tickets').select('*')
        .eq('member_id', profile.id).order('created_at', { ascending: false });
      const { count: usedThisMonth } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true })
        .eq('member_id', profile.id).gte('created_at', monthStart());
      return res.status(200).json({ success: true, tickets: tickets || [], quota: { used: usedThisMonth || 0, limit } });
    }

    if (action === 'ticket_mark_resolved') {
      const { ticketId } = body;
      if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId requerido' });
      const { data: ticket } = await supabase.from('support_tickets')
        .select('admin_response').eq('id', ticketId).eq('member_id', profile.id).single();
      if (!ticket) return res.status(404).json({ success: false, error: 'Ticket no encontrado.' });
      if (!ticket.admin_response) {
        return res.status(400).json({ success: false, error: 'Todavía no tenés una respuesta del equipo para este ticket.' });
      }
      const { data: updated, error: updErr } = await supabase.from('support_tickets')
        .update({ status: 'resolved' }).eq('id', ticketId).eq('member_id', profile.id).select();
      if (updErr) return safeError(res, updErr, 'club.js error');
      if (!updated || updated.length === 0) return res.status(404).json({ success: false, error: 'Ticket no encontrado.' });
      return res.status(200).json({ success: true });
    }

    if (action === 'ticket_get_document') {
      const { ticketId } = body;
      if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId requerido' });
      const { data: ticket } = await supabase.from('support_tickets').select('document_path').eq('id', ticketId).eq('member_id', profile.id).single();
      if (!ticket || !ticket.document_path) return res.status(404).json({ success: false, error: 'Este ticket no tiene documento adjunto.' });
      const { data: signed, error: signErr } = await supabase.storage.from('support-documents').createSignedUrl(ticket.document_path, 300);
      if (signErr) return safeError(res, signErr, 'club.js error');
      return res.status(200).json({ success: true, url: signed.signedUrl });
    }

    // ── FUNDING ACCESS (Alliance) ─────────────────────
    if (action === 'alliance_status') {
      const limits = planLimits(profile.plan);
      const daysAsMember = Math.floor((Date.now() - new Date(profile.member_since).getTime()) / 86400000);
      const eligible = profile.active && daysAsMember >= 60 && limits.alliancePct > 0;
      const maxCap = await getAllianceMaxCap();
      return res.status(200).json({
        success: true,
        plan: profile.plan,
        alliancePct: limits.alliancePct,
        feePct: ALLIANCE_FEE_PCT,
        maxCap,
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
      const {
        company, description, ein, businessAddress, governmentEntity, contractReference,
        poIssueDate, estimatedDeliveryDate, tcAccepted,
        poDocumentBase64, poDocumentName,
        awardDocumentBase64, awardDocumentName,
        quoteDocumentBase64, quoteDocumentName,
        scheduleDocumentBase64, scheduleDocumentName,
        bankStatementDocumentBase64, bankStatementDocumentName
      } = body;
      const poValue = Number(body.poValue);
      const cost = Number(body.cost);
      if (!company || !Number.isFinite(poValue) || !Number.isFinite(cost) || poValue <= 0 || cost <= 0) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos o los montos no son válidos.' });
      }
      if (cost > poValue) {
        return res.status(400).json({ success: false, error: 'El costo de mercancía no puede ser mayor al valor de la PO.' });
      }
      if (poIssueDate && estimatedDeliveryDate && poIssueDate > estimatedDeliveryDate) {
        return res.status(400).json({ success: false, error: 'La fecha estimada de entrega no puede ser anterior a la fecha de emisión de la PO.' });
      }
      if (!poDocumentBase64 || !poDocumentName || !/\.pdf$/i.test(poDocumentName)) {
        return res.status(400).json({ success: false, error: 'Adjuntá la orden de compra (PDF) para continuar.' });
      }
      if (tcAccepted !== true) {
        return res.status(400).json({ success: false, error: 'Debés aceptar los Términos y Condiciones de GovBidder Alliance para continuar.' });
      }

      // Defensa en profundidad: el frontend ya limita la suma de documentos a 3MB, pero
      // el backend no debe depender solo de esa validación (alguien podría pegarle a la
      // acción directo). Vercel corta requests de más de 4.5MB antes de que este código
      // corra, así que rechazamos acá con un mensaje claro en vez de dejar que explote un 413.
      const allDocsBase64 = [poDocumentBase64, awardDocumentBase64, quoteDocumentBase64, scheduleDocumentBase64, bankStatementDocumentBase64];
      const totalRawBytes = allDocsBase64.reduce((sum, b64) => sum + (b64 ? Math.floor(b64.length * 3 / 4) : 0), 0);
      if (totalRawBytes > 3 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'La suma de todos los documentos adjuntos no puede superar los 3MB. Achicá alguno antes de reintentar.' });
      }

      const { path: poPath, error: poErr } = await uploadPdf('alliance-documents', profile.id, poDocumentBase64, poDocumentName);
      if (poErr) return res.status(400).json({ success: false, error: poErr });

      // Los otros 4 documentos son opcionales por ahora — se piden pero no bloquean el envío.
      const optionalDocs = [
        ['award_document_path', awardDocumentBase64, awardDocumentName],
        ['quote_document_path', quoteDocumentBase64, quoteDocumentName],
        ['schedule_document_path', scheduleDocumentBase64, scheduleDocumentName],
        ['bank_statement_document_path', bankStatementDocumentBase64, bankStatementDocumentName],
      ];
      const insert = {
        member_id: profile.id, company, po_value: poValue, cost, description: description || '',
        po_document_path: poPath,
        ein: ein || '', business_address: businessAddress || '', government_entity: governmentEntity || '',
        contract_reference: contractReference || '', po_issue_date: poIssueDate || null, estimated_delivery_date: estimatedDeliveryDate || null,
        tc_accepted_at: new Date().toISOString()
      };
      for (const [col, b64, name] of optionalDocs) {
        if (!b64) continue;
        // Límite más chico que la PO (1.5MB en vez de 3MB): hasta 5 documentos en el mismo
        // POST pueden superar el límite de 4.5MB por request de Vercel Serverless Functions.
        const { path, error: docErr } = await uploadPdf('alliance-documents', profile.id, b64, name, 1.5);
        if (docErr) return res.status(400).json({ success: false, error: docErr });
        insert[col] = path;
      }

      const { data, error: insErr } = await supabase.from('alliance_requests').insert(insert).select().single();
      if (insErr) return safeError(res, insErr, 'club.js error');
      return res.status(200).json({ success: true, request: data });
    }

    if (action === 'alliance_my_requests') {
      const { data } = await supabase.from('alliance_requests')
        .select('id, po_value, cost, status, created_at')
        .eq('member_id', profile.id)
        .order('created_at', { ascending: false });
      return res.status(200).json({ success: true, requests: data || [] });
    }

    // ── TASK WORK (bolsa de trabajo) ───────────────────
    if (action === 'work_pool_list') {
      // Se muestran TODAS las tareas abiertas, sin importar el plan — así un miembro
      // ve el catálogo completo y lo que gana cada tarea, aunque solo pueda postularse
      // a las de su nivel o inferior (incentiva el upgrade de plan).
      const { data: openJobs } = await supabase.from('work_pool_jobs')
        .select('*, task_catalog(name, price, required_plan)')
        .eq('status', 'open');

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

      if (job.task_catalog.required_plan !== profile.plan) {
        return res.status(403).json({ success: false, error: `Esta tarea es exclusiva para miembros ${job.task_catalog.required_plan}.` });
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
        return safeError(res, insErr, 'club.js error');
      }
      return res.status(200).json({ success: true });
    }

    // ── LEADERBOARD ─────────────────────────────────────
    if (action === 'leaderboard') {
      const { data: completed } = await supabase.from('work_pool_jobs')
        .select('claimed_by, completed_at, price_override, task_catalog(price), profiles!work_pool_jobs_claimed_by_fkey(plan)')
        .eq('status', 'completed')
        .gte('completed_at', monthStart());

      const totals = {};
      for (const job of completed || []) {
        if (!job.claimed_by) continue;
        totals[job.claimed_by] = totals[job.claimed_by] || { plan: job.profiles?.plan || '—', amount: 0 };
        totals[job.claimed_by].amount += Number(job.price_override ?? job.task_catalog?.price ?? 0);
      }
      const ranking = Object.values(totals).sort((a, b) => b.amount - a.amount).slice(0, 10)
        .map((r, i) => ({ rank: i + 1, plan: r.plan, amount: r.amount }));
      return res.status(200).json({ success: true, ranking });
    }

    // ── INVESTMENT CLUB (solo inversionistas) ───────────
    if (action === 'investor_status') {
      if (!profile.is_investor) return res.status(403).json({ success: false, error: 'No sos inversionista en este momento.' });
      const { data: investor } = await supabase.from('investors').select('*').eq('profile_id', profile.id).single();
      if (!investor) return res.status(404).json({ success: false, error: 'No se encontró tu registro de inversionista.' });
      const { data: deposits } = await supabase.from('investor_deposits')
        .select('*').eq('investor_id', investor.id).order('submitted_at', { ascending: false });
      const summary = investorSummary(investor, deposits);
      return res.status(200).json({
        success: true,
        investor: {
          startDate: investor.start_date, monthlyAmount: investor.monthly_amount,
          termMonths: investor.term_months, fixedReturn: investor.fixed_return, status: investor.status
        },
        ...summary,
        deposits: deposits || []
      });
    }

    if (action === 'investor_deposit_submit') {
      if (!profile.is_investor) return res.status(403).json({ success: false, error: 'No sos inversionista en este momento.' });
      const { receiptBase64, receiptName } = body;
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Monto inválido.' });
      }
      const { data: investor } = await supabase.from('investors').select('id, status').eq('profile_id', profile.id).single();
      if (!investor) return res.status(404).json({ success: false, error: 'No se encontró tu registro de inversionista.' });
      if (investor.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Tu inversión ya no está activa.' });
      }
      const { path, error: upErr } = await uploadReceipt('investor-documents', profile.id, receiptBase64, receiptName);
      if (upErr) return res.status(400).json({ success: false, error: upErr });

      const { data, error: insErr } = await supabase.from('investor_deposits')
        .insert({ investor_id: investor.id, amount, receipt_path: path }).select().single();
      if (insErr) return safeError(res, insErr, 'club.js error');
      return res.status(200).json({ success: true, deposit: data });
    }

    if (action === 'update_profile_name') {
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, error: 'El nombre no puede estar vacío.' });
      if (name.length > 100) return res.status(400).json({ success: false, error: 'Nombre demasiado largo.' });
      const { error: updErr } = await supabase.from('profiles').update({ name }).eq('id', profile.id);
      if (updErr) return safeError(res, updErr, 'club.js error');
      return res.status(200).json({ success: true, name });
    }

    if (action === 'update_company_profile') {
      const clip = (v, max) => String(v || '').trim().substring(0, max);
      const update = {
        company_name: clip(body.companyName, 150),
        company_dba: clip(body.companyDba, 150),
        ein: clip(body.ein, 20),
        uei: clip(body.uei, 20),
        cage_code: clip(body.cageCode, 20),
        business_address: clip(body.businessAddress, 250),
        company_phone: clip(body.companyPhone, 30),
        company_website: clip(body.companyWebsite, 200),
        cert_8a: body.cert8a === true,
        cert_hubzone: body.certHubzone === true,
        cert_women_owned: body.certWomenOwned === true,
        cert_veteran_owned: body.certVeteranOwned === true,
        cert_small_business: body.certSmallBusiness === true,
      };
      const { error: updErr } = await supabase.from('profiles').update(update).eq('id', profile.id);
      if (updErr) return safeError(res, updErr, 'club.js error');

      // Si una certificación se desmarca en este mismo guardado, borramos en cascada el
      // documento que tenía cargado — no tiene sentido dejar un archivo de una cert inactiva.
      const droppedCertKeys = Object.entries(CERT_KEY_TO_COLUMN)
        .filter(([, column]) => profile[column] === true && update[column] === false)
        .map(([certKey]) => certKey);
      if (droppedCertKeys.length) {
        const { data: toDelete } = await supabase.from('profile_documents')
          .select('file_path').eq('member_id', profile.id).in('cert_key', droppedCertKeys);
        if (toDelete?.length) {
          await supabase.storage.from('profile-documents').remove(toDelete.map(d => d.file_path));
          await supabase.from('profile_documents').delete().eq('member_id', profile.id).in('cert_key', droppedCertKeys);
        }
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'lookup_sam_entity') {
      const SAM_KEY = process.env.SAM_GOV_API_KEY;
      if (!SAM_KEY) {
        return res.status(500).json({ success: false, error: 'SAM_GOV_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables.' });
      }
      const { error: rlErr, status: rlStatus } = await checkRateLimit(supabase, profile.id, 'sam_lookup', 5, 60);
      if (rlErr) return res.status(rlStatus).json({ success: false, error: rlErr });

      const uei = String(body.uei || '').trim();
      const legalBusinessName = String(body.companyName || '').trim();
      if (!uei && !legalBusinessName) {
        return res.status(400).json({ success: false, error: 'Ingresá un UEI o el nombre de la empresa para buscar.' });
      }
      const params = new URLSearchParams({ api_key: SAM_KEY });
      if (uei) params.set('ueiSAM', uei);
      else params.set('legalBusinessName', legalBusinessName);

      try {
        const samRes = await fetch(`https://api.sam.gov/entity-information/v3/entities?${params}`);
        if (!samRes.ok) {
          const errText = await samRes.text();
          throw new Error(`SAM.gov API error ${samRes.status}: ${errText.substring(0, 200)}`);
        }
        const samData = await samRes.json();
        const entity = samData.entityData?.[0];
        if (!entity) {
          return res.status(404).json({ success: false, error: 'No se encontró ninguna empresa registrada en SAM.gov con esos datos.' });
        }

        const reg = entity.entityRegistration || {};
        const core = entity.coreData || {};
        const addr = core.physicalAddress || {};
        const naicsList = entity.assertions?.goodsAndServices?.naicsList || [];
        // Mapeo de certificaciones por TEXTO de la descripción (sbaBusinessTypeDesc), no por
        // código — SAM.gov no documenta públicamente todos los códigos de certificación, así
        // que anclamos en el texto (mismo patrón que el mapeo de set-aside de la Fase 13).
        const sbaCerts = core.businessTypes?.sbaBusinessTypeList || [];
        const certDescs = sbaCerts.map(c => (c.sbaBusinessTypeDesc || '').toLowerCase());
        const hasCert = (needle) => certDescs.some(d => d.includes(needle));

        return res.status(200).json({
          success: true,
          entity: {
            legalBusinessName: reg.legalBusinessName || '',
            dbaName: reg.dbaName || '',
            uei: reg.ueiSAM || '',
            cageCode: reg.cageCode || '',
            registrationStatus: reg.registrationStatus || '',
            registrationExpirationDate: reg.registrationExpirationDate || '',
            businessAddress: [addr.addressLine1, addr.city, addr.stateOrProvinceCode, addr.zipCode].filter(Boolean).join(', '),
            naicsCodes: naicsList.map(n => n.naicsCode).filter(Boolean),
            cert8a: hasCert('8(a)'),
            certHubzone: hasCert('hubzone'),
            certWomenOwned: hasCert('woman owned') || hasCert('women owned') || hasCert('women-owned'),
            certVeteranOwned: hasCert('veteran'),
            certSmallBusiness: hasCert('small business'),
          }
        });
      } catch (error) {
        return safeError(res, error, 'SAM.gov error');
      }
    }

    // ── DOCUMENTOS DEL PERFIL DE EMPRESA (Fase 21) ───────
    if (action === 'profile_document_upload') {
      const { docType, certKey, base64, filename } = body;

      if (docType === 'capability_statement' || docType === 'w9') {
        const column = FIXED_PROFILE_DOC_COLUMNS[docType];
        const { path, error: upErr } = await uploadPdf('profile-documents', profile.id, base64, filename, 3);
        if (upErr) return res.status(400).json({ success: false, error: upErr });
        const oldPath = profile[column];
        const { error: updErr } = await supabase.from('profiles').update({ [column]: path }).eq('id', profile.id);
        if (updErr) return safeError(res, updErr, 'club.js error');
        if (oldPath) await supabase.storage.from('profile-documents').remove([oldPath]);
        return res.status(200).json({ success: true });
      }

      if (docType === 'certification') {
        const column = CERT_KEY_TO_COLUMN[certKey];
        if (!column) return res.status(400).json({ success: false, error: 'Certificación inválida.' });
        if (profile[column] !== true) {
          return res.status(400).json({ success: false, error: 'Marcá y guardá esta certificación en tu perfil antes de subir el documento.' });
        }
        const { path, error: upErr } = await uploadReceipt('profile-documents', profile.id, base64, filename, 3);
        if (upErr) return res.status(400).json({ success: false, error: upErr });
        const { data: existing } = await supabase.from('profile_documents')
          .select('file_path').eq('member_id', profile.id).eq('cert_key', certKey).maybeSingle();
        const { error: upsertErr } = await supabase.from('profile_documents').upsert({
          member_id: profile.id, cert_key: certKey, file_path: path,
          original_filename: filename, uploaded_at: new Date().toISOString()
        }, { onConflict: 'member_id,cert_key' });
        if (upsertErr) return safeError(res, upsertErr, 'club.js error');
        if (existing?.file_path) await supabase.storage.from('profile-documents').remove([existing.file_path]);
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'docType inválido.' });
    }

    if (action === 'profile_document_list') {
      const { data: certDocs } = await supabase.from('profile_documents')
        .select('cert_key, original_filename, uploaded_at').eq('member_id', profile.id);
      return res.status(200).json({
        success: true,
        capabilityStatement: { uploaded: !!profile.capability_statement_path },
        w9: { uploaded: !!profile.w9_path },
        certifications: (certDocs || []).map(d => ({ certKey: d.cert_key, filename: d.original_filename, uploadedAt: d.uploaded_at })),
      });
    }

    if (action === 'profile_document_get') {
      const { docType, certKey } = body;
      let path = null;
      if (docType === 'capability_statement' || docType === 'w9') {
        path = profile[FIXED_PROFILE_DOC_COLUMNS[docType]] || null;
      } else if (docType === 'certification') {
        const { data } = await supabase.from('profile_documents')
          .select('file_path').eq('member_id', profile.id).eq('cert_key', certKey).maybeSingle();
        path = data?.file_path || null;
      }
      if (!path) return res.status(404).json({ success: false, error: 'No hay documento subido.' });
      const { data: signed, error: signErr } = await supabase.storage.from('profile-documents').createSignedUrl(path, 300);
      if (signErr) return safeError(res, signErr, 'club.js error');
      return res.status(200).json({ success: true, url: signed.signedUrl });
    }

    if (action === 'profile_document_delete') {
      const { docType, certKey } = body;

      if (docType === 'capability_statement' || docType === 'w9') {
        const column = FIXED_PROFILE_DOC_COLUMNS[docType];
        const oldPath = profile[column];
        if (!oldPath) return res.status(404).json({ success: false, error: 'No hay documento para borrar.' });
        const { error: updErr } = await supabase.from('profiles').update({ [column]: null }).eq('id', profile.id);
        if (updErr) return safeError(res, updErr, 'club.js error');
        await supabase.storage.from('profile-documents').remove([oldPath]);
        return res.status(200).json({ success: true });
      }

      if (docType === 'certification') {
        const { data: existing } = await supabase.from('profile_documents')
          .select('file_path').eq('member_id', profile.id).eq('cert_key', certKey).maybeSingle();
        if (!existing) return res.status(404).json({ success: false, error: 'No hay documento para borrar.' });
        const { error: delErr } = await supabase.from('profile_documents')
          .delete().eq('member_id', profile.id).eq('cert_key', certKey);
        if (delErr) return safeError(res, delErr, 'club.js error');
        await supabase.storage.from('profile-documents').remove([existing.file_path]);
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'docType inválido.' });
    }

    // ── ADMIN ────────────────────────────────────────────
    if (action.startsWith('admin_')) {
      if (profile.role !== 'admin') return res.status(403).json({ success: false, error: 'Solo administradores' });

      if (action === 'admin_catalog_list') {
        const { data } = await supabase.from('task_catalog').select('*').order('sort_order');
        return res.status(200).json({ success: true, catalog: data || [] });
      }

      if (action === 'admin_job_create') {
        const { catalogId, clientRef, price } = body;
        if (!catalogId) return res.status(400).json({ success: false, error: 'catalogId requerido' });
        const insert = { catalog_id: catalogId, client_ref: clientRef || '' };
        if (price !== undefined && price !== null && price !== '') {
          const priceNum = Number(price);
          if (!Number.isFinite(priceNum) || priceNum <= 0) {
            return res.status(400).json({ success: false, error: 'Precio inválido.' });
          }
          insert.price_override = priceNum;
        }
        const { data, error: insErr } = await supabase.from('work_pool_jobs')
          .insert(insert).select().single();
        if (insErr) return safeError(res, insErr, 'club.js error');
        return res.status(200).json({ success: true, job: data });
      }

      if (action === 'admin_job_list') {
        const { data } = await supabase.from('work_pool_jobs')
          .select('*, task_catalog(name, price, required_plan), profiles!work_pool_jobs_claimed_by_fkey(name, email, plan)')
          .order('created_at', { ascending: false });
        return res.status(200).json({ success: true, jobs: data || [] });
      }

      if (action === 'admin_member_list') {
        const { data } = await supabase.from('profiles')
          .select('id, name, email, plan, is_investor').eq('active', true).order('name');
        return res.status(200).json({ success: true, members: data || [] });
      }

      if (action === 'admin_job_assign') {
        const { jobId, memberId } = body;
        if (!jobId || !memberId) return res.status(400).json({ success: false, error: 'jobId y memberId requeridos' });
        const { data: updated, error: updErr } = await supabase.from('work_pool_jobs')
          .update({ status: 'assigned', claimed_by: memberId }).eq('id', jobId).eq('status', 'open').select();
        if (updErr) return safeError(res, updErr, 'club.js error');
        if (!updated || updated.length === 0) {
          return res.status(400).json({ success: false, error: 'Esta tarea ya no está disponible para asignar.' });
        }
        return res.status(200).json({ success: true });
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
        if (updErr) return safeError(res, updErr, 'club.js error');
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
        const { ticketId, status: newStatus, response } = body;
        if (!ticketId || !['in_review', 'resolved'].includes(newStatus)) {
          return res.status(400).json({ success: false, error: 'ticketId y status válidos requeridos' });
        }
        const update = { status: newStatus };
        if (response !== undefined) update.admin_response = response;
        const { error: updErr } = await supabase.from('support_tickets').update(update).eq('id', ticketId);
        if (updErr) return safeError(res, updErr, 'club.js error');
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_ticket_get_document') {
        const { ticketId } = body;
        if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId requerido' });
        const { data: ticket } = await supabase.from('support_tickets').select('document_path').eq('id', ticketId).single();
        if (!ticket || !ticket.document_path) return res.status(404).json({ success: false, error: 'Este ticket no tiene documento adjunto.' });
        const { data: signed, error: signErr } = await supabase.storage.from('support-documents').createSignedUrl(ticket.document_path, 300);
        if (signErr) return safeError(res, signErr, 'club.js error');
        return res.status(200).json({ success: true, url: signed.signedUrl });
      }

      if (action === 'admin_alliance_list') {
        const { data } = await supabase.from('alliance_requests')
          .select('*, profiles!alliance_requests_member_id_fkey(name, email, plan)')
          .order('created_at', { ascending: false });
        return res.status(200).json({ success: true, requests: data || [] });
      }

      if (action === 'admin_alliance_get_document') {
        const { requestId, docType } = body;
        const DOC_COLUMNS = {
          po: 'po_document_path', award: 'award_document_path', quote: 'quote_document_path',
          schedule: 'schedule_document_path', bank_statement: 'bank_statement_document_path'
        };
        const column = DOC_COLUMNS[docType || 'po'];
        if (!requestId || !column) return res.status(400).json({ success: false, error: 'requestId y docType válidos requeridos' });
        const { data: reqRow } = await supabase.from('alliance_requests').select(column).eq('id', requestId).single();
        if (!reqRow || !reqRow[column]) return res.status(404).json({ success: false, error: 'Esta solicitud no tiene ese documento adjunto.' });
        const { data: signed, error: signErr } = await supabase.storage.from('alliance-documents')
          .createSignedUrl(reqRow[column], 300);
        if (signErr) return safeError(res, signErr, 'club.js error');
        return res.status(200).json({ success: true, url: signed.signedUrl });
      }

      if (action === 'admin_alliance_review') {
        const { requestId, decision } = body; // decision: 'approved' | 'rejected'
        if (!requestId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ success: false, error: 'requestId y decision válidos requeridos' });
        }
        const { data: updated, error: updErr } = await supabase.from('alliance_requests')
          .update({ status: decision }).eq('id', requestId).eq('status', 'pending').select();
        if (updErr) return safeError(res, updErr, 'club.js error');
        if (!updated || updated.length === 0) {
          return res.status(400).json({ success: false, error: 'Esta solicitud ya fue resuelta.' });
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_get_settings') {
        const maxCap = await getAllianceMaxCap();
        return res.status(200).json({ success: true, settings: { allianceMaxCap: maxCap } });
      }

      if (action === 'admin_update_settings') {
        const cap = Number(body.allianceMaxCap);
        if (!Number.isFinite(cap) || cap <= 0) {
          return res.status(400).json({ success: false, error: 'allianceMaxCap inválido' });
        }
        const { error: updErr } = await supabase.from('platform_settings')
          .update({ value: String(cap), updated_at: new Date().toISOString() }).eq('key', 'alliance_max_cap');
        if (updErr) return safeError(res, updErr, 'club.js error');
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_membership_list') {
        const { data } = await supabase.from('membership_requests')
          .select('*').order('created_at', { ascending: false });
        return res.status(200).json({ success: true, requests: data || [] });
      }

      if (action === 'admin_membership_review') {
        const { requestId, status: newStatus } = body; // newStatus: 'contacted' | 'rejected'
        if (!requestId || !['contacted', 'rejected'].includes(newStatus)) {
          return res.status(400).json({ success: false, error: 'requestId y status válidos requeridos' });
        }
        const { error: updErr } = await supabase.from('membership_requests').update({ status: newStatus }).eq('id', requestId);
        if (updErr) return safeError(res, updErr, 'club.js error');
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_investor_list') {
        const { data: investors } = await supabase.from('investors')
          .select('*, profiles!investors_profile_id_fkey(name, email)').order('created_at', { ascending: false });
        if (!investors || !investors.length) return res.status(200).json({ success: true, investors: [] });
        const ids = investors.map(i => i.id);
        const { data: deposits } = await supabase.from('investor_deposits').select('*').in('investor_id', ids);
        const byInvestor = {};
        for (const d of deposits || []) (byInvestor[d.investor_id] ||= []).push(d);
        // Para saber si todavía no activaron la invitación (para mostrar "Reenviar
        // invitación" solo cuando corresponde) — un solo listUsers() en vez de N llamadas.
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const confirmedById = {};
        (authUsers || []).forEach(u => { confirmedById[u.id] = !!u.email_confirmed_at; });
        const result = investors.map(inv => ({
          id: inv.id, profileId: inv.profile_id, name: inv.profiles?.name, email: inv.profiles?.email,
          startDate: inv.start_date, monthlyAmount: inv.monthly_amount, termMonths: inv.term_months,
          fixedReturn: inv.fixed_return, status: inv.status,
          pendingActivation: confirmedById[inv.profile_id] === false,
          ...investorSummary(inv, byInvestor[inv.id] || [])
        }));
        return res.status(200).json({ success: true, investors: result });
      }

      if (action === 'admin_investor_create') {
        let { profileId, startDate, newMemberName, newMemberEmail, newMemberPlan } = body;
        const monthlyAmount = body.monthlyAmount !== undefined ? Number(body.monthlyAmount) : 1000;
        const termMonths = body.termMonths !== undefined ? Number(body.termMonths) : 24;
        const fixedReturn = body.fixedReturn !== undefined ? Number(body.fixedReturn) : 6000;
        const initialPaidAmount = (body.initialPaidAmount !== undefined && body.initialPaidAmount !== '' && body.initialPaidAmount !== null)
          ? Number(body.initialPaidAmount) : null;
        if (!startDate) {
          return res.status(400).json({ success: false, error: 'startDate requerido' });
        }
        if (!profileId && !newMemberEmail) {
          return res.status(400).json({ success: false, error: 'profileId o los datos de un miembro nuevo son requeridos' });
        }

        let inviteEmailWarning = null;
        if (!profileId) {
          // Miembro nuevo (no existía en profiles) — se crea la cuenta desde cero.
          const email = String(newMemberEmail || '').trim().toLowerCase();
          const name = String(newMemberName || '').trim();
          if (!/\S+@\S+\.\S+/.test(email)) {
            return res.status(400).json({ success: false, error: 'Email inválido para el miembro nuevo.' });
          }
          if (!name) {
            return res.status(400).json({ success: false, error: 'Nombre requerido para el miembro nuevo.' });
          }
          const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
          if (existingProfile) {
            return res.status(400).json({ success: false, error: 'Ya existe un miembro con ese email — buscalo en el Paso 1.' });
          }
          const plan = ['Legacy', 'Prime', 'Elevate'].includes(newMemberPlan) ? newMemberPlan : 'Legacy';
          // Generamos el link nosotros (en vez de inviteUserByEmail) para poder mandar
          // nuestro propio email con el mismo diseño de marca que el resto de los emails del Club.
          const { ok: emailOk, error: emailErr, invited } = await sendInvestorWelcomeEmail(supabase, email, name);
          if (!invited) return safeError(res, new Error(emailErr || 'No se pudo generar la invitación.'), 'club.js error');
          if (!emailOk) inviteEmailWarning = emailErr;
          const expiry = new Date(startDate);
          expiry.setFullYear(expiry.getFullYear() + 1);
          // upsert (no insert): invitar al usuario dispara un trigger que ya crea una fila
          // trial en profiles para ese id — hay que sobrescribirla, no chocar con ella.
          const { error: profErr } = await supabase.from('profiles').upsert({
            id: invited.user.id, name, email, role: 'member', plan,
            plan_expiry: expiry.toISOString().slice(0, 10),
            member_since: startDate, active: true, is_investor: true, is_trial: false
          }, { onConflict: 'id' });
          if (profErr) return safeError(res, profErr, 'club.js error');
          profileId = invited.user.id;
        } else {
          const { data: existing } = await supabase.from('investors').select('id').eq('profile_id', profileId).maybeSingle();
          if (existing) return res.status(400).json({ success: false, error: 'Este miembro ya es inversionista.' });
        }

        const { data, error: insErr } = await supabase.from('investors')
          .insert({ profile_id: profileId, start_date: startDate, monthly_amount: monthlyAmount, term_months: termMonths, fixed_return: fixedReturn })
          .select().single();
        if (insErr) return safeError(res, insErr, 'club.js error');
        await supabase.from('profiles').update({ is_investor: true }).eq('id', profileId);

        if (initialPaidAmount && initialPaidAmount > 0) {
          await supabase.from('investor_deposits').insert({
            investor_id: data.id, amount: initialPaidAmount, status: 'approved',
            receipt_path: 'backfill:admin', reviewed_at: new Date().toISOString(),
            admin_notes: 'Carga inicial retroactiva cargada por admin'
          });
        }

        return res.status(200).json({ success: true, investor: data, inviteEmailWarning });
      }

      // Reenvía la invitación (link fresco + email de bienvenida) a un inversionista que
      // todavía no activó su cuenta — cubre el caso de un link viejo roto/expirado.
      if (action === 'admin_investor_resend_invite') {
        const { profileId } = body;
        if (!profileId) return res.status(400).json({ success: false, error: 'profileId requerido' });
        const { data: targetProfile } = await supabase.from('profiles').select('email, name').eq('id', profileId).single();
        if (!targetProfile?.email) return res.status(404).json({ success: false, error: 'Miembro no encontrado.' });
        const { ok, error: sendErr } = await sendInvestorWelcomeEmail(supabase, targetProfile.email, targetProfile.name, profileId);
        if (!ok) return res.status(502).json({ success: false, error: sendErr || 'No se pudo reenviar la invitación.' });
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_investor_deposit_list') {
        const { data } = await supabase.from('investor_deposits')
          .select('*, investors!inner(profile_id, profiles!investors_profile_id_fkey(name, email))')
          .eq('status', 'pending').order('submitted_at', { ascending: true });
        return res.status(200).json({ success: true, deposits: data || [] });
      }

      if (action === 'admin_investor_deposit_review') {
        const { depositId, decision, notes } = body; // decision: 'approved' | 'rejected'
        if (!depositId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ success: false, error: 'depositId y decision válidos requeridos' });
        }
        const update = { status: decision, reviewed_at: new Date().toISOString() };
        if (notes !== undefined) update.admin_notes = notes;
        const { data: updated, error: updErr } = await supabase.from('investor_deposits')
          .update(update).eq('id', depositId).eq('status', 'pending').select();
        if (updErr) return safeError(res, updErr, 'club.js error');
        if (!updated || updated.length === 0) {
          return res.status(400).json({ success: false, error: 'Este comprobante ya fue resuelto.' });
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_investor_deposit_get_document') {
        const { depositId } = body;
        if (!depositId) return res.status(400).json({ success: false, error: 'depositId requerido' });
        const { data: deposit } = await supabase.from('investor_deposits').select('receipt_path').eq('id', depositId).single();
        if (!deposit || !deposit.receipt_path) return res.status(404).json({ success: false, error: 'Este comprobante no tiene archivo.' });
        const { data: signed, error: signErr } = await supabase.storage.from('investor-documents').createSignedUrl(deposit.receipt_path, 300);
        if (signErr) return safeError(res, signErr, 'club.js error');
        return res.status(200).json({ success: true, url: signed.signedUrl });
      }

      if (action === 'admin_investor_set_status') {
        const { investorId, status: newStatus } = body; // 'active' | 'withdrawn' | 'completed'
        if (!investorId || !['active', 'withdrawn', 'completed'].includes(newStatus)) {
          return res.status(400).json({ success: false, error: 'investorId y status válidos requeridos' });
        }
        const { data: investor } = await supabase.from('investors').select('profile_id').eq('id', investorId).single();
        if (!investor) return res.status(404).json({ success: false, error: 'Inversionista no encontrado.' });
        const update = { status: newStatus };
        if (newStatus !== 'active') update.withdrawn_at = new Date().toISOString();
        const { error: updErr } = await supabase.from('investors').update(update).eq('id', investorId);
        if (updErr) return safeError(res, updErr, 'club.js error');
        await supabase.from('profiles').update({ is_investor: newStatus === 'active' }).eq('id', investor.profile_id);
        return res.status(200).json({ success: true });
      }

      if (action === 'admin_investor_send_reminder_email') {
        const { investorId } = body;
        if (!investorId) return res.status(400).json({ success: false, error: 'investorId requerido' });
        const { data: investor } = await supabase.from('investors')
          .select('profiles!investors_profile_id_fkey(name, email)').eq('id', investorId).single();
        const investorEmail = investor?.profiles?.email;
        if (!investorEmail) return res.status(404).json({ success: false, error: 'Inversionista no encontrado o sin email registrado.' });

        const greeting = investor.profiles?.name ? `Hola ${investor.profiles.name},` : 'Hola,';
        const result = await sendBrandedEmail({
          to: investorEmail,
          subject: 'Acción requerida: Actualiza tu aporte en GovBidder Club',
          eyebrow: 'Acción requerida',
          title: 'Actualiza tu aporte en GovBidder Club',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">${greeting}</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">Esperamos que te encuentres muy bien.</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">Nuestros registros muestran que tu aporte mensual en GovBidder Club aparece como <strong>pendiente</strong>.</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#374151;">Si ya realizaste el pago, solo debes subir el comprobante en la sección Investor para que nuestro sistema pueda validar tu aporte y actualizar tu cuenta.</p>`,
          ctaText: 'Ir a Investor',
          ctaUrl: 'https://dboard.govbidderclub.com'
        });
        if (!result.ok) return res.status(502).json({ success: false, error: result.error });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: `Acción admin inválida: ${action}` });
    }

    return res.status(400).json({ success: false, error: `Acción inválida: ${action}` });

  } catch (err) {
    console.error('Club error:', err);
    return safeError(res, err, 'club.js error');
  }
}
