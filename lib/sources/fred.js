const axios = require('axios');

/**
 * FRED (Federal Reserve Economic Data) — 500K+ economic time series.
 * Maps industries to relevant economic indicators for composite scoring.
 * https://fred.stlouisfed.org/docs/api/fred/
 */

// Core macro indicators (always fetched)
const CORE_SERIES = {
  'GDP':          'GDPC1',        // Real GDP (quarterly)
  'CPI':          'CPIAUCSL',     // Consumer Price Index
  'UNEMPLOYMENT': 'UNRATE',       // Unemployment Rate
  'FED_RATE':     'FEDFUNDS',     // Federal Funds Rate
  'CONSUMER_SENT':'UMCSENT',      // Consumer Sentiment (UMich)
  'YIELD_CURVE':  'T10Y2Y',       // 10Y-2Y Treasury Spread (recession indicator)
};

// Industry-specific supplemental series
const INDUSTRY_SERIES = {
  'saas':           { 'TECH_OUTPUT': 'USINFO',     'VENTURE_CAP': 'BOGZ1FL893064105Q' },
  'software':       { 'TECH_OUTPUT': 'USINFO',     'VENTURE_CAP': 'BOGZ1FL893064105Q' },
  'tech':           { 'TECH_OUTPUT': 'USINFO',     'VENTURE_CAP': 'BOGZ1FL893064105Q' },
  'technology':     { 'TECH_OUTPUT': 'USINFO',     'VENTURE_CAP': 'BOGZ1FL893064105Q' },
  'ai':             { 'TECH_OUTPUT': 'USINFO',     'VENTURE_CAP': 'BOGZ1FL893064105Q' },
  'healthcare':     { 'HEALTH_SPEND': 'HLTHSCPCHCSA', 'HEALTH_EMP': 'CES6562000001' },
  'biotech':        { 'HEALTH_SPEND': 'HLTHSCPCHCSA', 'HEALTH_EMP': 'CES6562000001' },
  'retail':         { 'RETAIL_SALES': 'RSXFS',      'ECOMM_PCT': 'ECOMPCTSA' },
  'ecommerce':      { 'RETAIL_SALES': 'RSXFS',      'ECOMM_PCT': 'ECOMPCTSA' },
  'finance':        { 'BANK_CREDIT': 'TOTBKCR',     'SP500': 'SP500' },
  'fintech':        { 'BANK_CREDIT': 'TOTBKCR',     'SP500': 'SP500' },
  'real estate':    { 'HOUSE_PRICE': 'CSUSHPISA',   'MORTGAGE': 'MORTGAGE30US' },
  'construction':   { 'HOUSE_STARTS': 'HOUST',      'PERMITS': 'PERMIT' },
  'manufacturing':  { 'ISM_PMI': 'MANEMP',          'IND_PROD': 'INDPRO' },
  'energy':         { 'OIL_PRICE': 'DCOILWTICO',    'ENERGY_CPI': 'CUSR0000SEHF' },
  'hospitality':    { 'LEISURE_EMP': 'CES7000000001','FOOD_CPI': 'CUSR0000SAF1' },
  'restaurant':     { 'LEISURE_EMP': 'CES7000000001','FOOD_CPI': 'CUSR0000SAF1' },
  'education':      { 'EDU_EMP': 'CES6561000001',   'STUDENT_LOANS': 'SLOAS' },
  'logistics':      { 'TRANSPORT': 'CES4300000001',  'FUEL': 'GASREGW' },
  'transportation': { 'TRANSPORT': 'CES4300000001',  'FUEL': 'GASREGW' },
  'agriculture':    { 'FARM_INCOME': 'B230RC0A052NBEA', 'FOOD_CPI': 'CUSR0000SAF1' },
  'media':          { 'TECH_OUTPUT': 'USINFO',       'AD_SPEND': 'BOGZ1FL893064105Q' },
  'insurance':      { 'BANK_CREDIT': 'TOTBKCR',      'CPI_MEDICAL': 'CUSR0000SAM' },
};

function getIndustrySeries(industry) {
  const lower = (industry || '').toLowerCase();
  for (const [key, series] of Object.entries(INDUSTRY_SERIES)) {
    if (lower.includes(key)) return series;
  }
  return {};
}

module.exports = {
  name: 'fred',
  tier: 'free',
  rateLimit: { requests: 120, windowMs: 60000 },
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const fetchedAt = new Date().toISOString();
    const apiKey = process.env.FRED_API_KEY;

    if (!apiKey) {
      console.warn('[fred] No FRED_API_KEY set — returning empty data');
      return { data: { indicators: {}, note: 'FRED API key not configured' }, source: 'FRED', fetchedAt, confidence: 0, cacheKey: `fred:${industry}`, ttlSeconds: 3600 };
    }

    // Merge core + industry-specific series
    const allSeries = { ...CORE_SERIES, ...getIndustrySeries(industry) };
    const seriesIds = Object.values(allSeries);

    try {
      // Fetch all series in parallel (FRED allows one series per request)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const startDate = twoYearsAgo.toISOString().split('T')[0];

      const results = await Promise.allSettled(
        Object.entries(allSeries).map(async ([label, seriesId]) => {
          const resp = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
            params: {
              series_id: seriesId,
              api_key: apiKey,
              file_type: 'json',
              observation_start: startDate,
              sort_order: 'desc',
              limit: 24 // ~2 years of monthly data
            },
            timeout: 8000
          });
          const obs = (resp.data.observations || []).filter(o => o.value !== '.');
          if (obs.length < 2) return { label, seriesId, data: null };

          const latest = parseFloat(obs[0].value);
          const yearAgo = obs.length >= 12 ? parseFloat(obs[11].value) : parseFloat(obs[obs.length - 1].value);
          const yoyChange = yearAgo !== 0 ? (((latest - yearAgo) / Math.abs(yearAgo)) * 100).toFixed(2) : 'N/A';

          return {
            label,
            seriesId,
            data: {
              latest: latest,
              latestDate: obs[0].date,
              yearAgo: yearAgo,
              yearAgoDate: obs.length >= 12 ? obs[11].date : obs[obs.length - 1].date,
              yoyChange: `${yoyChange > 0 ? '+' : ''}${yoyChange}%`,
              trend: parseFloat(yoyChange) > 0 ? 'up' : parseFloat(yoyChange) < 0 ? 'down' : 'stable',
              dataPoints: obs.length
            }
          };
        })
      );

      const indicators = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.data) {
          indicators[r.value.label] = r.value.data;
        }
      }

      // Build composite summary
      const gdp = indicators.GDP;
      const cpi = indicators.CPI;
      const unemployment = indicators.UNEMPLOYMENT;
      const sentiment = indicators.CONSUMER_SENT;
      const yieldCurve = indicators.YIELD_CURVE;

      const summary = {
        gdpGrowth: gdp ? gdp.yoyChange : 'N/A',
        inflation: cpi ? cpi.yoyChange : 'N/A',
        unemployment: unemployment ? `${unemployment.latest}%` : 'N/A',
        unemploymentTrend: unemployment ? unemployment.trend : 'stable',
        consumerSentiment: sentiment ? sentiment.latest : 'N/A',
        sentimentTrend: sentiment ? sentiment.trend : 'stable',
        yieldSpread: yieldCurve ? `${yieldCurve.latest}%` : 'N/A',
        recessionRisk: yieldCurve && yieldCurve.latest < 0 ? 'Elevated (inverted yield curve)' : 'Normal',
        indicatorCount: Object.keys(indicators).length
      };

      return {
        data: { indicators, summary, industry },
        source: 'Federal Reserve Economic Data (FRED)',
        fetchedAt,
        confidence: 0.92,
        cacheKey: `fred:${industry}`,
        ttlSeconds: 43200 // 12h — FRED updates infrequently
      };
    } catch (err) {
      console.error('[fred] Error:', err.message);
      return {
        data: { indicators: {}, summary: {}, note: `FRED fetch failed: ${err.message}` },
        source: 'FRED',
        fetchedAt,
        confidence: 0,
        cacheKey: `fred:${industry}`,
        ttlSeconds: 1800
      };
    }
  }
};
