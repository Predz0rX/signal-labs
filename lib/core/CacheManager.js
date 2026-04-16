const NodeCache = require('node-cache');

// L1: In-memory cache with configurable TTL
const memoryCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

// L2: Supabase-backed persistent cache (optional)
let supabase = null;

function init(supabaseClient) {
  supabase = supabaseClient;
}

async function get(key) {
  // L1: Memory
  const mem = memoryCache.get(key);
  if (mem !== undefined) return mem;

  // L2: Supabase
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('data_cache')
      .select('data, expires_at')
      .eq('cache_key', key)
      .single();
    if (error || !data) return null;
    if (new Date(data.expires_at) < new Date()) {
      // Expired — clean up async
      supabase.from('data_cache').delete().eq('cache_key', key).then(() => {});
      return null;
    }
    // Warm L1 from L2
    const ttl = Math.max(1, Math.floor((new Date(data.expires_at) - new Date()) / 1000));
    memoryCache.set(key, data.data, Math.min(ttl, 3600));
    // Increment hit count async
    supabase.from('data_cache').update({ hit_count: (data.hit_count || 0) + 1 }).eq('cache_key', key).then(() => {});
    return data.data;
  } catch (err) {
    console.error('[CacheManager] L2 read error:', err.message);
    return null;
  }
}

async function set(key, value, { sourceName = 'unknown', ttlSeconds = 3600 } = {}) {
  // L1: Always set in memory
  memoryCache.set(key, value, Math.min(ttlSeconds, 3600));

  // L2: Persist if Supabase available
  if (!supabase) return;
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabase.from('data_cache').upsert({
      cache_key: key,
      source_name: sourceName,
      data: value,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
      hit_count: 0
    });
  } catch (err) {
    console.error('[CacheManager] L2 write error:', err.message);
  }
}

function clearMemory() {
  memoryCache.flushAll();
}

module.exports = { init, get, set, clearMemory };
