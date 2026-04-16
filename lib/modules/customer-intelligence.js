const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'customer-intelligence',
  name: 'Customer & Audience Intelligence',
  tier: 'free',
  dataDependencies: ['reddit', 'hackernews', 'google-trends', 'newsapi'],
  priority: 58,

  async generate(enrichedData, userContext) {
    const reddit = enrichedData.reddit?.value || {};
    const hn = enrichedData.hackernews?.value || {};
    const trends = enrichedData['google-trends']?.value || {};
    const news = enrichedData.newsapi?.value || [];

    // Extract pain points from Reddit posts
    const redditPosts = (reddit.posts || []).slice(0, 10).map(p =>
      `- [r/${p.subreddit}] "${p.title}" (${p.score} upvotes, ${p.comments} comments)`
    ).join('\n');

    const redditThemes = (reddit.themes || []).slice(0, 10).map(t => `${t.word} (${t.count}x)`).join(', ');

    // HN discussions reveal buyer sentiment
    const hnDiscussions = (hn.stories || []).filter(s => s.comments > 10).slice(0, 5).map(s =>
      `- "${s.title}" (${s.comments} comments, ${s.points} pts)`
    ).join('\n');

    const hnThemes = (hn.themes || []).slice(0, 10).map(t => `${t.word} (${t.count}x)`).join(', ');

    const prompt = `You are a customer intelligence analyst. Build an ICP (Ideal Customer Profile) and audience analysis from REAL community data.

REDDIT DISCUSSIONS (real posts from industry subreddits):
${redditPosts || '- No Reddit data available'}
- Top themes: ${redditThemes || 'none'}
- Subreddits: ${(reddit.subreddits || []).join(', ') || 'N/A'}
- Avg engagement: ${reddit.metrics?.avgEngagement || 'N/A'}

HACKER NEWS (tech buyer discussions):
${hnDiscussions || '- No HN discussions'}
- Themes: ${hnThemes || 'none'}

SEARCH TRENDS (Google):
- Related queries: ${(trends.relatedTopics || []).join(', ') || 'none'}
- Interest velocity: ${trends.velocity || 'N/A'}

NEWS TOPICS: ${news.slice(0, 3).map(n => n.title).join('; ') || 'none'}

BUSINESS:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Advantage: ${userContext.competitiveAdvantage || 'unknown'}

Derive the ICP and pain points from actual community discussions, NOT generic advice.

Return ONLY valid JSON:
{
  "icp": {
    "title": "<e.g., Mid-market SaaS decision makers>",
    "demographics": "<company size, role, industry vertical>",
    "painPoints": ["<from Reddit/HN data>", "<pain 2>", "<pain 3>"],
    "buyingTriggers": ["<trigger 1>", "<trigger 2>", "<trigger 3>"],
    "preferredChannels": ["<channel 1>", "<channel 2>", "<channel 3>"]
  },
  "audienceInsights": {
    "topConcerns": ["<from community data>", "<concern 2>", "<concern 3>"],
    "languagePatterns": "<how this audience talks about their problems — cite Reddit/HN>",
    "decisionFactors": ["<factor 1>", "<factor 2>", "<factor 3>"]
  },
  "messagingRecommendations": [
    { "angle": "<messaging angle>", "evidence": "<cite community data>", "channel": "<best channel>" },
    { "angle": "<angle 2>", "evidence": "<evidence>", "channel": "<channel>" },
    { "angle": "<angle 3>", "evidence": "<evidence>", "channel": "<channel>" }
  ],
  "communityPresence": "<1-2 sentences: where their audience hangs out and how active they are>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    const sources = ['reddit', 'hackernews', 'google-trends'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sources.length >= 2 ? 0.50 : 0.30,
      sources
    };
  }
};
