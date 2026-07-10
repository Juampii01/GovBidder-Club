// api/opportunities.js
// Backend para SAM.gov — Oportunidades de contratos gubernamentales

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const SAM_KEY = process.env.SAM_API_KEY;

  if (!SAM_KEY) {
    return res.status(500).json({
      error: 'SAM_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables.'
    });
  }

  try {
    const {
      keyword = 'janitorial',
      state = 'NJ',
      naics = '561720',
      limit = 25
    } = req.query;

    // Fechas: últimos 90 días
    const now = new Date();
    const from = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const fmt = d =>
      `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

    const params = new URLSearchParams({
      api_key: SAM_KEY,
      keyword,
      naicsCode: naics,
      postedFrom: fmt(from),
      postedTo: fmt(now),
      limit,
      offset: 0
    });

    if (state && state !== 'ALL') {
      params.set('placeOfPerformanceState', state);
    }

    const url = `https://api.sam.gov/opportunities/v2/search?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SAM.gov error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      total: data.totalRecords || 0,
      opportunities: (data.opportunitiesData || []).map(o => ({
        id: o.noticeId,
        title: o.title,
        organization: o.fullParentPathName || o.organizationName,
        type: o.type || o.baseType,
        naicsCode: o.naicsCode,
        naicsDescription: o.naicsDescription,
        deadline: o.responseDeadLine,
        postedDate: o.postedDate,
        state: o.placeOfPerformance?.state?.name || o.placeOfPerformance?.state?.code,
        city: o.placeOfPerformance?.city?.name,
        setAside: o.setAside,
        description: o.description?.substring(0, 800),
        link: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`
      }))
    });

  } catch (error) {
    console.error('SAM.gov error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
