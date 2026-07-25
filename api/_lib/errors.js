// api/_lib/errors.js
// Evita filtrar mensajes internos de Postgres/fetch al cliente (nombres de columnas,
// constraints, stack de terceros) — loguea el detalle real server-side y devuelve un
// mensaje genérico y seguro al cliente.
export function safeError(res, err, context) {
  console.error(`${context}:`, err?.message || err);
  return res.status(500).json({ success: false, error: 'Ocurrió un error interno. Si el problema persiste, contactá a soporte.' });
}
