const axios = require('axios');

/**
 * HackerNews Algolia API — Tech community pulse, trending topics, product sentiment.
 * Free, 10,000 requests/hour, no API key.
 * https://hn.algolia.com/api
 */

module.exports = {
  name: 'hackernews',
  tier: 'free',
  rateLimit: { requests: 60, windowMs: 60000 },
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const competitors = (query.competitors || '').split(',').map(c => c.trim()).filter(Boolean);
    const fetchedAt = new Date().toISOString();

    try {
      // Search for industry-related stories from the last 30 days
      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

      const [industryResults, competitorResults] = await Promise.all([
        searchHN(industry, thirtyDaysAgo),
        competitors.length > 0
          ? Promise.all(competitors.slice(0, 3).map(c => searchHN(c, thirtyDaysAgo)))
          : Promise.resolve([])
      ]);

      // Process industry stories
      const industryStories = (industryResults.hits || []).map(h => ({
        title: h.title || h.story_title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points || 0,
        comments: h.num_comments || 0,
        author: h.author,
        createdAt: h.created_at,
        tags: h._tags || []
      })).filter(s => s.title);

      // Process competitor mentions
      const competitorMentions = competitorResults.flat().flatMap(r =>
        (r?.hits || []).map(h => ({
          title: h.title || h.story_title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          points: h.points || 0,
          comments: h.num_comments || 0,
          createdAt: h.created_at
        })).filter(s => s.title)
      );

      // Calculate engagement trends
      const totalPoints = industryStories.reduce((s, h) => s + h.points, 0);
      const avgPoints = industryStories.length > 0 ? Math.round(totalPoints / industryStories.length) : 0;
      const highEngagement = industryStories.filter(s => s.points > 50);

      // Extract trending themes
      const themes = extractTopics(industryStories.map(s => s.title));

      return {
        data: {
          stories: industryStories.slice(0, 15),
          competitorMentions: competitorMentions.slice(0, 10),
          themes,
          metrics: {
            totalStories: industryResults.nbHits || 0,
            storiesFetched: industryStories.length,
            avgPoints,
            highEngagementCount: highEngagement.length,
            competitorMentionCount: competitorMentions.length
          },
          industry
        },
        source: 'Hacker News (Algolia)',
        fetchedAt,
        confidence: industryStories.length >= 5 ? 0.55 : 0.25,
        cacheKey: `hn:${industry}`,
        ttlSeconds: 7200 // 2h
      };
    } catch (err) {
      console.error('[hackernews] Error:', err.message);
      return {
        data: { stories: [], themes: [], metrics: {}, note: `HN fetch failed: ${err.message}` },
        source: 'Hacker News',
        fetchedAt,
        confidence: 0,
        cacheKey: `hn:${industry}`,
        ttlSeconds: 1800
      };
    }
  }
};

async function searchHN(query, numericFilters) {
  try {
    const resp = await axios.get('https://hn.algolia.com/api/v1/search', {
      params: {
        query,
        tags: 'story',
        numericFilters: `created_at_i>${numericFilters}`,
        hitsPerPage: 20,
        attributesToRetrieve: 'title,url,points,num_comments,author,created_at,objectID,_tags,story_title'
      },
      timeout: 8000
    });
    return resp.data;
  } catch (err) {
    console.error(`[hackernews] Search failed for "${query}":`, err.message);
    return { hits: [], nbHits: 0 };
  }
}

function extractTopics(titles) {
  const wordFreq = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'in', 'for', 'and', 'or', 'on', 'at', 'by', 'it', 'with', 'from', 'how', 'what', 'why', 'show', 'hn', 'ask', 'tell', 'new', 'your', 'you', 'this', 'that', 'has', 'have', 'not', 'can', 'will', 'just', 'about', 'all', 'up', 'out', 'now', 'more', 'than', 'its', 'was', 'been', 'use', 'using', 'get']);

  for (const title of titles) {
    const words = (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    for (const word of words) {
      if (word.length > 2 && !stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }
  }

  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));
}
