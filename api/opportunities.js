// api/opportunities.js
// Backend para GovBidder Connect — Oportunidades de contratos gubernamentales

import { createClient } from '@supabase/supabase-js';
import { requireActiveMember } from './_lib/auth.js';
import { safeError } from './_lib/errors.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const US_STATE_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'
};

// "Los Angeles, CA" / "Los Angeles, California" → { city, state }
function parsePlace(place) {
  if (!place || typeof place !== 'string') return { city: null, state: null };
  const parts = place.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: parts[0] || null, state: null };
  const city = parts.slice(0, -1).join(', ');
  const rawState = parts[parts.length - 1];
  const state = rawState.length === 2 ? rawState.toUpperCase() : (US_STATE_ABBR[rawState.toLowerCase()] || rawState);
  return { city, state };
}

function mapOpportunity(o) {
  const { city, state } = parsePlace(o.placeOfPerformance);
  const description = typeof o.description === 'string' && !/^https?:\/\//i.test(o.description)
    ? o.description.substring(0, 800)
    : null;
  return {
    id: o.id,
    title: o.title,
    organization: o.agency?.name || null,
    type: o.noticeType,
    naicsCode: o.naicsCode,
    naicsDescription: null,
    deadline: o.dueAt,
    postedDate: o.postedAt,
    state,
    city,
    setAside: o.setAside,
    description,
    link: o.officialUrl
  };
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const body = (req.method === 'POST' && req.body) ? req.body : {};
  const { error: authErr, status: authStatus } = await requireActiveMember(supabase, body.token);
  if (authErr) return res.status(authStatus).json({ success: false, error: authErr });

  const GBC_KEY = process.env.GBC_API_KEY;

  if (!GBC_KEY) {
    return res.status(500).json({
      error: 'GBC_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables.'
    });
  }

  try {
    const {
      keyword = '',
      state = 'NJ',
      naics = '561720',
      limit = 60
    } = body;

    const filterByState = state && state !== 'ALL';
    // La API de GovBidder Connect no soporta filtro por estado — traemos un lote más
    // grande y filtramos placeOfPerformance en memoria cuando se pide un estado puntual.
    const fetchLimit = filterByState ? Math.max(limit * 4, 100) : limit;

    // GovBidder Connect ignora cualquier parámetro de tamaño de página (limit/perPage/
    // pageSize probados) y siempre devuelve 20 resultados por página — paginamos en
    // paralelo para juntar los que hagan falta, con un techo razonable de páginas.
    const PAGE_SIZE = 20;
    const pagesNeeded = Math.min(Math.ceil(fetchLimit / PAGE_SIZE), 10);

    const fetchPage = async (page) => {
      const params = new URLSearchParams({ naics, status: 'ACTIVE', page: String(page) });
      if (keyword) params.set('q', keyword);
      const response = await fetch(`https://www.govbidderconnect.com/api/v1/opportunities?${params}`, {
        headers: { Authorization: `Bearer ${GBC_KEY}` }
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`GovBidder Connect error ${response.status}: ${errText.substring(0, 200)}`);
      }
      return response.json();
    };

    const pages = await Promise.all(Array.from({ length: pagesNeeded }, (_, i) => fetchPage(i + 1)));
    const seen = new Set();
    let opportunities = [];
    for (const page of pages) {
      for (const item of page.items || []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        opportunities.push(mapOpportunity(item));
      }
    }
    let total = pages[0]?.total || opportunities.length;

    if (filterByState) {
      opportunities = opportunities.filter(o => o.state === state);
      total = opportunities.length;
    }
    opportunities = opportunities.slice(0, limit);

    return res.status(200).json({ success: true, total, opportunities });

  } catch (error) {
        return safeError(res, error, 'GovBidder Connect error');
  }
}
