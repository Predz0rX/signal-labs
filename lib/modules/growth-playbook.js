const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'growth-playbook',
  name: '90-Day Growth Playbook',
  tier: 'free',
  dataDependencies: ['google-trends', 'reddit', 'hackernews', 'newsapi', 'bls'],
  priority: 75,

  async generate(enrichedData, userContext) {
    const trends = enrichedData['google-trends']?.value || {};
    const reddit = enrichedData.reddit?.value || {};
    const hn = enrichedData.hackernews?.value || {};
    const news = enrichedData.newsapi?.value || [];
    const bls = enrichedData.bls?.value || {};

    const prompt = `You are a growth strategist. Build a 90-day growth playbook using REAL market data.

MARKET DATA:
- Search trends: ${trends.interestScore || 'N/A'}/100, velocity ${trends.velocity || 'N/A'}
- Related queries: ${(trends.relatedTopics || []).join(', ') || 'none'}
- Employment growth: ${bls.yearOverYearChange || 'N/A'} in ${bls.sectorName || userContext.industry}
- Community engagement (Reddit): avg ${reddit.metrics?.avgEngagement || 'N/A'}, themes: ${(reddit.themes || []).slice(0, 5).map(t => t.word).join(', ') || 'none'}
- Tech community (HN): ${hn.metrics?.totalStories || 0} stories, avg ${hn.metrics?.avgPoints || 0} points
- News volume: ${news.length} articles/week

BUSINESS:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Goal: ${userContext.bigDecision || 'growth'}
- Competitors: ${userContext.namedCompetitors || 'none'}
- Advantage: ${userContext.competitiveAdvantage || 'unknown'}

Build a SPECIFIC playbook for their stage. A startup with 2 people gets different advice than a 50-person growth company.

Return ONLY valid JSON:
{
  "channels": [
    { "channel": "<specific channel>", "expectedROI": "High|Medium|Low", "timeToResults": "<weeks/months>", "budgetRange": "<monthly $>", "rationale": "<cite market data>" },
    { "channel": "<channel 2>", "expectedROI": "<roi>", "timeToResults": "<time>", "budgetRange": "<budget>", "rationale": "<rationale>" },
    { "channel": "<channel 3>", "expectedROI": "<roi>", "timeToResults": "<time>", "budgetRange": "<budget>", "rationale": "<rationale>" }
  ],
  "budgetAllocation": {
    "total": "<recommended monthly budget for their stage>",
    "breakdown": [
      { "category": "<e.g., Content>", "percentage": <number>, "amount": "<$>" },
      { "category": "<category>", "percentage": <number>, "amount": "<$>" },
      { "category": "<category>", "percentage": <number>, "amount": "<$>" }
    ]
  },
  "timeline": {
    "month1": { "focus": "<main focus>", "milestones": ["<milestone 1>", "<milestone 2>"], "kpis": ["<kpi>"] },
    "month2": { "focus": "<focus>", "milestones": ["<milestone>", "<milestone>"], "kpis": ["<kpi>"] },
    "month3": { "focus": "<focus>", "milestones": ["<milestone>", "<milestone>"], "kpis": ["<kpi>"] }
  },
  "priorityAction": "<the single highest-ROI action they should start THIS WEEK>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    return {
      data: result,
      confidence: 0.40,
      sources: ['google-trends', 'reddit', 'hackernews', 'bls'].filter(s => enrichedData[s]?.confidence > 0)
    };
  }
};
