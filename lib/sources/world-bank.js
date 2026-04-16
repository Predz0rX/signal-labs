const axios = require('axios');

/**
 * World Bank API — Country-level economic data.
 * Free, generous limits, no API key required.
 * https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

const COUNTRY_CODES = {
  'united states': 'US', 'us': 'US', 'usa': 'US',
  'mexico': 'MX', 'méxico': 'MX',
  'brazil': 'BR', 'brasil': 'BR',
  'colombia': 'CO',
  'argentina': 'AR',
  'chile': 'CL',
  'peru': 'PE', 'perú': 'PE',
  'canada': 'CA',
  'united kingdom': 'GB', 'uk': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'spain': 'ES', 'españa': 'ES',
  'italy': 'IT',
  'india': 'IN',
  'china': 'CN',
  'japan': 'JP',
  'south korea': 'KR', 'korea': 'KR',
  'australia': 'AU',
  'singapore': 'SG',
  'israel': 'IL',
  'uae': 'AE', 'emirates': 'AE',
  'saudi arabia': 'SA',
  'nigeria': 'NG',
  'south africa': 'ZA',
  'kenya': 'KE',
  'egypt': 'EG',
  'indonesia': 'ID',
  'thailand': 'TH',
  'vietnam': 'VN',
  'philippines': 'PH',
  'taiwan': 'TW',
  'poland': 'PL',
  'netherlands': 'NL',
  'sweden': 'SE',
  'switzerland': 'CH',
  'portugal': 'PT',
  'ireland': 'IE',
};

function getCountryCode(country) {
  if (!country) return 'US';
  const lower = country.toLowerCase().trim();
  return COUNTRY_CODES[lower] || country.slice(0, 2).toUpperCase();
}

const INDICATORS = {
  'GDP':                'NY.GDP.MKTP.CD',       // GDP (current US$)
  'GDP_GROWTH':         'NY.GDP.MKTP.KD.ZG',    // GDP growth (annual %)
  'GDP_PER_CAPITA':     'NY.GDP.PCAP.CD',       // GDP per capita
  'POPULATION':         'SP.POP.TOTL',           // Total population
  'INFLATION':          'FP.CPI.TOTL.ZG',       // Inflation (CPI annual %)
  'EASE_OF_BUSINESS':   'IC.BUS.EASE.XQ',       // Ease of doing business rank
  'FDI':                'BX.KLT.DINV.WD.GD.ZS', // FDI (% of GDP)
  'INTERNET_USERS':     'IT.NET.USER.ZS',        // Internet users (% of pop)
  'UNEMPLOYMENT':       'SL.UEM.TOTL.ZS',        // Unemployment (% of labor)
};

module.exports = {
  name: 'world-bank',
  tier: 'free',
  rateLimit: { requests: 30, windowMs: 60000 },
  fallback: null,

  async fetch(query) {
    const country = query.country || 'United States';
    const countryCode = getCountryCode(country);
    const fetchedAt = new Date().toISOString();

    try {
      const results = await Promise.allSettled(
        Object.entries(INDICATORS).map(([label, indicator]) =>
          fetchIndicator(countryCode, indicator).then(val => ({ label, ...val }))
        )
      );

      const data = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.value !== null) {
          data[r.value.label] = {
            value: r.value.value,
            year: r.value.year,
            formatted: r.value.formatted
          };
        }
      }

      // Build summary
      const summary = {
        country,
        countryCode,
        gdp: data.GDP ? data.GDP.formatted : 'N/A',
        gdpGrowth: data.GDP_GROWTH ? `${data.GDP_GROWTH.value.toFixed(1)}%` : 'N/A',
        gdpPerCapita: data.GDP_PER_CAPITA ? `$${Math.round(data.GDP_PER_CAPITA.value).toLocaleString()}` : 'N/A',
        population: data.POPULATION ? formatPopulation(data.POPULATION.value) : 'N/A',
        inflation: data.INFLATION ? `${data.INFLATION.value.toFixed(1)}%` : 'N/A',
        unemployment: data.UNEMPLOYMENT ? `${data.UNEMPLOYMENT.value.toFixed(1)}%` : 'N/A',
        fdiPctGdp: data.FDI ? `${data.FDI.value.toFixed(2)}%` : 'N/A',
        internetPenetration: data.INTERNET_USERS ? `${data.INTERNET_USERS.value.toFixed(1)}%` : 'N/A',
        indicatorCount: Object.keys(data).length,
        dataYear: data.GDP?.year || 'N/A'
      };

      return {
        data: { indicators: data, summary },
        source: 'World Bank Open Data',
        fetchedAt,
        confidence: Object.keys(data).length >= 3 ? 0.85 : 0.40,
        cacheKey: `worldbank:${countryCode}`,
        ttlSeconds: 86400 // 24h — country data updates rarely
      };
    } catch (err) {
      console.error('[world-bank] Error:', err.message);
      return {
        data: { indicators: {}, summary: { country, countryCode } },
        source: 'World Bank',
        fetchedAt,
        confidence: 0,
        cacheKey: `worldbank:${countryCode}`,
        ttlSeconds: 3600
      };
    }
  }
};

async function fetchIndicator(countryCode, indicator) {
  try {
    const resp = await axios.get(`https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}`, {
      params: { format: 'json', per_page: 5, mrv: 3 }, // Most recent 3 values
      timeout: 8000
    });

    const entries = resp.data?.[1];
    if (!entries || entries.length === 0) return { value: null };

    // Get most recent non-null value
    const valid = entries.find(e => e.value !== null);
    if (!valid) return { value: null };

    return {
      value: valid.value,
      year: valid.date,
      formatted: formatIndicatorValue(indicator, valid.value)
    };
  } catch (err) {
    return { value: null };
  }
}

function formatIndicatorValue(indicator, value) {
  if (indicator.includes('NY.GDP.MKTP.CD')) {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    return `$${(value / 1e6).toFixed(0)}M`;
  }
  if (indicator.includes('ZG') || indicator.includes('ZS')) return `${value.toFixed(1)}%`;
  if (indicator.includes('SP.POP')) return formatPopulation(value);
  return String(value);
}

function formatPopulation(val) {
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return `${(val / 1e3).toFixed(0)}K`;
}
