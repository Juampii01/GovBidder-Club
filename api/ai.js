// api/ai.js
// Backend para Claude AI — análisis inteligente

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;

  if (!CLAUDE_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY no configurada en Vercel Environment Variables.'
    });
  }

  try {
    const { prompt, context } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `Eres el AI del GovBidder Command Center, el sistema privado de inteligencia 
de GovBidder Club fundado por Santo González. Eres experto en contratos gubernamentales 
de EE.UU., procurement público, NAICS codes, SAM.gov, USASpending y desarrollo de negocios 
para empresas latinas. Siempre responde en español. Sé conciso, estratégico y accionable. 
Usa bullets (•) y negritas (**). Máximo 200 palabras. 
Contexto del usuario: ${context || 'Plan Legacy, industria Cleaning/Janitorial, New Jersey'}`,
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
    console.error('AI error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
