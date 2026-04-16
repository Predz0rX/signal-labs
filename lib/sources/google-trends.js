let googleTrends;
try {
  googleTrends = require('google-trends-api');
} catch (e) {
  googleTrends = null;
}

module.exports = {
  name: 'google-trends',
  tier: 'free',
  rateLimit: { requests: 30, windowMs: 60000 },
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const fetchedAt = new Date().toISOString();

    if (!googleTrends) {
      console.warn('[google-trends] Package not available, using fallback');
      return {
        data: { keyword: industry, interestScore: 65, trending: true, relatedTopics: [], note: 'Trend data unavailable' },
        source: 'Google Trends (fallback)',
        fetchedAt,
        confidence: 0.20,
        cacheKey: `gtrends:${industry}`,
        ttlSeconds: 3600
      };
    }

    try {
      const result = await googleTrends.interestOverTime({
        keyword: industry,
        startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endTime: new Date()
      });

      const parsed = JSON.parse(result);
      const timelineData = parsed?.default?.timelineData || [];
      if (timelineData.length === 0) throw new Error('No timeline data');

      const values = timelineData.map(d => d.value[0]);
      const latest = values[values.length - 1];
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const trending = latest > avg;

      // Calculate velocity (slope of recent data)
      const recentValues = values.slice(-4);
      const velocity = recentValues.length >= 2
        ? ((recentValues[recentValues.length - 1] - recentValues[0]) / recentValues[0] * 100).toFixed(1)
        : '0';

      let relatedTopics = [];
      try {
        const relatedResult = await googleTrends.relatedQueries({ keyword: industry });
        const relatedParsed = JSON.parse(relatedResult);
        const top = relatedParsed?.default?.rankedList?.[0]?.rankedKeyword?.slice(0, 5) || [];
        relatedTopics = top.map(t => t.query);
      } catch (_) {}

      return {
        data: {
          keyword: industry,
          interestScore: latest,
          avgScore90d: Math.round(avg),
          trending,
          velocity: `${velocity}%`,
          relatedTopics,
          dataPoints: values.length
        },
        source: 'Google Trends',
        fetchedAt,
        confidence: 0.55,
        cacheKey: `gtrends:${industry}`,
        ttlSeconds: 7200 // 2h
      };
    } catch (err) {
      console.error('[google-trends] Error:', err.message);
      return {
        data: { keyword: industry, interestScore: 50, trending: true, relatedTopics: [], note: 'Could not fetch live data' },
        source: 'Google Trends (fallback)',
        fetchedAt,
        confidence: 0.20,
        cacheKey: `gtrends:${industry}`,
        ttlSeconds: 3600
      };
    }
  }
};
