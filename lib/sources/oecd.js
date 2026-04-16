const axios = require('axios');

/**
 * OECD Data API — International economic indicators for 38 member countries.
 * Free, no API key required.
 * https://data.oecd.org/api/
 */

const OECD_COUNTRY_MAP = {
  'united states': 'USA', 'us': 'USA',
  'canada': 'CAN', 'mexico': 'MEX',
  'united kingdom': 'GBR', 'uk': 'GBR',
  'germany': 'DEU', 'france': 'FRA', 'spain': 'ESP', 'italy': 'ITA',
  'netherlands': 'NLD', 'belgium': 'BEL', 'sweden': 'SWE', 'switzerland': 'CHE',
  'norway': 'NOR', 'denmark': 'DNK', 'finland': 'FIN', 'ireland': 'IRL',
  'portugal': 'PRT', 'austria': 'AUT', 'poland': 'POL', 'czech republic': 'CZE',
  'hungary': 'HUN', 'greece': 'GRC',
  'japan': 'JPN', 'south korea': 'KOR', 'korea': 'KOR', 'australia': 'AUS',
  'new zealand': 'NZL', 'israel': 'ISR', 'turkey': 'TUR',
  'chile': 'CHL', 'colombia': 'COL', 'costa rica': 'CRI',
  'brazil': 'BRA', 'argentina': 'ARG', 'india': 'IND', 'china': 'CHN',
  'indonesia': 'IDN', 'south africa': 'ZAF',
};

function getOECDCode(country) {
  const lower = (country || '').toLowerCase().trim();
  return OECD_COUNTRY_MAP[lower] || null;
}

// Key OECD datasets
const DATASETS = {
  'GDP_FORECAST':       { dataset: 'EO', subject: 'GDPV_ANNPCT' },
  'TRADE_GOODS':        { dataset: 'MEI_TRD', subject: 'BALGSTOT' },
  'LABOR_PRODUCTIVITY': { dataset: 'PDB_LV', subject: 'T_GDPHRS' },
  'BUSINESS_CONFIDENCE':{ dataset: 'MEI_CLI', subject: 'BSCICP03' },
  'CONSUMER_CONFIDENCE':{ dataset: 'MEI_CLI', subject: 'CSCICP03' },
};

module.exports = {
  name: 'oecd',
  tier: 'free',
  rateLimit: { requests: 10, windowMs: 60000 },
  fallback: 'world-bank',

  async fetch(query) {
    const country = query.country || 'United States';
    const oecdCode = getOECDCode(country);
    const fetchedAt = new Date().toISOString();

    if (!oecdCode) {
      return {
        data: { indicators: {}, summary: { country, note: 'Not an OECD member country' } },
        source: 'OECD',
        fetchedAt,
        confidence: 0,
        cacheKey: `oecd:${country}`,
        ttlSeconds: 86400
      };
    }

    try {
      // Fetch key indicators via OECD SDMX-JSON API
      const results = await Promise.allSettled([
        fetchOECDIndicator(oecdCode, 'QNA', 'B1_GE.GPSA.Q', 'GDP'),
        fetchOECDIndicator(oecdCode, 'KEI', 'NAEXKP01.GPSA.Q', 'GDP_GROWTH'),
        fetchOECDIndicator(oecdCode, 'KEI', 'LRHUTTTT.ST.Q', 'UNEMPLOYMENT'),
        fetchOECDIndicator(oecdCode, 'KEI', 'CPALTT01.GY.Q', 'INFLATION'),
        fetchOECDSimple(oecdCode, 'business-confidence'),
        fetchOECDSimple(oecdCode, 'consumer-confidence'),
      ]);

      const indicators = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          indicators[r.value.label] = r.value;
        }
      }

      const summary = {
        country,
        oecdCode,
        isOECDMember: true,
        indicatorCount: Object.keys(indicators).length,
        businessConfidence: indicators.BUSINESS_CONFIDENCE?.value || 'N/A',
        consumerConfidence: indicators.CONSUMER_CONFIDENCE?.value || 'N/A',
        gdpGrowth: indicators.GDP_GROWTH?.value || 'N/A',
        unemployment: indicators.UNEMPLOYMENT?.value || 'N/A',
        inflation: indicators.INFLATION?.value || 'N/A'
      };

      return {
        data: { indicators, summary },
        source: 'OECD Data',
        fetchedAt,
        confidence: Object.keys(indicators).length >= 2 ? 0.85 : 0.40,
        cacheKey: `oecd:${oecdCode}`,
        ttlSeconds: 86400
      };
    } catch (err) {
      console.error('[oecd] Error:', err.message);
      return {
        data: { indicators: {}, summary: { country, oecdCode } },
        source: 'OECD',
        fetchedAt,
        confidence: 0,
        cacheKey: `oecd:${country}`,
        ttlSeconds: 3600
      };
    }
  }
};

async function fetchOECDIndicator(countryCode, dataset, filter, label) {
  try {
    const url = `https://stats.oecd.org/SDMX-JSON/data/${dataset}/${countryCode}.${filter}/all?startTime=2023-Q1&dimensionAtObservation=allDimensions`;
    const resp = await axios.get(url, { timeout: 10000 });
    const observations = resp.data?.dataSets?.[0]?.observations;
    if (!observations) return null;

    const keys = Object.keys(observations);
    if (keys.length === 0) return null;
    const lastKey = keys[keys.length - 1];
    const value = observations[lastKey][0];

    return { label, value, source: `OECD ${dataset}` };
  } catch (err) {
    return null;
  }
}

async function fetchOECDSimple(countryCode, indicator) {
  try {
    const labelMap = { 'business-confidence': 'BUSINESS_CONFIDENCE', 'consumer-confidence': 'CONSUMER_CONFIDENCE' };
    const resp = await axios.get(`https://data.oecd.org/api/views/${indicator}/data.json`, {
      params: { location: countryCode, frequency: 'M', 'time_period': `${new Date().getFullYear() - 1}-01..${new Date().getFullYear()}-12` },
      timeout: 8000
    });

    const values = resp.data?.values;
    if (!values || values.length === 0) return null;
    const latest = values[values.length - 1];

    return {
      label: labelMap[indicator] || indicator.toUpperCase(),
      value: typeof latest === 'number' ? latest.toFixed(1) : latest,
      source: 'OECD'
    };
  } catch (err) {
    return null;
  }
}
