import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.COFFER_OFFLINE = '1';
process.env.COFFER_PREMIUM_KEYS = 'test-premium';
const { start } = await import('../server/index.js');
const { market } = await import('../server/marketStore.js');

let server, base;
before(async () => {
  process.env.PORT = '0';
  server = await start();
  await new Promise((r) => (server.listening ? r() : server.on('listening', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); market.stop(); });

const get = (p, key) => fetch(base + p, { headers: key ? { Authorization: `Bearer ${key}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('free tier gets slow refresh and a capped, redacted flip table', async () => {
  const me = await get('/api/me');
  assert.equal(me.body.tier, 'free');
  assert.equal(me.body.refreshSeconds, me.body.freeRefreshSeconds);
  const flips = await get('/api/flips?sort=margin');
  assert.equal(flips.body.rows.length, 25);
  assert.equal(flips.body.rows[0].hourlyVolume, null);
  assert.equal(flips.body.rows[0].potential, null);
});

test('premium is 10x faster and gets the full table with volume', async () => {
  const me = await get('/api/me', 'test-premium');
  assert.equal(me.body.tier, 'premium');
  assert.equal(me.body.freeRefreshSeconds / me.body.refreshSeconds, 10);
  const flips = await get('/api/flips?sort=margin', 'test-premium');
  assert.ok(flips.body.rows.length > 25);
  assert.equal(typeof flips.body.rows[0].hourlyVolume, 'number');
});

test('dump detector is premium-only and links dumps to news', async () => {
  const locked = await get('/api/moves');
  assert.equal(locked.status, 402);
  const moves = await get('/api/moves', 'test-premium');
  const ags = moves.body.moves.find((m) => m.name === 'Armadyl godsword');
  assert.ok(ags, 'AGS dump detected');
  assert.equal(ags.kind, 'dump');
  assert.ok(ags.news && /Armadyl/.test(ags.news.title));
  const summary = await get('/api/moves/summary');
  assert.ok(summary.body.dumps >= 1);
});

test('news posts carry matched items with price change', async () => {
  const news = await get('/api/news');
  const post = news.body.posts.find((p) => /Armadyl/.test(p.title));
  assert.ok(post.items.some((i) => i.name === 'Armadyl godsword' && typeof i.changePct1h === 'number'));
});

test('item detail: chart only for premium', async () => {
  const free = await get('/api/item/4151');
  assert.equal(free.body.timeseries, undefined);
  const prem = await get('/api/item/4151?step=5m', 'test-premium');
  assert.ok(prem.body.timeseries.length > 100);
});

test('upgrade with a bad key is rejected, good key sets a cookie', async () => {
  const bad = await fetch(base + '/api/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":"nope"}' });
  assert.equal(bad.status, 401);
  const good = await fetch(base + '/api/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":"test-premium"}' });
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /coffer_key=test-premium/);
});

test('shorts pack is premium-only and built from live rows', async () => {
  assert.equal((await get('/api/shorts/pack')).status, 402);
  const pack = await get('/api/shorts/pack?kind=dumps&count=3', 'test-premium');
  assert.equal(pack.body.kind, 'dumps');
  assert.ok(pack.body.items.includes('Armadyl godsword'));
});

test('alerts CRUD', async () => {
  const res = await fetch(base + '/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-premium' }, body: JSON.stringify({ itemId: 4151, metric: 'low', op: '<=', value: 999_999_999 }) });
  assert.equal(res.status, 200);
  const { alert } = await res.json();
  const list = await get('/api/alerts', 'test-premium');
  assert.ok(list.body.alerts.some((a) => a.id === alert.id));
  await fetch(base + `/api/alerts/${alert.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer test-premium' } });
  const list2 = await get('/api/alerts', 'test-premium');
  assert.ok(!list2.body.alerts.some((a) => a.id === alert.id));
});
