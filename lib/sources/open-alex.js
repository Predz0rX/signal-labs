const axios = require('axios');

/**
 * OpenAlex API — Academic research publication trends, R&D investment signals.
 * Free, 100,000 requests/day, no API key required (but polite pool with email).
 * https://docs.openalex.org/
 */

module.exports = {
  name: 'open-alex',
  tier: 'free',
  rateLimit: { requests: 30, windowMs: 60000 },
  fallback: null,

  async fetch(query) {
    const industry = query.industry || query;
    const fetchedAt = new Date().toISOString();

    try {
      // Search for works (papers) related to this industry
      const currentYear = new Date().getFullYear();
      const fiveYearsAgo = currentYear - 5;

      // Get publication trends by year
      const [recentWorks, yearlyTrend, topConcepts] = await Promise.all([
        searchWorks(industry, 20),
        getYearlyTrend(industry, fiveYearsAgo, currentYear),
        getTopConcepts(industry)
      ]);

      // Process publications
      const publications = (recentWorks.results || []).map(w => ({
        title: w.title,
        year: w.publication_year,
        citationCount: w.cited_by_count || 0,
        source: w.primary_location?.source?.display_name || 'Unknown',
        openAccess: w.open_access?.is_oa || false,
        type: w.type,
        doi: w.doi
      }));

      // Process yearly trend
      const yearCounts = (yearlyTrend.group_by || []).map(g => ({
        year: g.key,
        count: g.count
      })).sort((a, b) => parseInt(a.year) - parseInt(b.year));

      // Calculate research velocity
      let velocity = 'N/A';
      if (yearCounts.length >= 2) {
        const recent = yearCounts[yearCounts.length - 1]?.count || 0;
        const prior = yearCounts[yearCounts.length - 2]?.count || 1;
        velocity = `${(((recent - prior) / prior) * 100).toFixed(1)}%`;
      }

      // Process top concepts (research themes)
      const concepts = (topConcepts.group_by || []).slice(0, 10).map(c => ({
        name: c.key_display_name || c.key,
        count: c.count
      }));

      return {
        data: {
          publications: publications.slice(0, 10),
          yearlyTrend: yearCounts,
          concepts,
          metrics: {
            totalPublications: recentWorks.meta?.count || 0,
            avgCitations: publications.length > 0
              ? Math.round(publications.reduce((s, p) => s + p.citationCount, 0) / publications.length)
              : 0,
            researchVelocity: velocity,
            topSource: publications[0]?.source || 'N/A'
          },
          industry
        },
        source: 'OpenAlex (academic research)',
        fetchedAt,
        confidence: publications.length >= 5 ? 0.60 : 0.30,
        cacheKey: `openalex:${industry}`,
        ttlSeconds: 86400 // 24h — academic data doesn't change fast
      };
    } catch (err) {
      console.error('[open-alex] Error:', err.message);
      return {
        data: { publications: [], yearlyTrend: [], concepts: [], metrics: {} },
        source: 'OpenAlex',
        fetchedAt,
        confidence: 0,
        cacheKey: `openalex:${industry}`,
        ttlSeconds: 3600
      };
    }
  }
};

async function searchWorks(query, perPage = 20) {
  try {
    const resp = await axios.get('https://api.openalex.org/works', {
      params: {
        search: query,
        per_page: perPage,
        sort: 'cited_by_count:desc',
        filter: `publication_year:>${new Date().getFullYear() - 3}`
      },
      headers: { 'User-Agent': 'mailto:contact@signallabs.ai' },
      timeout: 10000
    });
    return resp.data;
  } catch (err) {
    return { results: [], meta: { count: 0 } };
  }
}

async function getYearlyTrend(query, startYear, endYear) {
  try {
    const resp = await axios.get('https://api.openalex.org/works', {
      params: {
        search: query,
        filter: `publication_year:${startYear}-${endYear}`,
        group_by: 'publication_year'
      },
      headers: { 'User-Agent': 'mailto:contact@signallabs.ai' },
      timeout: 10000
    });
    return resp.data;
  } catch (err) {
    return { group_by: [] };
  }
}

async function getTopConcepts(query) {
  try {
    const resp = await axios.get('https://api.openalex.org/works', {
      params: {
        search: query,
        filter: `publication_year:>${new Date().getFullYear() - 2}`,
        group_by: 'concepts.id'
      },
      headers: { 'User-Agent': 'mailto:contact@signallabs.ai' },
      timeout: 10000
    });
    return resp.data;
  } catch (err) {
    return { group_by: [] };
  }
}
