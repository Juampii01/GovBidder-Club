// api/codes.js
// NAICS Intelligence — Cross-reference completo de códigos
// Datos en Supabase: naics_codes (con descripción oficial del manual NAICS 2022 +
// SIC/PSC/UNSPSC/NIGP) y naics_alt_terms (índice alfabético de términos coloquiales).

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CODE_FIELDS = 'code, title, sector, sic, psc, unspsc, nigp';

function toResult(row, matchedTerm) {
  return {
    naics: row.code,
    title: row.title,
    sector: row.sector,
    sic: row.sic || 'N/D',
    psc: row.psc || 'N/D',
    unspsc: row.unspsc || 'N/D',
    nigp: row.nigp || 'N/D',
    ...(matchedTerm ? { matchedTerm } : {}),
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { query = '', type = 'search' } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Query parameter required' });
    }

    const q = query.trim();

    // ── SEARCH ────────────────────────────────────────────
    if (type === 'search') {
      const pattern = `%${q}%`;

      const [byCode, byTitle, bySector] = await Promise.all([
        supabase.from('naics_codes').select(CODE_FIELDS).ilike('code', pattern).limit(20),
        supabase.from('naics_codes').select(CODE_FIELDS).ilike('title', pattern).limit(20),
        supabase.from('naics_codes').select(CODE_FIELDS).ilike('sector', pattern).limit(20),
      ]);
      for (const r of [byCode, byTitle, bySector]) if (r.error) throw r.error;

      const results = [];
      const seen = new Set();
      for (const row of [...byCode.data, ...byTitle.data, ...bySector.data]) {
        if (seen.has(row.code)) continue;
        seen.add(row.code);
        results.push(toResult(row));
        if (results.length >= 20) break;
      }

      if (results.length < 20) {
        const { data: termMatches, error: termErr } = await supabase
          .from('naics_alt_terms')
          .select(`term, naics_codes (${CODE_FIELDS})`)
          .ilike('term_lower', pattern.toLowerCase())
          .limit(30);
        if (termErr) throw termErr;

        for (const t of termMatches || []) {
          const row = t.naics_codes;
          if (!row || seen.has(row.code)) continue;
          seen.add(row.code);
          results.push(toResult(row, t.term));
          if (results.length >= 20) break;
        }
      }

      return res.status(200).json({
        success: true,
        count: results.length,
        results
      });
    }

    // ── CROSSWALK — Get all codes for a NAICS ─────────────
    if (type === 'crosswalk') {
      const code = q;

      let { data: row, error: exactErr } = await supabase
        .from('naics_codes')
        .select('*')
        .eq('code', code)
        .maybeSingle();
      if (exactErr) throw exactErr;

      if (!row) {
        const { data: prefixMatches, error: prefixErr } = await supabase
          .from('naics_codes')
          .select('*')
          .like('code', `${code}%`)
          .limit(1);
        if (prefixErr) throw prefixErr;
        row = prefixMatches && prefixMatches[0];
      }

      if (!row) {
        return res.status(404).json({
          success: false,
          error: `NAICS code ${code} not found in database`
        });
      }

      return res.status(200).json({
        success: true,
        naics: row.code,
        title: row.title,
        sector: row.sector,
        description: row.description || null,
        illustrative_examples: row.illustrative_examples || null,
        cross_references: row.cross_references || null,
        codes: {
          naics: { code: row.code, label: 'North American Industry Classification System', title: row.title },
          sic:   { code: row.sic, label: 'Standard Industrial Classification', title: getSICTitle(row.sic) },
          psc:   { code: row.psc, label: 'Product Service Code (Federal)', title: getPSCTitle(row.psc) },
          unspsc:{ code: row.unspsc, label: 'UN Standard Products & Services Code', title: getUNSPSCTitle(row.unspsc) },
          nigp:  { code: row.nigp || 'Contact NIGP', label: 'National Institute of Governmental Purchasing', title: row.nigp ? 'See NIGP catalog' : 'License required for full access' },
        }
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid type. Use search or crosswalk' });

  } catch (error) {
    console.error('Codes error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── HELPER LABELS ────────────────────────────────────────
function getSICTitle(sic) {
  const SIC_LABELS = {
    "7349": "Services to Buildings & Dwellings", "7389": "Services-Misc Business Services",
    "8711": "Engineering Services", "8712": "Architectural Services", "8721": "Accounting Services",
    "8742": "Management Consulting Services", "7371": "Computer Programming Services",
    "7373": "Computer Integrated Systems Design", "7374": "Computer Processing & Data Prep",
    "7379": "Services-Computer Maintenance & Repair", "1542": "General Building Contractors-Industrial",
    "1731": "Electrical Work", "1711": "Plumbing, Heating, Air Conditioning",
    "5812": "Eating Places", "4213": "Trucking Except Local", "8062": "General Medical Hospitals",
    "8211": "Elementary & Secondary Schools", "8221": "Colleges, Universities",
    "7382": "Home Security Services", "4953": "Refuse Systems", "6022": "State Commercial Banks",
    "6311": "Life Insurance", "6331": "Fire, Marine & Casualty Insurance", "5411": "Grocery Stores",
    "0782": "Lawn & Garden Services", "7217": "Carpet & Upholstery Cleaning",
    "7342": "Disinfecting & Pest Control Services", "7361": "Help Supply Services",
    "7363": "Labor Contractors", "0742": "Veterinary Services", "5912": "Drug Stores",
    "4512": "Air Transportation, Scheduled", "4212": "Local Trucking Without Storage",
    "1521": "Single-Family Housing Construction", "1522": "Apartment Building Construction",
    "8011": "Offices & Clinics of Doctors of Medicine", "8051": "Skilled Nursing Care Facilities",
    "8322": "Individual & Family Social Services", "8351": "Child Day Care Services",
  };
  if (!sic) return 'No disponible en esta base todavía';
  return SIC_LABELS[sic] || `SIC ${sic}`;
}

function getPSCTitle(psc) {
  const PSC_LABELS = {
    "S201": "Housekeeping & Custodial Services", "S206": "Guard Services",
    "S209": "Food Services", "S210": "Landscaping/Groundskeeping",
    "S216": "Refuse Disposal Services", "D301": "IT Programming Services",
    "D302": "IT Systems Analysis & Design", "D304": "IT Telecomm & Transmission",
    "D307": "IT IT and Telecom - Other", "D399": "IT Other",
    "R408": "Program Management/Support", "R425": "Engineering & Technical Services",
    "R601": "Advertising", "R606": "Translation Services",
    "U099": "Education & Training", "Q201": "Medical Services",
    "V119": "Transportation by Motor Vehicle", "V112": "Air Transportation",
    "V201": "Lodging - Hotel/Motel", "V501": "Storage",
    "V601": "Mail & Messaging Services", "Y1CA": "Construction of Office Buildings",
    "Y1DA": "Construction of Residential Buildings", "Y1AA": "Construction - Other",
    "Y1GA": "Construction of Electrical Systems", "Y1HA": "Construction HVAC",
    "Y1MA": "Construction of Highways & Roads", "J063": "Maintenance of Utilities",
    "J065": "Maintenance of Motor Vehicles", "J069": "Maintenance - Other",
    "X1AA": "Lease/Rental of Buildings", "F108": "Environmental Remediation",
    "R706": "Financial & Business Services", "7030": "Software",
    "7110": "Furniture", "7510": "Office Supplies", "6505": "Drugs & Biologicals",
    "8010": "Paints & Painting Equipment", "5510": "Lumber & Millwork",
    "8305": "Clothing", "8430": "Footwear", "4820": "Plumbing Fixtures",
    "9140": "Fuel Oils", "3810": "Agricultural Equipment",
    "2310": "Ground Effect Vehicles, Motor Vehicles", "1900": "Ships, Boats",
  };
  if (!psc) return 'No disponible en esta base todavía';
  return PSC_LABELS[psc] || `PSC ${psc}`;
}

function getUNSPSCTitle(unspsc) {
  const UNSPSC_LABELS = {
    "76111501": "Janitorial services", "76111502": "Carpet cleaning services",
    "76111503": "Building maintenance services", "76121500": "Grounds maintenance",
    "76111600": "Pest control", "80141500": "Administrative support",
    "81111700": "Programming services", "81111800": "Computer systems design",
    "81112000": "IT support services", "72131500": "Building construction",
    "72132400": "Electrical work", "72132500": "Plumbing services",
    "90101500": "Food and catering services", "78101800": "Local freight transport",
    "85101500": "Medical practice", "86101500": "Elementary education",
    "86101700": "University education", "80161600": "Security guard services",
    "77101500": "Environmental remediation", "84121500": "Banking services",
    "84141500": "Insurance services", "82101500": "Advertising services",
    "80111500": "Legal services", "84111500": "Accounting services",
    "81141500": "Research services", "93141500": "Employment services",
    "78102100": "Air transport", "78111500": "Vehicle rental",
    "78141500": "Warehousing", "55101500": "Books",
    "44121500": "Office supplies", "52141500": "Appliances",
    "53101500": "Men's clothing", "10151500": "Grain crops",
  };
  if (!unspsc) return 'No disponible en esta base todavía';
  return UNSPSC_LABELS[unspsc] || `UNSPSC ${unspsc}`;
}
