const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'investment-readiness',
  name: 'Investment Readiness Score',
  tier: 'premium',
  dataDependencies: ['sec-edgar', 'fred', 'alpha-vantage', 'newsapi'],
  priority: 80,

  // Only generate for startups/growth companies seeking funding
  shouldRun(userContext) {
    const stage = (userContext.stage || '').toLowerCase();
    const pains = userContext.pains || [];
    return ['startup', 'idea', 'growth'].includes(stage) || pains.includes('investors');
  },

  async generate(enrichedData, userContext) {
    // Skip if not relevant
    if (!this.shouldRun(userContext)) {
      return {
        data: { skipped: true, reason: 'Not applicable — established stage without investor needs' },
        confidence: 0,
        sources: []
      };
    }

    const sec = enrichedData['sec-edgar']?.value || {};
    const fred = enrichedData.fred?.value || {};
    const av = enrichedData['alpha-vantage']?.value || {};
    const news = enrichedData.newsapi?.value || [];

    const fredSummary = fred.summary || {};
    const comparables = (sec.companies || []).map(c =>
      `- ${c.name}: Revenue ${c.financials?.revenue}, Margin ${c.financials?.grossMargin}, Market Cap ${av.companies?.find(a => a.name?.includes(c.name))?.marketCap || 'N/A'}`
    ).join('\n');

    // Find funding-related news
    const fundingNews = news.filter(n =>
      ['funding', 'raise', 'series', 'valuation', 'ipo', 'venture', 'invest'].some(k =>
        (n.title + ' ' + (n.description || '')).toLowerCase().includes(k)
      )
    ).slice(0, 3);

    const prompt = `You are a venture analyst. Evaluate investment readiness for this startup/growth company.

MARKET CONDITIONS (FRED):
- Fed Rate: ${fred.indicators?.FED_RATE?.latest || 'N/A'} (impacts venture cost of capital)
- GDP: ${fredSummary.gdpGrowth || 'N/A'}
- Consumer Sentiment: ${fredSummary.consumerSentiment || 'N/A'}
- Recession Risk: ${fredSummary.recessionRisk || 'Normal'}

COMPARABLE PUBLIC COMPANIES (SEC EDGAR):
${comparables || '- No public comparables found'}

RECENT FUNDING NEWS in ${userContext.industry}:
${fundingNews.map(n => `- "${n.title}" (${n.source})`).join('\n') || '- No funding news'}

SECTOR PERFORMANCE: ${av.sector?.etf || 'SPY'} ${av.sector?.changePercent || 'N/A'}

COMPANY PROFILE:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Advantage: ${userContext.competitiveAdvantage || 'unknown'}
- Goal: ${userContext.bigDecision || 'growth'}
- Competitors: ${userContext.namedCompetitors || 'none'}

Score each dimension 1-10. Cite specific data.

Return ONLY valid JSON:
{
  "readinessScore": <1-100 overall>,
  "dimensions": {
    "marketTiming": { "score": <1-10>, "detail": "<cite FRED/market data>" },
    "marketSize": { "score": <1-10>, "detail": "<cite sector data>" },
    "competitivePosition": { "score": <1-10>, "detail": "<cite comparables>" },
    "teamStrength": { "score": <1-10>, "detail": "<based on team size and stage>" },
    "traction": { "score": <1-10>, "detail": "<based on stage indicators>" },
    "unitEconomics": { "score": <1-10>, "detail": "<based on industry margins>" },
    "defensibility": { "score": <1-10>, "detail": "<based on competitive advantage>" },
    "fundingEnvironment": { "score": <1-10>, "detail": "<cite Fed rate, funding news>" }
  },
  "comparableFunded": "<2-3 sentences about comparable companies that have raised successfully>",
  "investorAppetite": "<1 sentence on current investor appetite for this sector>",
  "nextSteps": ["<step 1 to improve readiness>", "<step 2>", "<step 3>"],
  "valuationContext": "<1-2 sentences on typical valuations for this stage/industry>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    const sources = ['sec-edgar', 'fred', 'alpha-vantage', 'newsapi'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sources.length >= 2 ? 0.50 : 0.30,
      sources
    };
  }
};
