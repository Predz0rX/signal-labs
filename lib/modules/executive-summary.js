const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'executive-summary',
  name: 'Executive Intelligence Brief',
  tier: 'free',
  dataDependencies: ['bls', 'google-trends', 'newsapi', 'fred', 'world-bank', 'sec-edgar', 'reddit'],
  priority: 100, // Runs last — synthesizes all

  async generate(enrichedData, userContext) {
    const bls = enrichedData.bls?.value || {};
    const trends = enrichedData['google-trends']?.value || {};
    const news = enrichedData.newsapi?.value || [];
    const fred = enrichedData.fred?.value || {};
    const wb = enrichedData['world-bank']?.value || {};
    const sec = enrichedData['sec-edgar']?.value || {};
    const reddit = enrichedData.reddit?.value || {};

    const fredSummary = fred.summary || {};
    const wbSummary = wb.summary || {};

    const secOverview = (sec.companies || []).slice(0, 3).map(c =>
      `${c.name}: Revenue ${c.financials?.revenue || 'N/A'}, Margin ${c.financials?.grossMargin || 'N/A'}`
    ).join('; ');

    const prompt = `You are a senior market intelligence analyst writing a concise executive brief for a CEO.

REAL DATA SYNTHESIS:
- Economy (FRED): GDP ${fredSummary.gdpGrowth || 'N/A'}, CPI ${fredSummary.inflation || 'N/A'}, Unemployment ${fredSummary.unemployment || 'N/A'}, Sentiment ${fredSummary.consumerSentiment || 'N/A'}, Recession Risk: ${fredSummary.recessionRisk || 'N/A'}
- Sector (BLS): ${bls.sectorName || userContext.industry} employment ${bls.yearOverYearChange || 'N/A'} YoY
- Market (Google Trends): Interest ${trends.interestScore || 'N/A'}/100, velocity ${trends.velocity || 'N/A'}
- News: ${news.length} articles this week
- Country (World Bank): ${wbSummary.country || 'US'} — GDP ${wbSummary.gdp || 'N/A'}, GDP/capita ${wbSummary.gdpPerCapita || 'N/A'}, Population ${wbSummary.population || 'N/A'}
- Competitors (SEC): ${secOverview || 'No public filings found'}
- Community (Reddit): Avg engagement ${reddit.metrics?.avgEngagement || 'N/A'}, themes: ${(reddit.themes || []).slice(0, 3).map(t => t.word).join(', ') || 'N/A'}

BUSINESS:
- Company: ${userContext.company || 'Client'}, Industry: ${userContext.industry}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Goal: ${userContext.bigDecision || 'growth'}

Write a brief that a CEO can scan in 60 seconds. Cite specific data. No fluff.

Return ONLY valid JSON:
{
  "executiveBrief": "<3 concise paragraphs: 1) macro + sector state citing FRED/BLS, 2) competitive position citing SEC data, 3) recommendation citing trends>",
  "keyMetrics": [
    { "label": "<metric>", "value": "<value>", "trend": "up|down|stable" }
  ],
  "bottomLine": "<1 sentence: the single most important thing they need to know>",
  "teaserLeads": "<1-sentence teaser about lead intelligence for their industry>"
}`;

    const result = await callLLM(prompt, { maxTokens: 2500 });
    return {
      data: result,
      confidence: 0.50,
      sources: ['fred', 'bls', 'google-trends', 'world-bank', 'sec-edgar', 'reddit'].filter(s => enrichedData[s]?.confidence > 0)
    };
  }
};
