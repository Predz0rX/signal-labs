const Bottleneck = require('bottleneck');
const CacheManager = require('./CacheManager');
const { annotate } = require('./ConfidenceScorer');

const sources = {};
const limiters = {};

/**
 * Register a data source.
 * @param {object} source — must have: name, tier, rateLimit, fetch(query), optional fallback
 */
function register(source) {
  if (!source.name || typeof source.fetch !== 'function') {
    throw new Error(`Invalid source: must have name and fetch(). Got: ${JSON.stringify(source)}`);
  }
  sources[source.name] = source;

  // Create a Bottleneck limiter per source
  const rl = source.rateLimit || { requests: 60, windowMs: 60000 };
  limiters[source.name] = new Bottleneck({
    reservoir: rl.requests,
    reservoirRefreshAmount: rl.requests,
    reservoirRefreshInterval: rl.windowMs,
    maxConcurrent: Math.min(rl.requests, 5)
  });
}

/**
 * Fetch data from a registered source, with caching, rate limiting, and fallback.
 * @param {string} sourceName
 * @param {object} query — passed to the source's fetch()
 * @returns {object} — { data, source, fetchedAt, confidence, tier, label, freshness }
 */
async function fetch(sourceName, query) {
  const source = sources[sourceName];
  if (!source) throw new Error(`Unknown data source: ${sourceName}`);

  // Build cache key
  const cacheKey = `${sourceName}:${JSON.stringify(query)}`;

  // Check cache first
  const cached = await CacheManager.get(cacheKey);
  if (cached) {
    return annotate(cached.data, sourceName, cached.fetchedAt || new Date().toISOString());
  }

  // Fetch with rate limiting
  const limiter = limiters[sourceName];
  try {
    const result = await limiter.schedule(() => source.fetch(query));

    // Cache the result
    await CacheManager.set(cacheKey, {
      data: result.data,
      fetchedAt: result.fetchedAt
    }, {
      sourceName,
      ttlSeconds: result.ttlSeconds || 3600
    });

    return annotate(result.data, sourceName, result.fetchedAt, { isFallback: false });
  } catch (err) {
    console.error(`[DataSourceRegistry] ${sourceName} failed:`, err.message);

    // Try fallback
    if (source.fallback && sources[source.fallback]) {
      console.log(`[DataSourceRegistry] Falling back from ${sourceName} to ${source.fallback}`);
      try {
        const fallbackResult = await fetch(source.fallback, query);
        fallbackResult.isFallback = true;
        fallbackResult.originalSource = sourceName;
        return fallbackResult;
      } catch (fallbackErr) {
        console.error(`[DataSourceRegistry] Fallback ${source.fallback} also failed:`, fallbackErr.message);
      }
    }

    // Return error marker
    return annotate(null, sourceName, new Date().toISOString(), { isFallback: false });
  }
}

/**
 * Fetch from multiple sources in parallel. Returns a map of sourceName → result.
 * Failed sources return annotated null.
 */
async function fetchAll(sourceNames, query) {
  const results = {};
  const promises = sourceNames.map(async (name) => {
    results[name] = await fetch(name, query);
  });
  await Promise.allSettled(promises);
  return results;
}

/**
 * Get all registered source names.
 */
function getRegistered() {
  return Object.keys(sources);
}

/**
 * Check if a source is registered.
 */
function has(name) {
  return !!sources[name];
}

module.exports = { register, fetch, fetchAll, getRegistered, has };
