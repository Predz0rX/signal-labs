const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'market-sizing',
  name: 'Market Sizing (TAM/SAM/SOM)',
  tier: 'free',
  dataDependencies: ['bls', 'newsapi', 'fred', 'world-bank', 'sec-edgar'],
  priority: 20,

  async generate(enrichedData, userContext) {
    const bls = enrichedData.bls?.value || {};
    const news = enrichedData.newsapi?.value || [];
    const fred = enrichedData.fred?.value || {};
    const wb = enrichedData['world-bank']?.value || {};
    const sec = enrichedData['sec-edgar']?.value || {};

    const fredSummary = fred.summary || {};
    const wbSummary = wb.summary || {};
    const secBenchmarks = sec.benchmarks || {};
    const secCompanies = (sec.companies || []).map(c =>
      `- ${c.name} (${c.ticker}): Revenue ${c.financials?.revenue || 'N/A'}, Gross Margin ${c.financials?.grossMargin || 'N/A'}`
    ).join('\n');
    const newsContext = news.slice(0, 3).map(n => `- ${n.title} (${n.source})`).join('\n');

    const prompt = `You are a market sizing analyst. Estimate TAM, SAM, and SOM using REAL DATA.

REAL ECONOMIC DATA (FRED):
- GDP Growth: ${fredSummary.gdpGrowth || 'N/A'}
- Inflation: ${fredSummary.inflation || 'N/A'}
- Consumer Sentiment: ${fredSummary.consumerSentiment || 'N/A'}

COUNTRY DATA (World Bank):
- Country: ${wbSummary.country || userContext.country || 'US'}
- GDP: ${wbSummary.gdp || 'N/A'}, GDP/capita: ${wbSummary.gdpPerCapita || 'N/A'}
- Population: ${wbSummary.population || 'N/A'}
- Internet penetration: ${wbSummary.internetPenetration || 'N/A'}

SECTOR EMPLOYMENT (BLS):
- ${bls.sectorName || userContext.industry}: ${bls.currentEmployment || 'N/A'} workers, ${bls.yearOverYearChange || 'N/A'} YoY

PUBLIC COMPANY DATA (SEC EDGAR):
${secCompanies || '- No public company data available'}
- Industry median revenue: ${secBenchmarks.medianRevenue || 'N/A'}

RECENT NEWS:
${newsContext || '- No recent news'}

BUSINESS:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Advantage: ${userContext.competitiveAdvantage || 'unknown'}

IMPORTANT: Anchor estimates in real data. If public company revenues available, use them as reference. Label any interpolation as "estimated". Use World Bank GDP data for international sizing.

Return ONLY valid JSON:
{
  "marketSize": "<overall market size with source/reasoning>",
  "tam": "<Total Addressable Market — cite GDP, sector employment, or public company data>",
  "sam": "<Serviceable Addressable Market — their specific reachable segment>",
  "som": "<Serviceable Obtainable Market — realistic for their stage, cite benchmarks>"
}`;

    const result = await callLLM(prompt);
    return {
      data: result,
      confidence: sec.companiesFound > 0 ? 0.55 : 0.35,
      sources: ['bls', 'fred', 'world-bank', 'sec-edgar', 'newsapi'].filter(s => enrichedData[s]?.confidence > 0)
    };
  }
};
