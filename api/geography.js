// api/geography.js
// Buyer Geography — 50 States + Counties + Cities + School Districts + Colleges

// ── 50 STATES COMPLETE DATABASE ──────────────────────────
const STATES = {
  AL: { name: "Alabama",        capital: "Montgomery",    region: "South",     procurement: "https://purchasing.alabama.gov",         samUrl: "AL" },
  AK: { name: "Alaska",         capital: "Juneau",        region: "West",      procurement: "https://aws.state.ak.us/OnlineVendorReg", samUrl: "AK" },
  AZ: { name: "Arizona",        capital: "Phoenix",       region: "West",      procurement: "https://spo.az.gov",                     samUrl: "AZ" },
  AR: { name: "Arkansas",       capital: "Little Rock",   region: "South",     procurement: "https://www.dfa.arkansas.gov/offices/procurement", samUrl: "AR" },
  CA: { name: "California",     capital: "Sacramento",    region: "West",      procurement: "https://www.caleprocure.ca.gov",         samUrl: "CA" },
  CO: { name: "Colorado",       capital: "Denver",        region: "West",      procurement: "https://www.colorado.gov/pacific/oit/colorado-vendor-self-service", samUrl: "CO" },
  CT: { name: "Connecticut",    capital: "Hartford",      region: "Northeast", procurement: "https://www.biznet.ct.gov",              samUrl: "CT" },
  DE: { name: "Delaware",       capital: "Dover",         region: "Northeast", procurement: "https://bidcondocs.delaware.gov",        samUrl: "DE" },
  FL: { name: "Florida",        capital: "Tallahassee",   region: "South",     procurement: "https://www.myfloridamarketplace.com",   samUrl: "FL" },
  GA: { name: "Georgia",        capital: "Atlanta",       region: "South",     procurement: "https://ssl.doas.state.ga.us/PRSapp",    samUrl: "GA" },
  HI: { name: "Hawaii",         capital: "Honolulu",      region: "West",      procurement: "https://hands.ehawaii.gov",              samUrl: "HI" },
  ID: { name: "Idaho",          capital: "Boise",         region: "West",      procurement: "https://purchasing.idaho.gov",           samUrl: "ID" },
  IL: { name: "Illinois",       capital: "Springfield",   region: "Midwest",   procurement: "https://www2.illinois.gov/cms/business/sell2/Pages/default.aspx", samUrl: "IL" },
  IN: { name: "Indiana",        capital: "Indianapolis",  region: "Midwest",   procurement: "https://www.in.gov/idoa/procurement",    samUrl: "IN" },
  IA: { name: "Iowa",           capital: "Des Moines",    region: "Midwest",   procurement: "https://bidopportunities.iowa.gov",      samUrl: "IA" },
  KS: { name: "Kansas",         capital: "Topeka",        region: "Midwest",   procurement: "https://admin.ks.gov/offices/procurement-and-contracts", samUrl: "KS" },
  KY: { name: "Kentucky",       capital: "Frankfort",     region: "South",     procurement: "https://eProcurement.ky.gov",            samUrl: "KY" },
  LA: { name: "Louisiana",      capital: "Baton Rouge",   region: "South",     procurement: "https://wwwcfprd.doa.louisiana.gov/osp/lapac/pubmain.cfm", samUrl: "LA" },
  ME: { name: "Maine",          capital: "Augusta",       region: "Northeast", procurement: "https://www.maine.gov/dafs/bbm/procurementservices", samUrl: "ME" },
  MD: { name: "Maryland",       capital: "Annapolis",     region: "Northeast", procurement: "https://emaryland.buyspeed.com",         samUrl: "MD" },
  MA: { name: "Massachusetts",  capital: "Boston",        region: "Northeast", procurement: "https://www.commbuys.com",               samUrl: "MA" },
  MI: { name: "Michigan",       capital: "Lansing",       region: "Midwest",   procurement: "https://sigma.michigan.gov",             samUrl: "MI" },
  MN: { name: "Minnesota",      capital: "St. Paul",      region: "Midwest",   procurement: "https://mn.gov/admin/supplier",          samUrl: "MN" },
  MS: { name: "Mississippi",    capital: "Jackson",       region: "South",     procurement: "https://www.dfa.ms.gov/dfa-offices/personal-service-contract-review-board", samUrl: "MS" },
  MO: { name: "Missouri",       capital: "Jefferson City", region: "Midwest",  procurement: "https://oa.mo.gov/purchasing",           samUrl: "MO" },
  MT: { name: "Montana",        capital: "Helena",        region: "West",      procurement: "https://vendor.mt.gov",                  samUrl: "MT" },
  NE: { name: "Nebraska",       capital: "Lincoln",       region: "Midwest",   procurement: "https://das.nebraska.gov/materiel/purchasing.html", samUrl: "NE" },
  NV: { name: "Nevada",         capital: "Carson City",   region: "West",      procurement: "https://purchasing.nv.gov",              samUrl: "NV" },
  NH: { name: "New Hampshire",  capital: "Concord",       region: "Northeast", procurement: "https://www.das.nh.gov/purchasing",      samUrl: "NH" },
  NJ: { name: "New Jersey",     capital: "Trenton",       region: "Northeast", procurement: "https://www.njstart.gov",                samUrl: "NJ" },
  NM: { name: "New Mexico",     capital: "Santa Fe",      region: "West",      procurement: "https://www.generalservices.state.nm.us/state-purchasing", samUrl: "NM" },
  NY: { name: "New York",       capital: "Albany",        region: "Northeast", procurement: "https://www.ogs.ny.gov/procurement",     samUrl: "NY" },
  NC: { name: "North Carolina", capital: "Raleigh",       region: "South",     procurement: "https://www.ips.state.nc.us",            samUrl: "NC" },
  ND: { name: "North Dakota",   capital: "Bismarck",      region: "Midwest",   procurement: "https://www.nd.gov/omb/public/vendor-information", samUrl: "ND" },
  OH: { name: "Ohio",           capital: "Columbus",      region: "Midwest",   procurement: "https://procure.ohio.gov",               samUrl: "OH" },
  OK: { name: "Oklahoma",       capital: "Oklahoma City", region: "South",     procurement: "https://www.ok.gov/DCS/Central_Purchasing", samUrl: "OK" },
  OR: { name: "Oregon",         capital: "Salem",         region: "West",      procurement: "https://oregon.gov/das/Procurement",     samUrl: "OR" },
  PA: { name: "Pennsylvania",   capital: "Harrisburg",    region: "Northeast", procurement: "https://www.pasupplierportal.state.pa.us", samUrl: "PA" },
  RI: { name: "Rhode Island",   capital: "Providence",    region: "Northeast", procurement: "https://www.ridop.ri.gov",               samUrl: "RI" },
  SC: { name: "South Carolina", capital: "Columbia",      region: "South",     procurement: "https://procurement.sc.gov",             samUrl: "SC" },
  SD: { name: "South Dakota",   capital: "Pierre",        region: "Midwest",   procurement: "https://bop.sd.gov",                    samUrl: "SD" },
  TN: { name: "Tennessee",      capital: "Nashville",     region: "South",     procurement: "https://www.tn.gov/generalservices/procurement.html", samUrl: "TN" },
  TX: { name: "Texas",          capital: "Austin",        region: "South",     procurement: "https://www.txsmartbuy.com",             samUrl: "TX" },
  UT: { name: "Utah",           capital: "Salt Lake City", region: "West",     procurement: "https://purchasing.utah.gov",            samUrl: "UT" },
  VT: { name: "Vermont",        capital: "Montpelier",    region: "Northeast", procurement: "https://bgs.vermont.gov/purchasing",     samUrl: "VT" },
  VA: { name: "Virginia",       capital: "Richmond",      region: "South",     procurement: "https://eva.virginia.gov",               samUrl: "VA" },
  WA: { name: "Washington",     capital: "Olympia",       region: "West",      procurement: "https://des.wa.gov/services/contracting-purchasing", samUrl: "WA" },
  WV: { name: "West Virginia",  capital: "Charleston",    region: "South",     procurement: "https://vendor.wvoepa.com",              samUrl: "WV" },
  WI: { name: "Wisconsin",      capital: "Madison",       region: "Midwest",   procurement: "https://vendornet.wi.gov",               samUrl: "WI" },
  WY: { name: "Wyoming",        capital: "Cheyenne",      region: "West",      procurement: "https://ai.wyo.gov/divisions/purchasing", samUrl: "WY" },
  DC: { name: "Washington DC",  capital: "Washington",    region: "Northeast", procurement: "https://contracts.dc.gov",               samUrl: "DC" },
  PR: { name: "Puerto Rico",    capital: "San Juan",      region: "Territory", procurement: "https://www.ogp.pr.gov",                 samUrl: "PR" },
};

// ── TOP SCHOOL DISTRICTS BY STATE ────────────────────────
const TOP_SCHOOL_DISTRICTS = {
  NJ: [
    { name: "Newark Public Schools",          city: "Newark",        students: 36000, portal: "https://www.nps.k12.nj.us" },
    { name: "Jersey City Public Schools",     city: "Jersey City",   students: 28000, portal: "https://www.jcboe.org" },
    { name: "Paterson School District",       city: "Paterson",      students: 26000, portal: "https://www.paterson.k12.nj.us" },
    { name: "Elizabeth Public Schools",       city: "Elizabeth",     students: 24000, portal: "https://www.epsnj.org" },
    { name: "Middlesex County School Dist.",  city: "Edison",        students: 22000, portal: "https://www.middlesexregional.org" },
    { name: "Trenton Public Schools",         city: "Trenton",       students: 12000, portal: "https://www.trenton.k12.nj.us" },
    { name: "South Brunswick School Dist.",   city: "Monmouth Jct.", students: 8500,  portal: "https://www.sbschools.org" },
    { name: "Woodbridge Township Schools",    city: "Woodbridge",    students: 9200,  portal: "https://www.woodbridge.k12.nj.us" },
  ],
  NY: [
    { name: "NYC Dept. of Education",         city: "New York",      students: 1100000, portal: "https://www.schools.nyc.gov" },
    { name: "Buffalo City School District",   city: "Buffalo",       students: 33000, portal: "https://www.buffaloschools.org" },
    { name: "Rochester City School District", city: "Rochester",     students: 28000, portal: "https://www.rcsdk12.org" },
    { name: "Yonkers Public Schools",         city: "Yonkers",       students: 27000, portal: "https://www.yonkerspublicschools.org" },
    { name: "Syracuse City School District",  city: "Syracuse",      students: 20000, portal: "https://www.syracusecityschools.com" },
  ],
  FL: [
    { name: "Miami-Dade County Public Schools", city: "Miami",       students: 350000, portal: "https://procurement.dadeschools.net" },
    { name: "Broward County Public Schools",  city: "Fort Lauderdale", students: 270000, portal: "https://www.browardschools.com" },
    { name: "Palm Beach County Schools",      city: "West Palm Beach", students: 195000, portal: "https://www.palmbeachschools.org" },
    { name: "Hillsborough County Schools",    city: "Tampa",         students: 225000, portal: "https://www.sdhc.k12.fl.us" },
    { name: "Orange County Public Schools",   city: "Orlando",       students: 210000, portal: "https://www.ocps.net" },
  ],
  TX: [
    { name: "Houston Independent School Dist.", city: "Houston",     students: 194000, portal: "https://www.houstonisd.org" },
    { name: "Dallas Independent School Dist.", city: "Dallas",       students: 145000, portal: "https://www.dallasisd.org" },
    { name: "Northside Independent School Dist.", city: "San Antonio", students: 106000, portal: "https://www.nisd.net" },
    { name: "Austin Independent School Dist.", city: "Austin",       students: 72000, portal: "https://www.austinisd.org" },
    { name: "Fort Worth Independent School Dist.", city: "Fort Worth", students: 85000, portal: "https://www.fwisd.org" },
  ],
  CA: [
    { name: "Los Angeles Unified School Dist.", city: "Los Angeles", students: 596000, portal: "https://achieve.lausd.net" },
    { name: "San Diego Unified School Dist.", city: "San Diego",     students: 121000, portal: "https://www.sandiegounified.org" },
    { name: "San Francisco Unified",          city: "San Francisco", students: 53000, portal: "https://www.sfusd.edu" },
    { name: "Long Beach Unified",             city: "Long Beach",    students: 73000, portal: "https://www.lbusd.org" },
    { name: "Fresno Unified School District", city: "Fresno",        students: 74000, portal: "https://www.fresnounified.org" },
  ],
  PA: [
    { name: "Philadelphia City School Dist.", city: "Philadelphia",  students: 203000, portal: "https://www.philasd.org" },
    { name: "Pittsburgh Public Schools",      city: "Pittsburgh",    students: 22000, portal: "https://www.pghschools.org" },
    { name: "Allentown School District",      city: "Allentown",     students: 17000, portal: "https://www.allentownsd.org" },
    { name: "Reading School District",        city: "Reading",       students: 18000, portal: "https://www.readingsd.org" },
    { name: "Scranton School District",       city: "Scranton",      students: 10000, portal: "https://www.scrsd.org" },
  ],
};

// ── TOP UNIVERSITIES BY STATE ─────────────────────────────
const TOP_UNIVERSITIES = {
  NJ: [
    { name: "Rutgers University",             city: "New Brunswick", type: "Public",  portal: "https://www.procurement.rutgers.edu" },
    { name: "New Jersey Institute of Tech",   city: "Newark",        type: "Public",  portal: "https://www.njit.edu/procurement" },
    { name: "Rowan University",               city: "Glassboro",     type: "Public",  portal: "https://www.rowan.edu/adminfinance/purchasing" },
    { name: "Montclair State University",     city: "Montclair",     type: "Public",  portal: "https://www.montclair.edu/procurement" },
    { name: "Kean University",                city: "Union",         type: "Public",  portal: "https://www.kean.edu/offices/purchasing" },
    { name: "Princeton University",           city: "Princeton",     type: "Private", portal: "https://finance.princeton.edu/procurement" },
    { name: "Seton Hall University",          city: "South Orange",  type: "Private", portal: "https://www.shu.edu/finance-technology/purchasing" },
  ],
  NY: [
    { name: "SUNY System",                    city: "Albany",        type: "Public",  portal: "https://www.suny.edu/procurement" },
    { name: "City University of New York",    city: "New York",      type: "Public",  portal: "https://www.cuny.edu/administration/procurement" },
    { name: "Columbia University",            city: "New York",      type: "Private", portal: "https://finance.columbia.edu/procurement" },
    { name: "Cornell University",             city: "Ithaca",        type: "Private", portal: "https://www.dfa.cornell.edu/purchasing" },
    { name: "New York University",            city: "New York",      type: "Private", portal: "https://www.nyu.edu/purchasing" },
  ],
  FL: [
    { name: "University of Florida",          city: "Gainesville",   type: "Public",  portal: "https://procurement.ufl.edu" },
    { name: "Florida State University",       city: "Tallahassee",   type: "Public",  portal: "https://www.purchasing.fsu.edu" },
    { name: "University of Central Florida",  city: "Orlando",       type: "Public",  portal: "https://www.ucf.edu/financial/purchasing" },
    { name: "University of South Florida",    city: "Tampa",         type: "Public",  portal: "https://www.usf.edu/business-finance/purchasing" },
    { name: "Florida International Univ.",    city: "Miami",         type: "Public",  portal: "https://purchasing.fiu.edu" },
  ],
  TX: [
    { name: "University of Texas System",     city: "Austin",        type: "Public",  portal: "https://utsystem.edu/offices/supply-chain" },
    { name: "Texas A&M University",           city: "College Station", type: "Public", portal: "https://procurement.tamu.edu" },
    { name: "University of Houston",          city: "Houston",       type: "Public",  portal: "https://www.uh.edu/finance/procurement" },
    { name: "Texas Tech University",          city: "Lubbock",       type: "Public",  portal: "https://www.depts.ttu.edu/procurement" },
    { name: "Baylor University",              city: "Waco",          type: "Private", portal: "https://www.baylor.edu/procurement" },
  ],
  CA: [
    { name: "University of California System", city: "Oakland",      type: "Public",  portal: "https://www.ucop.edu/procurement-services" },
    { name: "California State Univ. System",  city: "Long Beach",    type: "Public",  portal: "https://www.calstate.edu/csu-system/administration/contracts-procurement" },
    { name: "Stanford University",            city: "Stanford",      type: "Private", portal: "https://procurment.stanford.edu" },
    { name: "USC",                            city: "Los Angeles",   type: "Private", portal: "https://procurement.usc.edu" },
    { name: "UCLA",                           city: "Los Angeles",   type: "Public",  portal: "https://www.procurement.ucla.edu" },
  ],
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { type = 'states', state = '', naics = '561720', year = '2024' } = req.query;

    // ── ALL 50 STATES LIST ────────────────────────────────
    if (type === 'states') {
      return res.status(200).json({
        success: true,
        states: Object.entries(STATES).map(([code, s]) => ({
          code,
          name: s.name,
          capital: s.capital,
          region: s.region,
          procurement: s.procurement
        }))
      });
    }

    // ── STATE DETAIL + LIVE SPENDING DATA ─────────────────
    if (type === 'state_detail') {
      const stateInfo = STATES[state];
      if (!stateInfo) return res.status(404).json({ success: false, error: `State ${state} not found` });

      // Get live spending data from USASpending
      const spendRes = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            time_period: [{ start_date: `${year}-01-01`, end_date: `${year}-12-31` }],
            naics_codes: [naics],
            place_of_performance_locations: [{ country: 'USA', state }],
            award_type_codes: ['A', 'B', 'C', 'D']
          },
          fields: ['Recipient Name', 'Award Amount', 'Awarding Agency Name', 'Place of Performance City Name', 'Award Date'],
          sort: 'Award Amount', order: 'desc', limit: 20, page: 1
        })
      });

      const spendData = await spendRes.json();
      const contracts = spendData.results || [];
      const totalSpend = contracts.reduce((s, c) => s + Number(c['Award Amount'] || 0), 0);

      // Group by vendor
      const vendors = {};
      contracts.forEach(c => {
        const n = c['Recipient Name'] || 'Unknown';
        if (!vendors[n]) vendors[n] = { total: 0, count: 0 };
        vendors[n].total += Number(c['Award Amount'] || 0);
        vendors[n].count++;
      });

      return res.status(200).json({
        success: true,
        state: { code: state, ...stateInfo },
        spending: {
          total: totalSpend,
          contractCount: contracts.length,
          topVendors: Object.entries(vendors)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 8)
            .map(([name, d]) => ({ name, ...d })),
          recentContracts: contracts.slice(0, 15).map(c => ({
            recipient: c['Recipient Name'],
            agency: c['Awarding Agency Name'],
            city: c['Place of Performance City Name'],
            amount: Number(c['Award Amount'] || 0),
            date: c['Award Date']
          }))
        },
        schoolDistricts: TOP_SCHOOL_DISTRICTS[state] || [],
        universities: TOP_UNIVERSITIES[state] || []
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid type' });

  } catch (error) {
    console.error('Geography error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
