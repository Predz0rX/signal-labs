const axios = require('axios');

module.exports = {
  name: 'newsapi',
  tier: 'free',
  rateLimit: { requests: 100, windowMs: 86400000 }, // 100/day on free plan
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fetchedAt = new Date().toISOString();

    if (!process.env.NEWS_API_KEY) {
      return { data: [], source: 'NewsAPI', fetchedAt, confidence: 0, cacheKey: `newsapi:${industry}`, ttlSeconds: 1800 };
    }

    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: `"${industry}" market OR business OR growth OR trend`,
          from: sevenDaysAgo,
          language: 'en',
          sortBy: 'relevancy',
          pageSize: 10,
          apiKey: process.env.NEWS_API_KEY
        },
        timeout: 8000
      });

      const articles = (response.data.articles || []).map(a => ({
        title: a.title,
        description: a.description || '',
        source: a.source.name,
        publishedAt: a.publishedAt,
        url: a.url
      }));

      return {
        data: articles,
        source: 'NewsAPI',
        fetchedAt,
        confidence: 0.75,
        cacheKey: `newsapi:${industry}`,
        ttlSeconds: 1800 // 30 min — news is time-sensitive
      };
    } catch (err) {
      console.error('[newsapi] Error:', err.message);
      return { data: [], source: 'NewsAPI', fetchedAt, confidence: 0, cacheKey: `newsapi:${industry}`, ttlSeconds: 300 };
    }
  }
};
