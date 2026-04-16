const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'trend-analysis',
  name: 'Key Market Trends',
  tier: 'free',
  dataDependencies: ['newsapi', 'google-trends', 'bls', 'fred', 'hackernews', 'open-alex', 'reddit'],
  priority: 30,

  async generate(enrichedData, userContext) {
    const news = enrichedData.newsapi?.value || [];
    const trends = enrichedData['google-trends']?.value || {};
    const bls = enrichedData.bls?.value || {};
    const fred = enrichedData.fred?.value || {};
    const hn = enrichedData.hackernews?.value || {};
    const oa = enrichedData['open-alex']?.value || {};
    const reddit = enrichedData.reddit?.value || {};

    const newsContext = news.slice(0, 5).map(n =>
      `- "${n.title}" (${n.source}, ${new Date(n.publishedAt).toLocaleDateString()})`
    ).join('\n');

    const hnStories = (hn.stories || []).slice(0, 5).map(s =>
      `- "${s.title}" (${s.points} pts, ${s.comments} comments)`
    ).join('\n');

    const hnThemes = (hn.themes || []).slice(0, 5).map(t => t.word).join(', ');
    const redditThemes = (reddit.themes || []).slice(0, 5).map(t => t.word).join(', ');

    const researchVelocity = oa.metrics?.researchVelocity || 'N/A';
    const topConcepts = (oa.concepts || []).slice(0, 5).map(c => c.name).join(', ');

    const fredSummary = fred.summary || {};

    const prompt = `You are a trend analyst. Identify the top 3 market trends using REAL multi-source data.

REAL DATA — NEWS (last 7 days):
${newsContext || '- No articles found'}

REAL DATA — HACKER NEWS (tech community, last 30 days):
${hnStories || '- No HN stories found'}
- Trending HN themes: ${hnThemes || 'none'}

REAL DATA — REDDIT (community discussions):
- Trending Reddit themes: ${redditThemes || 'none'}
- Avg engagement: ${reddit.metrics?.avgEngagement || 'N/A'}

REAL DATA — ACADEMIC RESEARCH (OpenAlex):
- Research velocity: ${researchVelocity} YoY change in publications
- Top research concepts: ${topConcepts || 'none'}

REAL DATA — GOOGLE TRENDS:
- Interest: ${trends.interestScore || 'N/A'}/100, Velocity: ${trends.velocity || 'N/A'}
- Related queries: ${(trends.relatedTopics || []).join(', ') || 'none'}

REAL DATA — ECONOMY (FRED):
- GDP: ${fredSummary.gdpGrowth || 'N/A'}, Inflation: ${fredSummary.inflation || 'N/A'}
- Consumer Sentiment: ${fredSummary.consumerSentiment || 'N/A'}

EMPLOYMENT (BLS): ${bls.yearOverYearChange || 'N/A'} YoY in ${bls.sectorName || userContext.industry}

BUSINESS:
- Industry: ${userContext.industry}, Stage: ${userContext.stage || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Goal: ${userContext.bigDecision || 'growth'}

Each trend MUST cite specific real data from above. Cross-reference multiple sources when possible.

Return ONLY valid JSON:
{
  "trends": [
    { "title": "<trend>", "insight": "<2-3 sentences citing specific data from multiple sources>", "dataPoint": "<specific stat from real data>", "actionForThem": "<concrete action>" },
    { "title": "<trend>", "insight": "<cite data>", "dataPoint": "<stat>", "actionForThem": "<action>" },
    { "title": "<trend>", "insight": "<cite data>", "dataPoint": "<stat>", "actionForThem": "<action>" }
  ]
}`;

    const result = await callLLM(prompt, { maxTokens: 2500 });
    const sources = ['newsapi', 'google-trends', 'bls', 'fred', 'hackernews', 'open-alex', 'reddit'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sources.length >= 4 ? 0.65 : 0.45,
      sources
    };
  }
};
