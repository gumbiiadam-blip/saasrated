import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, matchItems } from '../server/news.js';
import { buildShortsPack } from '../server/shorts.js';

test('parseRss extracts items and decodes CDATA', () => {
  const xml = `<rss><channel><item><title>Hello &amp; welcome</title><link>https://x/1</link><description><![CDATA[<p>Dragon claws buffed</p>]]></description><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item></channel></rss>`;
  const posts = parseRss(xml);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, 'Hello & welcome');
  assert.equal(posts[0].description, 'Dragon claws buffed');
  assert.equal(posts[0].publishedAt, Date.parse('Mon, 01 Jan 2024 10:00:00 GMT'));
});

test('matchItems finds whole-word item names and skips short noise', () => {
  const mapping = new Map([
    [1, { id: 1, name: 'Dragon claws' }],
    [2, { id: 2, name: 'Bow' }],
    [3, { id: 3, name: 'Coal' }],
    [4, { id: 4, name: 'Cannonball' }],
  ]);
  const hits = matchItems('The Dragon claws and cannonballs got a rework; bring a bow.', mapping);
  assert.deepEqual(hits.sort(), [1, 4]);
});

test('buildShortsPack produces hook, countdown scenes and a CTA', () => {
  const rows = [
    { id: 1, name: 'A', buy: 100, sell: 120, margin: 18, roi: 0.18, limit: 10, hourlyVolume: 500, potential: 180 },
    { id: 2, name: 'B', buy: 200, sell: 230, margin: 26, roi: 0.13, limit: 5, hourlyVolume: 50, potential: 130 },
    { id: 3, name: 'C', buy: 300, sell: 330, margin: 24, roi: 0.08, limit: 1, hourlyVolume: 5, potential: 24 },
  ];
  const pack = buildShortsPack({ kind: 'flips', rows, count: 3, appName: 'Coffer', cta: 'coffer.gg', seed: 0 });
  assert.equal(pack.scenes[0].type, 'hook');
  assert.equal(pack.scenes.at(-1).type, 'cta');
  const items = pack.scenes.filter((s) => s.type === 'item');
  assert.deepEqual(items.map((s) => s.rank), [3, 2, 1]);
  assert.equal(items.at(-1).name, 'A');
  assert.equal(pack.totalDuration, 2.5 + 4 * 3 + 3);
  assert.ok(pack.hashtags.includes('#osrs'));
  assert.ok(pack.description.includes('coffer.gg'));
});
