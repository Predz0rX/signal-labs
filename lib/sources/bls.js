const axios = require('axios');

const BLS_SERIES_MAP = {
  'saas': 'CES5000000001',
  'software': 'CES5000000001',
  'tech': 'CES5000000001',
  'technology': 'CES5000000001',
  'ai': 'CES5000000001',
  'artificial intelligence': 'CES5000000001',
  'healthcare': 'CES6500000001',
  'health': 'CES6500000001',
  'biotech': 'CES6500000001',
  'retail': 'CES4200000001',
  'ecommerce': 'CES4200000001',
  'e-commerce': 'CES4200000001',
  'finance': 'CES5500000001',
  'fintech': 'CES5500000001',
  'financial': 'CES5500000001',
  'insurance': 'CES5500000001',
  'manufacturing': 'CES3000000001',
  'construction': 'CES2000000001',
  'education': 'CES6561000001',
  'edtech': 'CES6561000001',
  'hospitality': 'CES7000000001',
  'restaurant': 'CES7000000001',
  'food': 'CES7000000001',
  'real estate': 'CES5500000001',
  'logistics': 'CES4300000001',
  'transportation': 'CES4300000001',
  'energy': 'CES1000000001',
  'mining': 'CES1000000001',
  'media': 'CES5000000001',
  'entertainment': 'CES7100000001',
  'agriculture': 'CES0500000001',
  'default': 'CES0000000001'
};

function getSeriesId(industry) {
  const lower = (industry || '').toLowerCase();
  for (const [key, seriesId] of Object.entries(BLS_SERIES_MAP)) {
    if (key === 'default') continue;
    if (lower.includes(key)) return { seriesId, sectorName: key };
  }
  return { seriesId: BLS_SERIES_MAP.default, sectorName: 'total nonfarm' };
}

module.exports = {
  name: 'bls',
  tier: 'free',
  rateLimit: { requests: 25, windowMs: 86400000 }, // BLS daily limit
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const { seriesId, sectorName } = getSeriesId(industry);
    const fetchedAt = new Date().toISOString();

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
        data: {
          sectorName: sectorName.charAt(0).toUpperCase() + sectorName.slice(1),
          currentEmployment: `${(current / 1000).toFixed(1)}M`,
          yearOverYearChange: `${yoyChange > 0 ? '+' : ''}${yoyChange}%`,
          trend,
          period: `${latest.periodName} ${latest.year}`,
          rawCurrent: current,
          rawPrior: prior
        },
        source: 'Bureau of Labor Statistics',
        fetchedAt,
        confidence: 0.90,
        cacheKey: `bls:${seriesId}`,
        ttlSeconds: 86400 // 24h — BLS data updates monthly
      };
    } catch (err) {
      console.error('[bls] Error:', err.message);
      return {
        data: { sectorName: industry, currentEmployment: 'N/A', yearOverYearChange: 'N/A', trend: 'stable', period: 'Recent' },
        source: 'Bureau of Labor Statistics',
        fetchedAt,
        confidence: 0,
        cacheKey: `bls:${industry}`,
        ttlSeconds: 3600
      };
    }
  }
};
