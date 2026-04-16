const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'signals-radar',
  name: 'Market Signals',
  tier: 'free',
  dataDependencies: ['newsapi', 'hackernews', 'reddit'],
  priority: 40,

  async generate(enrichedData, userContext) {
    const news = enrichedData.newsapi?.value || [];
    const hn = enrichedData.hackernews?.value || {};
    const reddit = enrichedData.reddit?.value || {};

    const newsContext = news.slice(0, 5).map(n =>
      `- "${n.title}" — ${n.description || ''} (${n.source}, ${new Date(n.publishedAt).toLocaleDateString()})`
    ).join('\n');

    const hnContext = (hn.stories || []).slice(0, 5).map(s =>
      `- "${s.title}" (${s.points} pts, ${s.comments} comments on HN)`
    ).join('\n');

    const redditContext = (reddit.posts || []).slice(0, 5).map(p =>
      `- "${p.title}" (r/${p.subreddit}, score: ${p.score}, ${p.comments} comments)`
    ).join('\n');

    const prompt = `You are a market signal detector. From these REAL data sources, extract the 2 most impactful signals for this business.

REAL NEWS (last 7 days):
${newsContext || '- No articles available'}

HACKER NEWS (tech community, last 30 days):
${hnContext || '- No HN stories available'}

REDDIT (community discussions):
${redditContext || '- No Reddit posts available'}

BUSINESS:
- Industry: ${userContext.industry}, Stage: ${userContext.stage || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}

Each signal MUST reference a real article/post from above. Prioritize signals with cross-source confirmation.

Return ONLY valid JSON:
{
  "signals": [
    { "headline": "<from real source above>", "source": "<source name>", "implication": "<specific implication for their business>" },
    { "headline": "<from real source>", "source": "<source name>", "implication": "<implication>" }
  ]
}`;

    const result = await callLLM(prompt);
    return {
      data: result,
      confidence: 0.60,
      sources: ['newsapi', 'hackernews', 'reddit'].filter(s => enrichedData[s]?.confidence > 0)
    };
  }
};
