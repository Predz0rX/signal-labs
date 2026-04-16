const axios = require('axios');

/**
 * Alpha Vantage — Stock prices, sector performance, company fundamentals.
 * Free tier: 25 requests/day. Cache aggressively.
 * https://www.alphavantage.co/documentation/
 */

const SECTOR_ETF_MAP = {
  'tech': 'XLK', 'technology': 'XLK', 'software': 'XLK', 'saas': 'XLK', 'ai': 'XLK',
  'healthcare': 'XLV', 'biotech': 'XBI', 'health': 'XLV',
  'finance': 'XLF', 'fintech': 'XLF', 'financial': 'XLF', 'insurance': 'XLF',
  'retail': 'XRT', 'ecommerce': 'XRT', 'e-commerce': 'XRT',
  'energy': 'XLE', 'oil': 'XLE',
  'real estate': 'XLRE', 'construction': 'XHB',
  'manufacturing': 'XLI', 'industrial': 'XLI',
  'hospitality': 'PEJ', 'restaurant': 'PEJ',
  'education': 'EDUT',
  'media': 'XLC', 'entertainment': 'XLC',
  'logistics': 'IYT', 'transportation': 'IYT',
};

function getSectorETF(industry) {
  const lower = (industry || '').toLowerCase();
  for (const [key, etf] of Object.entries(SECTOR_ETF_MAP)) {
    if (lower.includes(key)) return etf;
  }
  return 'SPY'; // Default to S&P 500
}

module.exports = {
  name: 'alpha-vantage',
  tier: 'free',
  rateLimit: { requests: 5, windowMs: 60000 }, // Conservative to stay within 25/day
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const competitors = (query.competitors || '').split(',').map(c => c.trim()).filter(Boolean);
    const fetchedAt = new Date().toISOString();
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      return {
        data: { sector: {}, companies: [], note: 'Alpha Vantage API key not configured' },
        source: 'Alpha Vantage',
        fetchedAt,
        confidence: 0,
        cacheKey: `av:${industry}`,
        ttlSeconds: 86400
      };
    }

    try {
      const etf = getSectorETF(industry);

      // Fetch sector ETF performance
      const sectorData = await fetchQuote(etf, apiKey);

      // Fetch fundamentals for up to 2 named competitors (conserving API calls)
      const companyData = [];
      for (const comp of competitors.slice(0, 2)) {
        try {
          const overview = await fetchOverview(comp, apiKey);
          if (overview) companyData.push(overview);
        } catch (_) {}
      }

      return {
        data: {
          sector: {
            etf,
            name: sectorData?.name || etf,
            price: sectorData?.price,
            change: sectorData?.change,
            changePercent: sectorData?.changePercent,
            volume: sectorData?.volume
          },
          companies: companyData,
          industry
        },
        source: 'Alpha Vantage',
        fetchedAt,
        confidence: sectorData ? 0.80 : 0.1,
        cacheKey: `av:${industry}:${competitors.slice(0, 2).join(',')}`,
        ttlSeconds: 86400 // 24h — preserve API calls
      };
    } catch (err) {
      console.error('[alpha-vantage] Error:', err.message);
      return {
        data: { sector: {}, companies: [], note: `Alpha Vantage failed: ${err.message}` },
        source: 'Alpha Vantage',
        fetchedAt,
        confidence: 0,
        cacheKey: `av:${industry}`,
        ttlSeconds: 3600
      };
    }
  }
};

async function fetchQuote(symbol, apiKey) {
  try {
    const resp = await axios.get('https://www.alphavantage.co/query', {
      params: { function: 'GLOBAL_QUOTE', symbol, apikey: apiKey },
      timeout: 8000
    });
    const q = resp.data['Global Quote'];
    if (!q || !q['05. price']) return null;
    return {
      name: symbol,
      price: parseFloat(q['05. price']).toFixed(2),
      change: q['09. change'],
      changePercent: q['10. change percent'],
      volume: q['06. volume']
    };
  } catch (err) {
    console.error(`[alpha-vantage] Quote failed for ${symbol}:`, err.message);
    return null;
  }
}

async function fetchOverview(symbol, apiKey) {
  try {
    const resp = await axios.get('https://www.alphavantage.co/query', {
      params: { function: 'OVERVIEW', symbol, apikey: apiKey },
      timeout: 8000
    });
    const d = resp.data;
    if (!d || !d.Symbol || d.Symbol === 'None') return null;
    return {
      symbol: d.Symbol,
      name: d.Name,
      marketCap: d.MarketCapitalization ? formatLargeNumber(d.MarketCapitalization) : 'N/A',
      peRatio: d.PERatio || 'N/A',
      eps: d.EPS || 'N/A',
      revenuePerShare: d.RevenuePerShareTTM || 'N/A',
      profitMargin: d.ProfitMargin ? `${(parseFloat(d.ProfitMargin) * 100).toFixed(1)}%` : 'N/A',
      quarterlyRevenueGrowth: d.QuarterlyRevenueGrowthYOY ? `${(parseFloat(d.QuarterlyRevenueGrowthYOY) * 100).toFixed(1)}%` : 'N/A',
      quarterlyEarningsGrowth: d.QuarterlyEarningsGrowthYOY ? `${(parseFloat(d.QuarterlyEarningsGrowthYOY) * 100).toFixed(1)}%` : 'N/A',
      sector: d.Sector,
      industry: d.Industry
    };
  } catch (err) {
    console.error(`[alpha-vantage] Overview failed for ${symbol}:`, err.message);
    return null;
  }
}

function formatLargeNumber(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return 'N/A';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}
