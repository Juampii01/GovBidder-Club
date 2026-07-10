// api/spending.js
// Backend para USASpending.gov — Market Intel, Geo, Competitors

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const {
      type = 'market',
      naics = '561720',
      state = 'NJ',
      year = '2024'
    } = req.query;

    const BASE = 'https://api.usaspending.gov/api/v2';
    const timePeriod = [{ start_date: `${year}-01-01`, end_date: `${year}-12-31` }];

    let result = {};

    // ── MARKET INTELLIGENCE ─────────────────────────────
    if (type === 'market') {
      const [awardsRes, geoRes] = await Promise.all([
        fetch(`${BASE}/search/spending_by_award/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filters: {
              time_period: timePeriod,
              naics_codes: [naics],
              award_type_codes: ['A', 'B', 'C', 'D']
            },
            fields: ['Recipient Name', 'Award Amount', 'Awarding Agency Name',
              'Place of Performance State Code', 'Award Date'],
            sort: 'Award Amount',
            order: 'desc',
            limit: 30,
            page: 1
          })
        }),
        fetch(`${BASE}/search/spending_by_geography/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filters: {
              time_period: timePeriod,
              naics_codes: [naics]
            },
            scope: 'place_of_performance',
            geo_layer: 'state'
          })
        })
      ]);

      const awardsData = await awardsRes.json();
      const geoData = await geoRes.json();
      const awards = awardsData.results || [];
      const total = awards.reduce((s, a) => s + Number(a['Award Amount'] || 0), 0);

      const byVendor = {};
      awards.forEach(a => {
        const n = a['Recipient Name'] || 'Unknown';
        if (!byVendor[n]) byVendor[n] = { total: 0, count: 0, agency: '' };
        byVendor[n].total += Number(a['Award Amount'] || 0);
        byVendor[n].count++;
        byVendor[n].agency = a['Awarding Agency Name'] || '—';
      });

      result = {
        type: 'market',
        totalSpend: total,
        contractCount: awards.length,
        topVendors: Object.entries(byVendor)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 10)
          .map(([name, d]) => ({ name, ...d })),
        byState: (geoData.results || [])
          .sort((a, b) => b.aggregated_amount - a.aggregated_amount)
          .slice(0, 10)
          .map(s => ({
            state: s.display_name || s.shape_code,
            code: s.shape_code,
            amount: s.aggregated_amount
          })),
        recentContracts: awards.slice(0, 20).map(a => ({
          recipient: a['Recipient Name'],
          agency: a['Awarding Agency Name'],
          state: a['Place of Performance State Code'],
          amount: Number(a['Award Amount'] || 0),
          date: a['Award Date']
        }))
      };
    }

    // ── GEO / BUYER GEOGRAPHY ───────────────────────────
    else if (type === 'geo') {
      const response = await fetch(`${BASE}/search/spending_by_award/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            time_period: timePeriod,
            naics_codes: [naics],
            place_of_performance_locations: [{ country: 'USA', state }],
            award_type_codes: ['A', 'B', 'C', 'D']
          },
          fields: ['Recipient Name', 'Award Amount', 'Awarding Agency Name',
            'Place of Performance City Name', 'Award Date'],
          sort: 'Award Amount',
          order: 'desc',
          limit: 25,
          page: 1
        })
      });

      const data = await response.json();
      const awards = data.results || [];
      const total = awards.reduce((s, a) => s + Number(a['Award Amount'] || 0), 0);

      result = {
        type: 'geo',
        state, naics, year, total,
        contractCount: awards.length,
        contracts: awards.map(a => ({
          recipient: a['Recipient Name'],
          agency: a['Awarding Agency Name'],
          city: a['Place of Performance City Name'],
          amount: Number(a['Award Amount'] || 0),
          date: a['Award Date']
        }))
      };
    }

    // ── COMPETITORS ─────────────────────────────────────
    else if (type === 'competitors') {
      const response = await fetch(`${BASE}/search/spending_by_award/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            time_period: timePeriod,
            naics_codes: [naics],
            place_of_performance_locations: [{ country: 'USA', state }],
            award_type_codes: ['A', 'B', 'C', 'D']
          },
          fields: ['Recipient Name', 'Award Amount', 'Awarding Agency Name',
            'Place of Performance City Name', 'Award Date'],
          sort: 'Award Amount',
          order: 'desc',
          limit: 50,
          page: 1
        })
      });

      const data = await response.json();
      const awards = data.results || [];

      const byVendor = {};
      awards.forEach(a => {
        const n = a['Recipient Name'] || 'Unknown';
        if (!byVendor[n]) byVendor[n] = { total: 0, count: 0, agencies: new Set(), cities: new Set() };
        byVendor[n].total += Number(a['Award Amount'] || 0);
        byVendor[n].count++;
        if (a['Awarding Agency Name']) byVendor[n].agencies.add(a['Awarding Agency Name']);
        if (a['Place of Performance City Name']) byVendor[n].cities.add(a['Place of Performance City Name']);
      });

      result = {
        type: 'competitors',
        state, naics, year,
        vendors: Object.entries(byVendor)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([name, d]) => ({
            name,
            total: d.total,
            count: d.count,
            topAgency: [...d.agencies][0] || '—',
            cities: [...d.cities].slice(0, 3).join(', ')
          }))
      };
    }

    return res.status(200).json({ success: true, ...result });

  } catch (error) {
    console.error('USASpending error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
