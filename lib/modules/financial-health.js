const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'financial-health',
  name: 'Financial Health Dashboard',
  tier: 'premium',
  dataDependencies: ['sec-edgar', 'alpha-vantage', 'fred'],
  priority: 45,

  async generate(enrichedData, userContext) {
    const sec = enrichedData['sec-edgar']?.value || {};
    const av = enrichedData['alpha-vantage']?.value || {};
    const fred = enrichedData.fred?.value || {};

    const secCompanies = (sec.companies || []).map(c => `
- ${c.name} (${c.ticker}):
  Revenue: ${c.financials?.revenue || 'N/A'} | Net Income: ${c.financials?.netIncome || 'N/A'}
  Gross Margin: ${c.financials?.grossMargin || 'N/A'} | Net Margin: ${c.financials?.netMargin || 'N/A'}
  Total Assets: ${c.financials?.totalAssets || 'N/A'} | Cash: ${c.financials?.cash || 'N/A'}
  D/E Ratio: ${c.financials?.debtToEquity || 'N/A'}`
    ).join('\n');

    const avCompanies = (av.companies || []).map(c => `
- ${c.name} (${c.symbol}): Market Cap ${c.marketCap}, P/E ${c.peRatio}, Rev Growth ${c.quarterlyRevenueGrowth}, Profit Margin ${c.profitMargin}`
    ).join('\n');

    const benchmarks = sec.benchmarks || {};
    const fredSummary = fred.summary || {};

    const prompt = `You are a financial analyst. Build a Financial Health Dashboard using REAL SEC/market data.

REAL SEC FILINGS (10-K annual reports):
${secCompanies || '- No public company data available'}

INDUSTRY BENCHMARKS (from SEC data):
- Median Revenue: ${benchmarks.medianRevenue || 'N/A'}
- Median Gross Margin: ${benchmarks.medianGrossMargin || 'N/A'}
- Median Net Margin: ${benchmarks.medianNetMargin || 'N/A'}
- Sample Size: ${benchmarks.sampleSize || 0} companies

MARKET DATA (Alpha Vantage):
${avCompanies || '- No market data'}
- Sector ETF: ${av.sector?.etf || 'N/A'} ${av.sector?.changePercent || ''}

MACRO CONTEXT (FRED):
- Fed Rate: ${fred.indicators?.FED_RATE?.latest || 'N/A'}
- GDP Growth: ${fredSummary.gdpGrowth || 'N/A'}
- Inflation: ${fredSummary.inflation || 'N/A'}

BUSINESS:
- Industry: ${userContext.industry}, Stage: ${userContext.stage || 'unknown'}
- Team: ${userContext.teamSize || 'unknown'}
- Competitors: ${userContext.namedCompetitors || 'none'}

IMPORTANT: Use REAL numbers from SEC filings. Label any estimates. For startups, provide unit economics frameworks rather than actuals.

Return ONLY valid JSON:
{
  "benchmarkTable": [
    { "metric": "<e.g., Revenue>", "industryMedian": "<from SEC data>", "topQuartile": "<estimated>", "source": "<SEC/AV>" }
  ],
  "competitorFinancials": [
    { "name": "<company>", "revenue": "<real>", "margin": "<real>", "growth": "<real>", "valuation": "<market cap or N/A>" }
  ],
  "unitEconomics": {
    "framework": "<LTV/CAC or relevant framework for their stage>",
    "industryBenchmark": "<typical for this industry>",
    "recommendation": "<what to target>"
  },
  "fundingLandscape": "<2-3 sentences on current funding environment citing Fed rate + market data>",
  "healthScore": <1-100>,
  "healthSummary": "<2 sentences: financial health of their industry citing real data>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    const sources = ['sec-edgar', 'alpha-vantage', 'fred'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sec.companiesFound > 0 ? 0.70 : 0.30,
      sources
    };
  }
};
