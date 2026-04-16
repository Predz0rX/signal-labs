const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'quick-wins',
  name: 'Quick Wins',
  tier: 'free',
  dataDependencies: ['google-trends', 'newsapi'],
  priority: 60,

  async generate(enrichedData, userContext) {
    const trends = enrichedData['google-trends']?.value || {};
    const news = enrichedData.newsapi?.value || [];

    const prompt = `You are a growth strategist. Recommend 3 specific, actionable quick wins for this business.

CONTEXT:
- Industry: ${userContext.industry}, ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Goal: ${userContext.bigDecision || 'growth'}
- Trending topics: ${(trends.relatedTopics || []).join(', ') || 'none'}
- Search velocity: ${trends.velocity || 'N/A'}

Each win must be: specific (not generic advice), achievable within the timeframe, and relevant to their stage.

Return ONLY valid JSON:
{
  "quickWins": [
    { "action": "<specific action>", "timeframe": "<this week or this month>", "impact": "High" },
    { "action": "<specific action>", "timeframe": "<timeframe>", "impact": "Medium" },
    { "action": "<specific action>", "timeframe": "<timeframe>", "impact": "High" }
  ]
}`;

    const result = await callLLM(prompt);
    return {
      data: result,
      confidence: 0.40,
      sources: ['google-trends']
    };
  }
};
