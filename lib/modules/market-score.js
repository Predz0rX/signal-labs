const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'market-score',
  name: 'Market Attractiveness Score',
  tier: 'free',
  dataDependencies: ['bls', 'google-trends', 'newsapi', 'fred', 'alpha-vantage'],
  priority: 10,

  async generate(enrichedData, userContext) {
    const bls = enrichedData.bls?.value || {};
    const trends = enrichedData['google-trends']?.value || {};
    const news = enrichedData.newsapi?.value || [];
    const fred = enrichedData.fred?.value || {};
    const av = enrichedData['alpha-vantage']?.value || {};

    const fredSummary = fred.summary || {};
    const sectorETF = av.sector || {};

    const prompt = `You are a market analyst. Calculate a Market Attractiveness Score (1-100) based on REAL DATA provided.

REAL ECONOMIC DATA (FRED — Federal Reserve):
- GDP Growth: ${fredSummary.gdpGrowth || 'N/A'}
- Inflation (CPI): ${fredSummary.inflation || 'N/A'}
- Unemployment: ${fredSummary.unemployment || 'N/A'} (trend: ${fredSummary.unemploymentTrend || 'N/A'})
- Consumer Sentiment: ${fredSummary.consumerSentiment || 'N/A'} (trend: ${fredSummary.sentimentTrend || 'N/A'})
- Yield Curve Spread: ${fredSummary.yieldSpread || 'N/A'}
- Recession Risk: ${fredSummary.recessionRisk || 'N/A'}
- Total FRED indicators available: ${fredSummary.indicatorCount || 0}

SECTOR PERFORMANCE (Alpha Vantage):
- Sector ETF (${sectorETF.etf || 'SPY'}): Price $${sectorETF.price || 'N/A'}, Change: ${sectorETF.changePercent || 'N/A'}

EMPLOYMENT DATA (BLS):
- Sector: ${bls.sectorName || userContext.industry}, Employment: ${bls.currentEmployment || 'N/A'}
- YoY Change: ${bls.yearOverYearChange || 'N/A'}, Trend: ${bls.trend || 'N/A'}

SEARCH TRENDS (Google):
- Interest: ${trends.interestScore || 'N/A'}/100, Velocity: ${trends.velocity || 'N/A'}, Trending: ${trends.trending || 'N/A'}

NEWS ACTIVITY:
- ${news.length} relevant articles in last 7 days

BUSINESS CONTEXT:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}, Stage: ${userContext.stage || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}

SCORING GUIDELINES:
- 80-100: Strong macro + sector growth + positive sentiment + rising search trends
- 60-79: Mostly positive indicators with some caution
- 40-59: Mixed signals, moderate opportunity
- 1-39: Headwinds — recession risk, declining sector, weak sentiment

You MUST cite specific real data points in the rationale. Do NOT invent numbers.

Return ONLY valid JSON:
{
  "marketScore": <integer 1-100>,
  "marketScoreRationale": "<2-3 sentences citing the real FRED, BLS, and sector data above>",
  "teaserFinancials": "<1-sentence teaser of what financial benchmarking would reveal>"
}`;

    const result = await callLLM(prompt);
    const sources = ['bls', 'google-trends', 'newsapi', 'fred', 'alpha-vantage'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sources.length >= 3 ? 0.70 : 0.40,
      sources
    };
  }
};
