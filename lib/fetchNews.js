const axios = require('axios');

async function fetchNews(industry) {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: `"${industry}" market OR business OR growth OR trend`,
        from: sevenDaysAgo,
        language: 'en',
        sortBy: 'relevancy',
        pageSize: 5,
        apiKey: process.env.NEWS_API_KEY
      },
      timeout: 8000
    });

    if (response.data.articles && response.data.articles.length > 0) {
      return response.data.articles.map(a => ({
        title: a.title,
        description: a.description || '',
        source: a.source.name,
        publishedAt: a.publishedAt,
        url: a.url
      }));
    }
    return [];
  } catch (err) {
    console.error('[fetchNews] Error:', err.message);
    return [];
  }
}

module.exports = { fetchNews };
