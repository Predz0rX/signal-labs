let googleTrends;
try {
  googleTrends = require('google-trends-api');
} catch (e) {
  googleTrends = null;
}

async function fetchTrends(industry) {
  if (!googleTrends) {
    console.warn('[fetchTrends] google-trends-api not available, using fallback');
    return {
      keyword: industry,
      interestScore: 65,
      trending: true,
      relatedTopics: [],
      note: 'Trend data unavailable — install google-trends-api'
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

    // Get related queries
    let relatedTopics = [];
    try {
      const relatedResult = await googleTrends.relatedQueries({ keyword: industry });
      const relatedParsed = JSON.parse(relatedResult);
      const top = relatedParsed?.default?.rankedList?.[0]?.rankedKeyword?.slice(0, 3) || [];
      relatedTopics = top.map(t => t.query);
    } catch (_) {}

    return {
      keyword: industry,
      interestScore: latest,
      avgScore90d: Math.round(avg),
      trending,
      relatedTopics
    };
  } catch (err) {
    console.error('[fetchTrends] Error:', err.message);
    return {
      keyword: industry,
      interestScore: 50,
      trending: true,
      relatedTopics: [],
      note: 'Could not fetch live trend data'
    };
  }
}

module.exports = { fetchTrends };
