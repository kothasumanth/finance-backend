const assert = require('node:assert/strict');
const test = require('node:test');
const { createMfApiCache } = require('../mfApiCache');

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

test('caches NAV history per scheme until the TTL expires', async () => {
  let time = 0;
  let calls = 0;
  const cache = createMfApiCache({
    ttlMs: 100,
    now: () => time,
    fetchImpl: async () => {
      calls += 1;
      return response({ data: [{ nav: String(calls) }] });
    }
  });

  const first = await cache.getHistory('123');
  const second = await cache.getHistory('123');
  assert.equal(first.data[0].nav, '1');
  assert.equal(second.data[0].nav, '1');
  assert.equal(calls, 1);

  time = 100;
  const refreshed = await cache.getHistory('123');
  assert.equal(refreshed.data[0].nav, '2');
  assert.equal(calls, 2);
});

test('coalesces concurrent requests for the same scheme', async () => {
  let calls = 0;
  let resolveFetch;
  const cache = createMfApiCache({
    fetchImpl: () => {
      calls += 1;
      return new Promise(resolve => {
        resolveFetch = resolve;
      });
    }
  });

  const firstRequest = cache.getHistory('123');
  const secondRequest = cache.getHistory('123');
  resolveFetch(response({ data: [] }));

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test('does not cache failed or invalid MFAPI responses', async () => {
  let calls = 0;
  const cache = createMfApiCache({
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response({}, 429)
        : response({ data: [] });
    }
  });

  await assert.rejects(cache.getHistory('123'), /MFAPI request failed \(429\)/);
  assert.deepEqual(await cache.getHistory('123'), { data: [] });
  assert.equal(calls, 2);

  const invalidCache = createMfApiCache({
    fetchImpl: async () => response({ data: null })
  });
  await assert.rejects(invalidCache.getHistory('123'), /invalid NAV history/);
});
