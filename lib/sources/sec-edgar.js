const axios = require('axios');

/**
 * SEC EDGAR — Free public company financials from SEC filings.
 * Fetches company facts (XBRL) for revenue, net income, assets, etc.
 * https://www.sec.gov/edgar/sec-api-documentation
 */

const USER_AGENT = process.env.SEC_EDGAR_USER_AGENT || 'signal-labs contact@signallabs.ai';

module.exports = {
  name: 'sec-edgar',
  tier: 'free',
  rateLimit: { requests: 10, windowMs: 1000 }, // 10 req/sec per SEC guidelines
  fallback: null,

  async fetch(query) {
    const competitors = (query.competitors || '').split(',').map(c => c.trim()).filter(Boolean);
    const company = query.company || '';
    const industry = query.industry || '';
    const fetchedAt = new Date().toISOString();

    // Search for companies to get CIKs
    const companies = [...new Set([company, ...competitors])].filter(Boolean).slice(0, 5);

    if (companies.length === 0) {
      return {
        data: { companies: [], note: 'No companies specified for SEC lookup' },
        source: 'SEC EDGAR',
        fetchedAt,
        confidence: 0,
        cacheKey: `sec:${industry}`,
        ttlSeconds: 86400
      };
    }

    try {
      const results = await Promise.allSettled(
        companies.map(name => fetchCompanyFinancials(name))
      );

      const companyData = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

      // Compute industry benchmarks from collected data
      const benchmarks = computeBenchmarks(companyData);

      return {
        data: { companies: companyData, benchmarks, companiesSearched: companies.length, companiesFound: companyData.length },
        source: 'SEC EDGAR (10-K/10-Q filings)',
        fetchedAt,
        confidence: companyData.length > 0 ? 0.88 : 0.1,
        cacheKey: `sec:${companies.sort().join(',')}`,
        ttlSeconds: 604800 // 7 days — filings don't change often
      };
    } catch (err) {
      console.error('[sec-edgar] Error:', err.message);
      return {
        data: { companies: [], benchmarks: {}, note: `SEC fetch failed: ${err.message}` },
        source: 'SEC EDGAR',
        fetchedAt,
        confidence: 0,
        cacheKey: `sec:${industry}`,
        ttlSeconds: 3600
      };
    }
  }
};

async function fetchCompanyFinancials(companyName) {
  try {
    // Step 1: Search for company CIK
    const searchResp = await axios.get('https://efts.sec.gov/LATEST/search-index?q=' + encodeURIComponent(companyName) + '&dateRange=custom&startdt=2024-01-01&forms=10-K', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    }).catch(() => null);

    // Alternative: use company tickers JSON
    const tickerResp = await axios.get('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    const tickers = Object.values(tickerResp.data);
    const match = tickers.find(t =>
      t.title && t.title.toLowerCase().includes(companyName.toLowerCase())
    ) || tickers.find(t =>
      t.ticker && t.ticker.toLowerCase() === companyName.toLowerCase()
    );

    if (!match) return null;

    const cik = String(match.cik_str).padStart(10, '0');

    // Step 2: Fetch company facts (XBRL)
    const factsResp = await axios.get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const facts = factsResp.data;
    const usgaap = facts.facts?.['us-gaap'] || {};

    // Extract key financial metrics
    const revenue = getLatestAnnual(usgaap['Revenues'] || usgaap['RevenueFromContractWithCustomerExcludingAssessedTax'] || usgaap['SalesRevenueNet']);
    const netIncome = getLatestAnnual(usgaap['NetIncomeLoss']);
    const totalAssets = getLatestAnnual(usgaap['Assets']);
    const totalLiabilities = getLatestAnnual(usgaap['Liabilities']);
    const grossProfit = getLatestAnnual(usgaap['GrossProfit']);
    const operatingIncome = getLatestAnnual(usgaap['OperatingIncomeLoss']);
    const cash = getLatestAnnual(usgaap['CashAndCashEquivalentsAtCarryingValue']);
    const shares = getLatestAnnual(usgaap['CommonStockSharesOutstanding']);

    // Calculate ratios
    const grossMargin = revenue?.val && grossProfit?.val ? ((grossProfit.val / revenue.val) * 100).toFixed(1) + '%' : 'N/A';
    const netMargin = revenue?.val && netIncome?.val ? ((netIncome.val / revenue.val) * 100).toFixed(1) + '%' : 'N/A';
    const debtToEquity = totalAssets?.val && totalLiabilities?.val
      ? (totalLiabilities.val / (totalAssets.val - totalLiabilities.val)).toFixed(2)
      : 'N/A';

    return {
      name: facts.entityName || match.title,
      ticker: match.ticker,
      cik: match.cik_str,
      financials: {
        revenue: formatCurrency(revenue?.val),
        revenueDate: revenue?.date || 'N/A',
        netIncome: formatCurrency(netIncome?.val),
        grossProfit: formatCurrency(grossProfit?.val),
        operatingIncome: formatCurrency(operatingIncome?.val),
        totalAssets: formatCurrency(totalAssets?.val),
        cash: formatCurrency(cash?.val),
        grossMargin,
        netMargin,
        debtToEquity
      },
      raw: {
        revenue: revenue?.val,
        netIncome: netIncome?.val,
        grossProfit: grossProfit?.val,
        totalAssets: totalAssets?.val
      }
    };
  } catch (err) {
    console.error(`[sec-edgar] Failed for "${companyName}":`, err.message);
    return null;
  }
}

function getLatestAnnual(concept) {
  if (!concept?.units) return null;
  const units = concept.units.USD || concept.units.shares || Object.values(concept.units)[0];
  if (!units || !units.length) return null;

  // Filter to annual filings (10-K) and get the most recent
  const annual = units
    .filter(u => u.form === '10-K' && u.val !== undefined)
    .sort((a, b) => new Date(b.end || b.filed) - new Date(a.end || a.filed));

  return annual.length > 0 ? { val: annual[0].val, date: annual[0].end || annual[0].filed } : null;
}

function formatCurrency(val) {
  if (val === null || val === undefined) return 'N/A';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function computeBenchmarks(companyData) {
  const revenues = companyData.map(c => c.raw?.revenue).filter(Boolean);
  const margins = companyData.map(c => parseFloat(c.financials?.grossMargin)).filter(v => !isNaN(v));
  const netMargins = companyData.map(c => parseFloat(c.financials?.netMargin)).filter(v => !isNaN(v));

  return {
    medianRevenue: revenues.length > 0 ? formatCurrency(median(revenues)) : 'N/A',
    medianGrossMargin: margins.length > 0 ? `${median(margins).toFixed(1)}%` : 'N/A',
    medianNetMargin: netMargins.length > 0 ? `${median(netMargins).toFixed(1)}%` : 'N/A',
    sampleSize: companyData.length
  };
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
