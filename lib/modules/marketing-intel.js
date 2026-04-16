const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'marketing-intel',
  name: 'Marketing Intelligence',
  tier: 'premium',
  dataDependencies: ['google-trends', 'reddit', 'hackernews', 'newsapi'],
  priority: 85,

  async generate(enrichedData, userContext) {
    const trends = enrichedData['google-trends']?.value || {};
    const reddit = enrichedData.reddit?.value || {};
    const hn = enrichedData.hackernews?.value || {};
    const news = enrichedData.newsapi?.value || [];

    const prompt = `You are a marketing intelligence analyst. Build actionable marketing insights from REAL data.

SEARCH DATA (Google Trends):
- Main keyword "${trends.keyword || userContext.industry}": interest ${trends.interestScore || 'N/A'}/100
- Velocity: ${trends.velocity || 'N/A'}
- Related queries (content opportunities): ${(trends.relatedTopics || []).join(', ') || 'none'}
- Data points: ${trends.dataPoints || 'N/A'} measurements over 90 days

COMMUNITY PRESENCE (Reddit):
- Active subreddits: ${(reddit.subreddits || []).join(', ') || 'N/A'}
- Avg post engagement: ${reddit.metrics?.avgEngagement || 'N/A'}
- Trending community themes: ${(reddit.themes || []).slice(0, 8).map(t => `${t.word} (${t.count}x)`).join(', ') || 'none'}
- Total posts analyzed: ${reddit.metrics?.totalPosts || 0}

TECH COMMUNITY (HackerNews):
- Trending themes: ${(hn.themes || []).slice(0, 8).map(t => `${t.word} (${t.count}x)`).join(', ') || 'none'}
- High-engagement stories: ${hn.metrics?.highEngagementCount || 0}
- Avg points per story: ${hn.metrics?.avgPoints || 'N/A'}

NEWS LANDSCAPE: ${news.length} articles this week
- Top sources: ${[...new Set(news.slice(0, 5).map(n => n.source))].join(', ') || 'none'}

BUSINESS:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}, Team: ${userContext.teamSize || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Competitors: ${userContext.namedCompetitors || 'none'}

Return ONLY valid JSON:
{
  "keywordOpportunities": [
    { "keyword": "<from Google Trends related queries>", "volume": "High|Medium|Low", "competition": "High|Medium|Low", "contentAngle": "<specific content idea>" },
    { "keyword": "<keyword>", "volume": "<vol>", "competition": "<comp>", "contentAngle": "<angle>" },
    { "keyword": "<keyword>", "volume": "<vol>", "competition": "<comp>", "contentAngle": "<angle>" }
  ],
  "contentGaps": [
    { "gap": "<topic not well covered>", "evidence": "<cite Reddit/HN themes showing demand>", "format": "<blog/video/tool/report>", "priority": "High|Medium" },
    { "gap": "<gap>", "evidence": "<evidence>", "format": "<format>", "priority": "<priority>" },
    { "gap": "<gap>", "evidence": "<evidence>", "format": "<format>", "priority": "<priority>" }
  ],
  "socialPresence": {
    "bestPlatforms": ["<platform 1>", "<platform 2>"],
    "communitySize": "<estimated from Reddit/HN engagement>",
    "engagementLevel": "High|Medium|Low",
    "recommendation": "<specific social strategy>"
  },
  "competitorContentAnalysis": "<2-3 sentences on what content competitors are doing well/poorly based on news coverage>",
  "quickWinCampaign": {
    "name": "<campaign concept>",
    "channel": "<best channel>",
    "targetAudience": "<from community data>",
    "expectedOutcome": "<realistic outcome>",
    "timeToLaunch": "<days/weeks>"
  }
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    return {
      data: result,
      confidence: 0.45,
      sources: ['google-trends', 'reddit', 'hackernews', 'newsapi'].filter(s => enrichedData[s]?.confidence > 0)
    };
  }
};
