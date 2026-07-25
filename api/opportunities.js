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

// sam.gov y usaspending.gov son federales; cualquier otro dominio (ej. rampla.org)
// se trata como estatal/local — la API de GovBidder Connect no expone un campo nativo de nivel.
const FEDERAL_DOMAINS = new Set(['sam.gov', 'www.sam.gov', 'usaspending.gov', 'www.usaspending.gov']);

function levelOf(link) {
  if (!link) return null;
  try {
    const host = new URL(link).hostname.toLowerCase();
    return FEDERAL_DOMAINS.has(host) ? 'federal' : 'state';
  } catch {
    return null;
  }
}

function mapOpportunity(o, resultType) {
  const { city, state } = parsePlace(o.placeOfPerformance);
  const description = typeof o.description === 'string' && !/^https?:\/\//i.test(o.description)
    ? o.description.substring(0, 800)
    : null;
  return {
    id: o.id,
    resultType,
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
    link: o.officialUrl,
    level: levelOf(o.officialUrl)
  };
}

// La API no expone un "amount" real cuando el monto no fue divulgado — usa un
// valor centinela en vez de null, hay que tratarlo como no disponible.
const UNDISCLOSED_AMOUNT = 999999999999;

function mapAward(o) {
  const amount = (o.amount == null || Number(o.amount) === UNDISCLOSED_AMOUNT) ? null : Number(o.amount);
  return {
    id: o.id,
    resultType: 'awarded',
    title: o.description ? o.description.substring(0, 150) : o.title,
    contractNumber: o.title,
    organization: o.agency?.name || null,
    vendor: o.vendor?.name || null,
    type: 'Award',
    naicsCode: o.naicsCode,
    naicsDescription: null,
    amount,
    awardedDate: o.awardedAt,
    state: null,
    city: null,
    setAside: null,
    description: o.description ? o.description.substring(0, 800) : null,
    link: o.officialUrl,
    level: levelOf(o.officialUrl)
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
      resultType = 'active', // 'all' | 'active' | 'pending_award' | 'awarded'
      level = 'all',         // 'all' | 'federal' | 'state'
      setAside = '',
      minAmount = 0,
      page = 1
    } = body;

    const filterByState = state && state !== 'ALL';
    const filterByLevel = level === 'federal' || level === 'state';
    // Nada queda oculto por un límite artificial: cada request trae una ventana de la
    // fuente upstream y expone hasMore para que el cliente pueda seguir pidiendo
    // páginas hasta agotar TODO el dataset. Cuando filtramos por estado/nivel en
    // memoria (la API upstream no soporta esos filtros) ampliamos la ventana para
    // compensar la merma que deja el filtrado.
    const RAW_PAGE_SIZE = 100;
    const WINDOW = (filterByState || filterByLevel) ? 3 : 1;
    const pageNum = Math.max(1, Number(page) || 1);
    const startPage = (pageNum - 1) * WINDOW + 1;

    const fetchWindow = async (endpoint, extraParams) => {
      const fetchPage = async (p) => {
        const params = new URLSearchParams({ naics, perPage: String(RAW_PAGE_SIZE), page: String(p), ...extraParams });
        if (keyword) params.set('q', keyword);
        const response = await fetch(`https://www.govbidderconnect.com/api/v1/${endpoint}?${params}`, {
          headers: { Authorization: `Bearer ${GBC_KEY}` }
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`GovBidder Connect error ${response.status}: ${errText.substring(0, 200)}`);
        }
        return response.json();
      };
      const pages = await Promise.all(Array.from({ length: WINDOW }, (_, i) => fetchPage(startPage + i)));
      const seen = new Set();
      const items = [];
      for (const pg of pages) {
        for (const item of pg.items || []) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          items.push(item);
        }
      }
      const total = pages[0]?.total || items.length;
      const totalRawPages = Math.ceil(total / RAW_PAGE_SIZE);
      const hasMore = (startPage + WINDOW - 1) < totalRawPages;
      return { items, total, hasMore };
    };

    const loadActive = async () => {
      const r = await fetchWindow('opportunities', { status: 'ACTIVE' });
      return { ...r, items: r.items.map(o => mapOpportunity(o, 'active')) };
    };
    const loadPendingAward = async () => {
      const r = await fetchWindow('opportunities', { status: 'EXPIRED' });
      return { ...r, items: r.items.map(o => mapOpportunity(o, 'pending_award')) };
    };
    const loadAwarded = async () => {
      const r = await fetchWindow('awards', {});
      return { ...r, items: r.items.map(mapAward) };
    };

    let opportunities = [];
    let total = 0;
    let hasMore = false;
    if (resultType === 'all') {
      const results = await Promise.all([loadActive(), loadPendingAward(), loadAwarded()]);
      for (const r of results) { opportunities.push(...r.items); total += r.total; }
      hasMore = results.some(r => r.hasMore);
    } else if (resultType === 'pending_award') {
      const r = await loadPendingAward();
      opportunities = r.items; total = r.total; hasMore = r.hasMore;
    } else if (resultType === 'awarded') {
      const r = await loadAwarded();
      opportunities = r.items; total = r.total; hasMore = r.hasMore;
    } else {
      const r = await loadActive();
      opportunities = r.items; total = r.total; hasMore = r.hasMore;
    }

    // Los awards no traen placeOfPerformance, así que el filtro de estado solo
    // aplica a oportunidades activas / pending award.
    if (filterByState) {
      opportunities = opportunities.filter(o => o.resultType === 'awarded' || o.state === state);
    }
    if (filterByLevel) {
      opportunities = opportunities.filter(o => o.level === level);
    }
    if (setAside) {
      const needle = setAside.toLowerCase();
      opportunities = opportunities.filter(o => (o.setAside || '').toLowerCase().includes(needle));
    }
    if (minAmount > 0) {
      opportunities = opportunities.filter(o => o.resultType !== 'awarded' || (o.amount != null && o.amount >= minAmount));
    }

    return res.status(200).json({ success: true, total, opportunities, hasMore, page: pageNum });

  } catch (error) {
        return safeError(res, error, 'GovBidder Connect error');
  }
}
