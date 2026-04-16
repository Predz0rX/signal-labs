const axios = require('axios');

/**
 * Reddit API — Community sentiment, pain points, trending topics.
 * Uses OAuth2 for authenticated access (60 req/min).
 * Falls back to public JSON endpoints if no credentials.
 * https://www.reddit.com/dev/api/
 */

const INDUSTRY_SUBREDDITS = {
  'saas': ['SaaS', 'startups', 'EntrepreneurRideAlong'],
  'software': ['programming', 'webdev', 'SaaS'],
  'tech': ['technology', 'startups', 'Futurology'],
  'ai': ['artificial', 'MachineLearning', 'LocalLLaMA'],
  'healthcare': ['healthcare', 'healthIT', 'medicine'],
  'biotech': ['biotech', 'science', 'investing'],
  'retail': ['retail', 'ecommerce', 'smallbusiness'],
  'ecommerce': ['ecommerce', 'shopify', 'FulfillmentByAmazon'],
  'finance': ['finance', 'FinancialPlanning', 'fintech'],
  'fintech': ['fintech', 'CryptoCurrency', 'investing'],
  'real estate': ['realestateinvesting', 'RealEstate', 'CommercialRealEstate'],
  'construction': ['Construction', 'Homebuilding', 'architecture'],
  'manufacturing': ['manufacturing', 'engineering', 'supplychain'],
  'energy': ['energy', 'renewableenergy', 'solar'],
  'education': ['edtech', 'Teachers', 'OnlineEducation'],
  'hospitality': ['hospitality', 'restaurant', 'foodservice'],
  'restaurant': ['restaurateur', 'KitchenConfidential', 'foodservice'],
  'logistics': ['logistics', 'supplychain', 'trucking'],
  'media': ['media', 'journalism', 'marketing'],
  'agriculture': ['farming', 'agriculture', 'AgTech'],
  'insurance': ['Insurance', 'insurtech', 'actuary'],
};

function getSubreddits(industry) {
  const lower = (industry || '').toLowerCase();
  for (const [key, subs] of Object.entries(INDUSTRY_SUBREDDITS)) {
    if (lower.includes(key)) return subs;
  }
  return ['business', 'startups', 'Entrepreneur'];
}

let accessToken = null;
let tokenExpiry = 0;

async function getOAuthToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const resp = await axios.post('https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'signal-labs/1.0' },
        timeout: 5000
      }
    );
    accessToken = resp.data.access_token;
    tokenExpiry = Date.now() + (resp.data.expires_in - 60) * 1000;
    return accessToken;
  } catch (err) {
    console.error('[reddit] OAuth error:', err.message);
    return null;
  }
}

module.exports = {
  name: 'reddit',
  tier: 'free',
  rateLimit: { requests: 30, windowMs: 60000 },
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const subreddits = getSubreddits(industry);
    const fetchedAt = new Date().toISOString();

    try {
      const token = await getOAuthToken();
      const headers = token
        ? { Authorization: `Bearer ${token}`, 'User-Agent': 'signal-labs/1.0' }
        : { 'User-Agent': 'signal-labs/1.0' };
      const baseUrl = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';

      // Fetch top posts from industry subreddits
      const results = await Promise.allSettled(
        subreddits.slice(0, 3).map(async (sub) => {
          const resp = await axios.get(`${baseUrl}/r/${sub}/hot.json`, {
            params: { limit: 10, t: 'week' },
            headers,
            timeout: 8000
          });
          return (resp.data?.data?.children || []).map(c => ({
            subreddit: sub,
            title: c.data.title,
            score: c.data.score,
            comments: c.data.num_comments,
            created: new Date(c.data.created_utc * 1000).toISOString(),
            url: `https://reddit.com${c.data.permalink}`,
            flair: c.data.link_flair_text || null
          }));
        })
      );

      const allPosts = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      // Extract themes from titles
      const themes = extractThemes(allPosts.map(p => p.title), industry);

      // Calculate engagement metrics
      const totalEngagement = allPosts.reduce((s, p) => s + p.score + p.comments, 0);
      const avgEngagement = allPosts.length > 0 ? Math.round(totalEngagement / allPosts.length) : 0;

      return {
        data: {
          posts: allPosts,
          themes,
          subreddits: subreddits.slice(0, 3),
          metrics: { totalPosts: allPosts.length, avgEngagement, totalEngagement },
          industry
        },
        source: 'Reddit',
        fetchedAt,
        confidence: allPosts.length >= 5 ? 0.50 : 0.25,
        cacheKey: `reddit:${industry}`,
        ttlSeconds: 3600 // 1h
      };
    } catch (err) {
      console.error('[reddit] Error:', err.message);
      return {
        data: { posts: [], themes: [], metrics: {}, note: `Reddit fetch failed: ${err.message}` },
        source: 'Reddit',
        fetchedAt,
        confidence: 0,
        cacheKey: `reddit:${industry}`,
        ttlSeconds: 1800
      };
    }
  }
};

function extractThemes(titles, industry) {
  const wordFreq = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'for', 'and', 'or', 'but', 'on', 'at', 'by', 'it', 'its', 'my', 'your', 'this', 'that', 'with', 'from', 'how', 'what', 'why', 'i', 'you', 'we', 'they', 'has', 'have', 'had', 'do', 'does', 'did', 'not', 'so', 'if', 'just', 'about', 'can', 'will', 'would', 'any', 'all', 'up', 'out', 'no', 'get', 'got', 'im', 'ive', 'dont', 'one', 'new', industry.toLowerCase()]);

  for (const title of titles) {
    const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
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
