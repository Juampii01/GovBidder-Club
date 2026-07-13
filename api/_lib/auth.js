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
