// api/ai.js
// Backend para Claude AI — análisis inteligente

import { createClient } from '@supabase/supabase-js';
import { requireActiveMember, checkRateLimit } from './_lib/auth.js';
import { safeError } from './_lib/errors.js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } from './_lib/env.js';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Cada feature define su propio largo de respuesta y presupuesto de tokens — un solo
// techo universal (200 palabras) le quedaba corto a un informe de Market Intelligence
// y largo a una explicación de una frase del match score.
const FEATURE_PROFILES = {
  opp_summary:                { maxTokens: 300,  length: 'Máximo 60 palabras, 2-3 oraciones, sin bullets.' },
  match_score_explain:        { maxTokens: 200,  length: 'Una sola oración, máximo 40 palabras, sin bullets.' },
  alliance_consistency_check: { maxTokens: 300,  length: 'Máximo 2-3 oraciones, sin bullets.' },
  admin_ticket_suggest:       { maxTokens: 500,  length: 'Máximo 4-5 oraciones, sin bullets (es un mensaje directo al miembro).' },
  admin_ops_summary:          { maxTokens: 500,  length: 'Máximo 5 puntos con bullets.' },
  naics_tip:                  { maxTokens: 500,  length: 'Máximo 150 palabras, bullets.' },
  naics_suggest:              { maxTokens: 150,  length: 'Solo la lista pedida, sin texto adicional.' },
  home:                       { maxTokens: 900,  length: 'Máximo 200 palabras, bullets y negritas.' },
  opps:                       { maxTokens: 700,  length: 'Máximo 180 palabras, bullets.' },
  grants:                     { maxTokens: 700,  length: 'Máximo 180 palabras, bullets.' },
  market:                     { maxTokens: 1500, length: 'Hasta 400 palabras — es un informe, no un resumen breve. Bullets y negritas, con secciones separadas para tendencias, compradores principales y oportunidad concreta.' },
  compete:                    { maxTokens: 1500, length: 'Hasta 400 palabras — es un informe, no un resumen breve. Bullets y negritas, con secciones separadas para competidores, participación de mercado y diferenciación.' },
};
const DEFAULT_AI_PROFILE = { maxTokens: 800, length: 'Máximo 200 palabras, bullets y negritas.' };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, feature } = req.body || {};
  const { error: authErr, status: authStatus, profile } = await requireActiveMember(supabase, token);
  if (authErr) return res.status(authStatus).json({ success: false, error: authErr });

  // Los usos pesados de un admin (ej. sugerir respuestas de tickets en cadena) no deben
  // comerle la cuota de IA a los miembros — cada `feature` tiene su propio balde.
  const rateLimitAction = feature ? `ai_prompt:${feature}` : 'ai_prompt';
  const { error: rlErr, status: rlStatus } = await checkRateLimit(supabase, profile.id, rateLimitAction, 30, 60);
  if (rlErr) return res.status(rlStatus).json({ success: false, error: rlErr });

  const CLAUDE_KEY = ANTHROPIC_API_KEY;

  if (!CLAUDE_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY no configurada en Vercel Environment Variables.'
    });
  }

  try {
    const { prompt, context } = req.body;
    const aiProfile = FEATURE_PROFILES[feature] || DEFAULT_AI_PROFILE;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: aiProfile.maxTokens,
        system: `Eres el AI del GovBidder Command Center, el sistema privado de inteligencia
de GovBidder Club fundado por Santo González. Eres experto en contratos gubernamentales
de EE.UU., procurement público, NAICS codes, SAM.gov, USASpending y desarrollo de negocios
para empresas latinas. Siempre responde en español. Sé conciso, estratégico y accionable.
Ancla siempre tus afirmaciones en los datos concretos que te paso en el contexto y el prompt
(cifras, nombres de agencias/compradores/vendors, códigos, fechas, montos) — nunca generalices
ni "hables por hablar": una respuesta corta con datos reales vale más que una larga con relleno
genérico que serviría igual para cualquier NAICS o cualquier usuario. Si te falta un dato
concreto para responder con precisión, decilo explícitamente en vez de inventarlo.
${aiProfile.length}
Nunca des asesoramiento financiero o de inversión personalizado, nunca recomiendes aprobar
o rechazar una solicitud de financiamiento, y nunca afirmes una determinación legal de
elegibilidad — esas decisiones son del usuario o de un profesional matriculado.
Contexto del usuario: ${context || 'miembro de GovBidder Club'}`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.content?.map(i => i.text || '').join('') || 'Sin respuesta.';

    return res.status(200).json({ success: true, response: text });

  } catch (error) {
        return safeError(res, error, 'AI error');
  }
}
