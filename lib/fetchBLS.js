const axios = require('axios');

// BLS series IDs for common industries (seasonally adjusted employment, thousands)
const BLS_SERIES_MAP = {
  'saas': 'CES5000000001',           // Information
  'software': 'CES5000000001',       // Information
  'tech': 'CES5000000001',           // Information
  'technology': 'CES5000000001',     // Information
  'healthcare': 'CES6500000001',     // Health Care & Social Assistance
  'health': 'CES6500000001',
  'retail': 'CES4200000001',         // Retail Trade
  'ecommerce': 'CES4200000001',
  'finance': 'CES5500000001',        // Financial Activities
  'fintech': 'CES5500000001',
  'financial': 'CES5500000001',
  'manufacturing': 'CES3000000001',  // Manufacturing
  'construction': 'CES2000000001',   // Construction
  'education': 'CES6561000001',      // Educational Services
  'hospitality': 'CES7000000001',    // Leisure & Hospitality
  'restaurant': 'CES7000000001',
  'real estate': 'CES5500000001',    // Financial Activities (closest)
  'default': 'CES0000000001'         // Total Nonfarm (fallback)
};

function getSeriesId(industry) {
  const lower = industry.toLowerCase();
  for (const [key, seriesId] of Object.entries(BLS_SERIES_MAP)) {
    if (lower.includes(key)) return { seriesId, sectorName: key };
  }
  return { seriesId: BLS_SERIES_MAP.default, sectorName: 'total nonfarm' };
}

async function fetchBLS(industry) {
  const { seriesId, sectorName } = getSeriesId(industry);
  try {
    const currentYear = new Date().getFullYear();
    const response = await axios.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      seriesid: [seriesId],
      startyear: String(currentYear - 1),
      endyear: String(currentYear)
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000
    });

    const series = response.data?.Results?.series?.[0];
    const data = series?.data;
    if (!data || data.length < 2) throw new Error('Insufficient BLS data');

    const latest = data[0];
    const yearAgo = data[data.length - 1];
    const current = parseFloat(latest.value);
    const prior = parseFloat(yearAgo.value);
    const yoyChange = (((current - prior) / prior) * 100).toFixed(1);
    const trend = yoyChange > 0 ? 'growing' : 'contracting';

    return {
      sectorName: sectorName.charAt(0).toUpperCase() + sectorName.slice(1),
      currentEmployment: `${(current / 1000).toFixed(1)}M`,
      yearOverYearChange: `${yoyChange > 0 ? '+' : ''}${yoyChange}%`,
      trend,
      period: `${latest.periodName} ${latest.year}`
    };
  } catch (err) {
    console.error('[fetchBLS] Error:', err.message);
    return {
      sectorName: industry,
      currentEmployment: 'N/A',
      yearOverYearChange: 'N/A',
      trend: 'stable',
      period: 'Recent'
    };
  }
}

module.exports = { fetchBLS };
