// api/auth.js
// GovBidder Command Center — Auth sobre Supabase (Supabase Auth + tabla profiles)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── HELPERS ───────────────────────────────────────────────
function shapeMember(profile) {
  const out = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    plan: profile.plan,
    planExpiry: profile.plan_expiry,
    industry: profile.industry || '',
    state: profile.state || 'NJ',
    naics: profile.naics || '561720',
    memberSince: profile.member_since,
    avatar: profile.avatar || (profile.name || '').substring(0, 2).toUpperCase(),
    isTrial: profile.is_trial,
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

    // ── START FREE TRIAL (anonymous sign-in) ────────────
    if (action === 'start_trial') {
      let name = 'Guest User', industry = '', state = 'NJ', naics = '561720';

      if (req.method === 'POST' && req.body) {
        name     = req.body.name     || 'Guest User';
        industry = req.body.industry || '';
        state    = req.body.state    || 'NJ';
        naics    = req.body.naics    || '561720';
      }

      const { data, error } = await supabase.auth.signInAnonymously({
        options: { data: { name } }
      });

      if (error || !data.session) {
        return res.status(500).json({ success: false, error: error?.message || 'No se pudo iniciar el trial' });
      }

      // El trigger on_auth_user_created ya creó el profile con defaults de trial.
      // Actualizamos con los datos opcionales que mandó el usuario.
      await supabase.from('profiles')
        .update({ industry, state, naics })
        .eq('id', data.user.id);

      const profile = await getProfile(data.user.id);

      return res.status(200).json({
        success: true,
        token: data.session.access_token,
        member: shapeMember(profile),
        message: 'Trial de 7 días activado. ¡Bienvenido a GovBidder Command Center!'
      });
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
    return res.status(500).json({ success: false, error: err.message });
  }
}
