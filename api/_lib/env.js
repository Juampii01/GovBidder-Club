// api/_lib/env.js
// Punto único de lectura de variables de entorno. Todas se devuelven trimeadas —
// RESEND_FROM_EMAIL y después SUPABASE_URL rompieron en producción por un \n al final
// guardado en Vercel, encontrado ambas veces por casualidad al fallar algo aguas abajo.
// Las que la app no puede funcionar sin (Supabase) fallan ruidosamente al importarse.
// Las que ya degradaban con gracia hoy (claves de features opcionales: IA, GBC, Resend)
// se mantienen opcionales acá también — convertirlas en obligatorias rompería esa
// degradación existente si alguna no está configurada en un momento dado.

function requireEnv(name) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return String(raw).trim();
}

function requireUrlEnv(name) {
  const value = requireEnv(name);
  try { new URL(value); } catch {
    throw new Error(`La variable de entorno ${name} no es una URL válida: "${value}"`);
  }
  return value;
}

function optionalEnv(name, fallback = '') {
  const raw = process.env[name];
  const trimmed = raw == null ? '' : String(raw).trim();
  return trimmed === '' ? fallback : trimmed;
}

export const SUPABASE_URL = requireUrlEnv('SUPABASE_URL');
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

export const ANTHROPIC_API_KEY = optionalEnv('ANTHROPIC_API_KEY');
export const GBC_API_KEY = optionalEnv('GBC_API_KEY');
export const RESEND_API_KEY = optionalEnv('RESEND_API_KEY');
export const RESEND_FROM_EMAIL = optionalEnv('RESEND_FROM_EMAIL', 'GovBidder Club <onboarding@resend.dev>');
