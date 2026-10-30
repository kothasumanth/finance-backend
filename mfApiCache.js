const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

function createMfApiCache({ fetchImpl = fetch, ttlMs = CACHE_TTL_MS, now = Date.now } = {}) {
  const cache = new Map();
  const inFlight = new Map();

  async function getHistory(googleValue) {
    const schemeCode = String(googleValue || '').trim();
    if (!schemeCode) throw new Error('A mutual fund scheme code is required');

    const cached = cache.get(schemeCode);
    if (cached && cached.expiresAt > now()) return cached.data;

    if (inFlight.has(schemeCode)) return inFlight.get(schemeCode);

    const request = (async () => {
      const response = await fetchImpl(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`);
      if (!response.ok) throw new Error(`MFAPI request failed (${response.status})`);

      const payload = await response.json();
      if (!payload || !Array.isArray(payload.data)) {
        throw new Error('MFAPI returned an invalid NAV history response');
      }

      cache.delete(schemeCode);
      cache.set(schemeCode, { data: payload, expiresAt: now() + ttlMs });
      if (cache.size > MAX_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
      }
      return payload;
    })();

    inFlight.set(schemeCode, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(schemeCode) === request) inFlight.delete(schemeCode);
    }
  }

  return { getHistory };
}

const mfApiCache = createMfApiCache();

module.exports = { createMfApiCache, getMfHistory: mfApiCache.getHistory };
