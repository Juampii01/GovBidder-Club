// api/auth.js
// GovBidder Command Center — Auth sobre Supabase (Supabase Auth + tabla profiles)

import { createClient } from '@supabase/supabase-js';
import { safeError } from './_lib/errors.js';
import { sendInvestorWelcomeEmail } from './_lib/email.js';
import { checkRateLimit } from './_lib/auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── HELPERS ───────────────────────────────────────────────
// Primera + primera letra del último nombre ("Santo González" -> "SG"), no las primeras
// 2 letras del string completo — así coincide con lo que la gente espera ver.
function computeInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shapeMember(profile) {
  const out = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    plan: profile.plan,
    planExpiry: profile.plan_expiry,
    industry: profile.industry || '',
    state: profile.state || '',
    naics: profile.naics || '',
    memberSince: profile.member_since,
    avatar: computeInitials(profile.name),
    avatarPhotoUrl: profile.avatar_photo_path
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/profile-photos/${profile.avatar_photo_path}`
      : '',
    isTrial: profile.is_trial,
    isInvestor: profile.is_investor === true,
    companyName: profile.company_name || '',
    companyDba: profile.company_dba || '',
    ein: profile.ein || '',
    uei: profile.uei || '',
    cageCode: profile.cage_code || '',
    businessAddress: profile.business_address || '',
    companyPhone: profile.company_phone || '',
    companyWebsite: profile.company_website || '',
    cert8a: profile.cert_8a === true,
    certHubzone: profile.cert_hubzone === true,
    certWomenOwned: profile.cert_women_owned === true,
    certVeteranOwned: profile.cert_veteran_owned === true,
    certSmallBusiness: profile.cert_small_business === true,
  };
  if (profile.is_trial) {
    out.trialStart = profile.trial_start;
    out.daysLeft = Math.max(0, Math.ceil((new Date(profile.plan_expiry) - new Date()) / 86400000));
  }
  return out;
}

async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data;
}

async function getProfileByEmail(email) {
  const { data, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) return null;
  return data;
}

function isExpired(profile) {
  return profile.plan_expiry && new Date(profile.plan_expiry) < new Date();
}

// ── MAIN HANDLER ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const action = req.query.action || '';

  try {

    // ── REGISTER (solicitud de membresía — no crea cuenta) ──
    if (action === 'register') {
      const body = (req.method === 'POST' && req.body) ? req.body : {};
      const name    = (body.name    || '').trim();
      const company = (body.company || '').trim();
      const email   = (body.email   || '').trim().toLowerCase();
      const phone   = (body.phone   || '').trim();
      const state   = (body.state   || '').trim();
      const naics   = (body.naics   || '').trim();
      const plan    = (body.plan    || '').trim();
      const message = (body.message || '').trim();
      const isAcademyAlumni = body.isAcademyAlumni === true;

      if (!name || !company || !email) {
        return res.status(400).json({ success: false, error: 'Nombre, empresa y email son requeridos.' });
      }
      if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ success: false, error: 'Email inválido.' });
      }

      const { error: insErr } = await supabase.from('membership_requests').insert({
        name, company, email, phone, state, naics, plan_interest: plan, message, is_academy_alumni: isAcademyAlumni
      });
      if (insErr) return safeError(res, insErr, 'Auth error');

      return res.status(200).json({ success: true, message: 'Solicitud recibida. Te contactaremos en 24-48 horas.' });
    }

    // ── FORGOT PASSWORD (público, sin sesión) ────────────
    // Mismo mecanismo que "Reenviar invitación" de Admin (invite si nunca activó, recovery
    // si ya confirmó pero no recuerda su contraseña), pero autoservicio desde el login.
    // Respuesta genérica siempre — no revela si el email existe (evita enumeración de cuentas).
    if (action === 'forgot_password') {
      const body = (req.method === 'POST' && req.body) ? req.body : {};
      const email = (body.email || '').trim().toLowerCase();
      const genericMsg = 'Si el email está registrado, te enviamos un link para restablecer tu contraseña.';

      if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ success: false, error: 'Ingresá un email válido.' });
      }

      const profile = await getProfileByEmail(email);
      if (profile && profile.active) {
        const { error: rlErr } = await checkRateLimit(supabase, profile.id, 'forgot_password', 20, 30);
        if (rlErr) {
          // Mensaje honesto acá (no genérico): si no le llegó el anterior, "éxito" de nuevo
          // solo lo iba a confundir más. No es un riesgo real de enumeración de cuentas —
          // es un club chico de inversionistas, no un producto público masivo.
          return res.status(200).json({ success: true, message: 'Ya te enviamos un link hace poco — revisá tu casilla (y spam) antes de pedir otro.' });
        }
        await sendInvestorWelcomeEmail(supabase, profile.email, profile.name, profile.id);
      }

      return res.status(200).json({ success: true, message: genericMsg });
    }

    // ── LOGIN (paid members) ────────────────────────────
    if (action === 'login') {
      let email = '', password = '';

      if (req.method === 'POST' && req.body) {
        email    = (req.body.email    || '').trim().toLowerCase();
        password = (req.body.password || '');
      } else {
        email    = (req.query.email    || '').trim().toLowerCase();
        password = (req.query.password || '');
      }

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        return res.status(401).json({ success: false, error: 'Email o contraseña incorrectos.' });
      }

      const profile = await getProfile(data.user.id);
      if (!profile || !profile.active) {
        return res.status(401).json({ success: false, error: 'Miembro no encontrado' });
      }

      if (isExpired(profile)) {
        return res.status(403).json({
          success: false,
          error: 'Tu membresía ha expirado. Renueva en govbidderclub.com',
          expired: true
        });
      }

      return res.status(200).json({
        success: true,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        member: shapeMember(profile)
      });
    }

    // ── SET PASSWORD (primera vez, vía link de invitación/recuperación) ──
    // El access_token viene del hash de la URL que arma el link del email — ya es una
    // sesión válida (Supabase la crea al verificar el link), pero la cuenta todavía no
    // tiene contraseña. La ponemos acá para que de ahí en más funcione el login normal.
    if (action === 'set_password') {
      const body = (req.method === 'POST' && req.body) ? req.body : {};
      const { token, password } = body;

      if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Token y contraseña requeridos.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
      }

      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return res.status(401).json({ success: false, error: 'Link inválido o expirado. Pedí que te reenvíen la invitación.' });
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password });
      if (updateErr) return safeError(res, updateErr, 'Auth error');

      const profile = await getProfile(user.id);
      if (!profile || !profile.active) {
        return res.status(401).json({ success: false, error: 'Miembro no encontrado' });
      }
      if (isExpired(profile)) {
        return res.status(403).json({
          success: false,
          error: profile.is_trial ? 'Tu trial de 7 días ha expirado.' : 'Tu membresía ha expirado.',
          [profile.is_trial ? 'trialExpired' : 'expired']: true
        });
      }

      return res.status(200).json({ success: true, member: shapeMember(profile) });
    }

    // ── REFRESH SESSION (renew an expired/expiring access token) ──
    if (action === 'refresh') {
      let refreshToken = '';
      if (req.method === 'POST' && req.body) refreshToken = req.body.refreshToken || '';

      if (!refreshToken) return res.status(400).json({ success: false, error: 'refreshToken requerido' });

      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) return res.status(401).json({ success: false, error: 'Sesión expirada' });

      const profile = await getProfile(data.user.id);
      if (!profile || !profile.active) {
        return res.status(401).json({ success: false, error: 'Miembro no encontrado' });
      }

      if (isExpired(profile)) {
        return res.status(403).json({
          success: false,
          error: profile.is_trial ? 'Tu trial de 7 días ha expirado.' : 'Tu membresía ha expirado.',
          [profile.is_trial ? 'trialExpired' : 'expired']: true
        });
      }

      return res.status(200).json({
        success: true,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        member: shapeMember(profile)
      });
    }

    // ── VERIFY TOKEN ────────────────────────────────────
    if (action === 'verify') {
      let token = '';
      if (req.method === 'POST' && req.body) token = req.body.token || '';
      else token = req.query.token || '';

      if (!token) return res.status(400).json({ success: false, error: 'Token requerido' });

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ success: false, error: 'Sesión expirada' });

      const profile = await getProfile(user.id);
      if (!profile || !profile.active) {
        return res.status(401).json({ success: false, error: 'Miembro no encontrado' });
      }

      if (isExpired(profile)) {
        return res.status(403).json({
          success: false,
          error: profile.is_trial ? 'Tu trial de 7 días ha expirado.' : 'Tu membresía ha expirado.',
          [profile.is_trial ? 'trialExpired' : 'expired']: true
        });
      }

      return res.status(200).json({ success: true, member: shapeMember(profile) });
    }

    // ── LOGOUT ──────────────────────────────────────────
    if (action === 'logout') {
      let token = '';
      if (req.method === 'POST' && req.body) token = req.body.token || '';
      try { if (token) await supabase.auth.admin.signOut(token); } catch { /* best-effort */ }
      return res.status(200).json({ success: true });
    }

    // ── TEST ────────────────────────────────────────────
    if (action === 'test') {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      return res.status(200).json({
        success: true,
        message: 'Auth API funcionando correctamente (Supabase)',
        members: count ?? 0,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(400).json({ success: false, error: `Acción inválida: ${action}` });

  } catch (err) {
    console.error('Auth error:', err);
    return safeError(res, err, 'Auth error');
  }
}
