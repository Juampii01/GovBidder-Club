// api/grants.js
// Backend para Grants.gov — sin CORS desde el servidor

import { createClient } from '@supabase/supabase-js';
import { requireActiveMember } from './_lib/auth.js';
import { safeError } from './_lib/errors.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { error: authErr, status: authStatus } = await requireActiveMember(supabase, req.query.token);
  if (authErr) return res.status(authStatus).json({ success: false, error: authErr });

  try {
    const {
      keyword = 'small business',
      status = 'posted',
      rows = 20
    } = req.query;

    const body = JSON.stringify({
      keyword,
      oppStatuses: status,
      rows: parseInt(rows),
      startRecordNum: 0,
      sortBy: 'openDate|desc',
      eligibilities: ''
    });

    const response = await fetch(
      'https://apply07.grants.gov/grantsws/rest/opportunities/search/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }
    );

    if (!response.ok) {
      throw new Error(`Grants.gov error: HTTP ${response.status}`);
    }

    const data = await response.json();
    const grants = data.oppHits || [];

    return res.status(200).json({
      success: true,
      total: data.hitCount || grants.length,
      grants: grants.map(g => ({
        id: g.id,
        title: g.title,
        agency: g.agencyName,
        oppNumber: g.oppNumber,
        openDate: g.openDate,
        closeDate: g.closeDate,
        awardCeiling: g.awardCeiling,
        awardFloor: g.awardFloor,
        category: g.category,
        synopsis: (g.synopsis || g.description || '').substring(0, 400),
        link: `https://www.grants.gov/search-results-detail/${g.id}`
      }))
    });

  } catch (error) {
        return safeError(res, error, 'Grants.gov error');
  }
}
