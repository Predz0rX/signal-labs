const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'opportunity',
  name: 'Key Opportunity',
  tier: 'free',
  dataDependencies: ['google-trends', 'newsapi', 'bls'],
  priority: 70,

  async generate(enrichedData, userContext) {
    const trends = enrichedData['google-trends']?.value || {};
    const bls = enrichedData.bls?.value || {};
    const news = enrichedData.newsapi?.value || [];

    const prompt = `You are a strategic opportunity analyst. Identify the single most important opportunity for this business.

DATA:
- Employment trend: ${bls.yearOverYearChange || 'N/A'} YoY in ${bls.sectorName || userContext.industry}
- Search interest: ${trends.interestScore || 'N/A'}/100, velocity ${trends.velocity || 'N/A'}
- Related topics: ${(trends.relatedTopics || []).join(', ') || 'none'}
- News volume: ${news.length} articles this week

BUSINESS:
- Industry: ${userContext.industry}, Stage: ${userContext.stage || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Goal: ${userContext.bigDecision || 'growth'}
- Competitors: ${userContext.namedCompetitors || 'none'}
- Advantage: ${userContext.competitiveAdvantage || 'unknown'}

The opportunity must be specific to their profile, stage, and goal. Make it actionable.

Return ONLY valid JSON:
{
  "opportunity": {
    "title": "<opportunity name>",
    "description": "<3-4 sentences specific to their pains, stage, and goal>",
    "urgency": "High",
    "nextStep": "<single most important next action>"
  }
}`;

    const result = await callLLM(prompt);
    return {
      data: result,
      confidence: 0.40,
      sources: ['google-trends', 'bls', 'newsapi']
    };
  }
};
