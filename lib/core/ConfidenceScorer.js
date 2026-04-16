/**
 * ConfidenceScorer — assigns reliability scores and freshness indicators to data points.
 *
 * Tiers:
 *   government  (BLS, FRED, SEC EDGAR, World Bank, OECD) → 0.85–0.95
 *   market      (Alpha Vantage, NewsAPI)                  → 0.70–0.85
 *   community   (Reddit, HackerNews, Google Trends)       → 0.40–0.65
 *   llm         (AI-generated estimates)                  → 0.25–0.50
 */

const SOURCE_TIERS = {
  // Government / official
  bls:          { tier: 'government', base: 0.90 },
  fred:         { tier: 'government', base: 0.92 },
  'sec-edgar':  { tier: 'government', base: 0.88 },
  'world-bank': { tier: 'government', base: 0.85 },
  oecd:         { tier: 'government', base: 0.85 },
  // Market / third-party
  newsapi:        { tier: 'market', base: 0.75 },
  'alpha-vantage':{ tier: 'market', base: 0.80 },
  // Community / sentiment
  'google-trends':{ tier: 'community', base: 0.55 },
  reddit:         { tier: 'community', base: 0.45 },
  hackernews:     { tier: 'community', base: 0.50 },
  'open-alex':    { tier: 'community', base: 0.60 },
  // LLM estimates
  llm:            { tier: 'llm', base: 0.35 }
};

/**
 * Score a data result based on its source and freshness.
 * @param {string} sourceName — key from SOURCE_TIERS
 * @param {string|Date} fetchedAt — when the data was fetched
 * @param {object} [options]
 * @param {boolean} [options.isFallback] — true if this was a fallback source
 * @returns {{ confidence: number, tier: string, label: string, freshness: string }}
 */
function score(sourceName, fetchedAt, options = {}) {
  const info = SOURCE_TIERS[sourceName] || SOURCE_TIERS.llm;
  let confidence = info.base;

  // Freshness decay: data older than 7 days loses confidence
  if (fetchedAt) {
    const ageMs = Date.now() - new Date(fetchedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 30) confidence *= 0.7;
    else if (ageDays > 7) confidence *= 0.85;
    else if (ageDays > 1) confidence *= 0.95;
  }

  // Fallback penalty
  if (options.isFallback) confidence *= 0.8;

  confidence = Math.round(confidence * 100) / 100;

  // Human-readable label
  let label, freshness;
  if (confidence >= 0.8) label = 'Verified';
  else if (confidence >= 0.5) label = 'Estimated';
  else label = 'Projected';

  if (fetchedAt) {
    const ageMs = Date.now() - new Date(fetchedAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) freshness = 'Live';
    else if (ageHours < 24) freshness = 'Today';
    else if (ageHours < 168) freshness = 'This week';
    else freshness = 'Older than 7 days';
  } else {
    freshness = 'Unknown';
  }

  return { confidence, tier: info.tier, label, freshness };
}

/**
 * Wrap a data point with confidence metadata.
 */
function annotate(value, sourceName, fetchedAt, options = {}) {
  const scoreInfo = score(sourceName, fetchedAt, options);
  return {
    value,
    source: sourceName,
    fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    ...scoreInfo
  };
}

/**
 * Compute weighted average confidence for a collection of annotated data points.
 */
function aggregateConfidence(annotatedItems) {
  if (!annotatedItems || annotatedItems.length === 0) return 0;
  const total = annotatedItems.reduce((sum, item) => sum + (item.confidence || 0), 0);
  return Math.round((total / annotatedItems.length) * 100) / 100;
}

module.exports = { score, annotate, aggregateConfidence, SOURCE_TIERS };
