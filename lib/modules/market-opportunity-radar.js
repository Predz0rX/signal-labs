const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'market-opportunity-radar',
  name: 'Market Opportunity Radar',
  tier: 'free',
  dataDependencies: ['google-trends', 'hackernews', 'reddit', 'open-alex', 'newsapi', 'fred'],
  priority: 65,

  async generate(enrichedData, userContext) {
    const trends = enrichedData['google-trends']?.value || {};
    const hn = enrichedData.hackernews?.value || {};
    const reddit = enrichedData.reddit?.value || {};
    const oa = enrichedData['open-alex']?.value || {};
    const news = enrichedData.newsapi?.value || [];
    const fred = enrichedData.fred?.value || {};

    const hnThemes = (hn.themes || []).slice(0, 8).map(t => `${t.word} (${t.count}x)`).join(', ');
    const redditThemes = (reddit.themes || []).slice(0, 8).map(t => `${t.word} (${t.count}x)`).join(', ');
    const researchConcepts = (oa.concepts || []).slice(0, 8).map(c => `${c.name} (${c.count} papers)`).join(', ');
    const researchVelocity = oa.metrics?.researchVelocity || 'N/A';
    const yearlyTrend = (oa.yearlyTrend || []).map(y => `${y.year}: ${y.count}`).join(', ');

    const highEngagementHN = (hn.stories || []).filter(s => s.points > 30).slice(0, 5).map(s =>
      `- "${s.title}" (${s.points} pts)`
    ).join('\n');

    const highEngagementReddit = (reddit.posts || []).filter(p => p.score > 50).slice(0, 5).map(p =>
      `- "${p.title}" (r/${p.subreddit}, ${p.score} score)`
    ).join('\n');

    const fredSummary = fred.summary || {};

    const prompt = `You are a strategic opportunity analyst. Identify 5 emerging micro-trends and 3 white-space opportunities using REAL multi-source data.

SEARCH TRENDS (Google):
- Interest: ${trends.interestScore || 'N/A'}/100, Velocity: ${trends.velocity || 'N/A'}
- Related queries: ${(trends.relatedTopics || []).join(', ') || 'none'}

TECH COMMUNITY (HackerNews — last 30 days):
- Trending themes: ${hnThemes || 'none'}
- High-engagement stories:
${highEngagementHN || '- None'}
- Total stories: ${hn.metrics?.totalStories || 0}, Avg points: ${hn.metrics?.avgPoints || 0}

COMMUNITY DISCUSSIONS (Reddit):
- Trending themes: ${redditThemes || 'none'}
- High-engagement posts:
${highEngagementReddit || '- None'}

ACADEMIC RESEARCH (OpenAlex):
- Research velocity: ${researchVelocity} YoY change in publications
- Top research concepts: ${researchConcepts || 'none'}
- Publication trend: ${yearlyTrend || 'N/A'}

MACRO CONTEXT (FRED):
- GDP: ${fredSummary.gdpGrowth || 'N/A'}, Consumer Sentiment: ${fredSummary.consumerSentiment || 'N/A'}

NEWS (last 7 days): ${news.length} articles

BUSINESS:
- Industry: ${userContext.industry}, Stage: ${userContext.stage || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Goal: ${userContext.bigDecision || 'growth'}

Each micro-trend needs a "velocity score" (1-10) based on how fast it's growing across sources.

Return ONLY valid JSON:
{
  "microTrends": [
    { "trend": "<name>", "velocityScore": <1-10>, "evidence": "<cite HN/Reddit/OpenAlex data>", "timeToMainstream": "<months estimate>", "relevance": "<why it matters to them>" },
    { "trend": "<name>", "velocityScore": <1-10>, "evidence": "<cite data>", "timeToMainstream": "<months>", "relevance": "<relevance>" },
    { "trend": "<name>", "velocityScore": <1-10>, "evidence": "<cite data>", "timeToMainstream": "<months>", "relevance": "<relevance>" },
    { "trend": "<name>", "velocityScore": <1-10>, "evidence": "<cite data>", "timeToMainstream": "<months>", "relevance": "<relevance>" },
    { "trend": "<name>", "velocityScore": <1-10>, "evidence": "<cite data>", "timeToMainstream": "<months>", "relevance": "<relevance>" }
  ],
  "whiteSpaces": [
    { "opportunity": "<white space>", "evidence": "<why it's unoccupied>", "difficulty": "Low|Medium|High", "potentialImpact": "Low|Medium|High" },
    { "opportunity": "<white space>", "evidence": "<evidence>", "difficulty": "<level>", "potentialImpact": "<level>" },
    { "opportunity": "<white space>", "evidence": "<evidence>", "difficulty": "<level>", "potentialImpact": "<level>" }
  ],
  "timingSignal": "<1 sentence: is NOW a good time to enter/expand and why>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3500 });
    const sources = ['google-trends', 'hackernews', 'reddit', 'open-alex', 'newsapi'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sources.length >= 3 ? 0.55 : 0.35,
      sources
    };
  }
};
