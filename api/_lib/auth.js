// api/_lib/auth.js
// Validación de sesión + membresía compartida entre api/club.js, api/ai.js y api/opportunities.js.

export function isExpired(profile) {
  return profile.plan_expiry && new Date(profile.plan_expiry) < new Date();
}

// Valida token de Supabase Auth + que el perfil esté activo y la membresía no haya expirado.
// Devuelve { profile } o { error, status }.
export async function requireActiveMember(supabase, token) {
  if (!token) return { error: 'Token requerido', status: 400 };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Sesión expirada', status: 401 };
  const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (pErr || !profile || !profile.active) return { error: 'Miembro no encontrado', status: 401 };
  if (isExpired(profile)) return { error: 'Tu membresía ha expirado. Renueva en govbidderclub.com', status: 403 };
  return { profile };
}

// Límite de uso por miembro para endpoints costosos (ej. IA). Usa la función atómica
// check_rate_limit() de Postgres (insert..on conflict en una sola sentencia) para evitar
// race conditions entre requests concurrentes del mismo miembro.
export async function checkRateLimit(supabase, profileId, action, maxCount, windowMinutes) {
  const { data: allowed, error } = await supabase.rpc('check_rate_limit', {
    p_profile_id: profileId, p_action: action, p_max_count: maxCount, p_window_minutes: windowMinutes
  });
  if (error) return { error: 'No se pudo verificar el límite de uso.', status: 500 };
  if (!allowed) return { error: `Alcanzaste el límite de ${maxCount} usos cada ${windowMinutes} minutos. Probá de nuevo más tarde.`, status: 429 };
  return {};
}
