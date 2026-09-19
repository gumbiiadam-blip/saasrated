import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlips, sortFlips, filterFlips } from '../server/flips.js';
import { detectMoves } from '../server/dumps.js';

const now = Math.floor(Date.now() / 1000);
const mapping = new Map([
  [1, { id: 1, name: 'Whip', limit: 70, members: true }],
  [2, { id: 2, name: 'Coal', limit: 13000, members: false }],
  [3, { id: 3, name: 'Old thing', limit: 8, members: true }],
]);
const snap = {
  latest: {
    1: { high: 1_000_000, highTime: now, low: 950_000, lowTime: now },
    2: { high: 160, highTime: now, low: 150, lowTime: now },
    3: { high: 500, highTime: now - 7200, low: 400, lowTime: now },
  },
  oneHour: {
    1: { avgHighPrice: 1_000_000, highPriceVolume: 100, avgLowPrice: 950_000, lowPriceVolume: 20 },
    2: { avgHighPrice: 160, highPriceVolume: 50000, avgLowPrice: 150, lowPriceVolume: 50000 },
    3: { avgHighPrice: 500, highPriceVolume: 10, avgLowPrice: 450, lowPriceVolume: 10 },
  },
  fiveMin: { 1: { highPriceVolume: 5, lowPriceVolume: 5 }, 2: { highPriceVolume: 4000, lowPriceVolume: 4000 }, 3: { highPriceVolume: 1, lowPriceVolume: 1 } },
};

test('buildFlips computes margin, tax, roi and realistic per-limit profit', () => {
  const rows = buildFlips(mapping, snap);
  const whip = rows.find((r) => r.id === 1);
  assert.equal(whip.tax, 20_000);
  assert.equal(whip.margin, 30_000);
  assert.ok(Math.abs(whip.roi - 30_000 / 950_000) < 1e-9);
  // limit 70 but only 20 sold per hour on the low side -> 80 per 4h -> capped at limit 70
  assert.equal(whip.potential, 30_000 * 70);
  assert.equal(whip.stale, false);
  const old = rows.find((r) => r.id === 3);
  assert.equal(old.stale, true);
  assert.ok(old.score < old.potential);
});

test('sort and filter', () => {
  const rows = buildFlips(mapping, snap);
  assert.equal(sortFlips(rows, 'margin')[0].id, 1);
  assert.equal(sortFlips(rows, 'margin', 'asc')[0].id, 2);
  assert.deepEqual(filterFlips(rows, { f2p: '1' }).map((r) => r.id), [2]);
  assert.deepEqual(filterFlips(rows, { hideStale: '1' }).map((r) => r.id).sort(), [1, 2]);
  assert.deepEqual(filterFlips(rows, { search: 'coal' }).map((r) => r.id), [2]);
  assert.deepEqual(filterFlips(rows, { minMargin: 1000 }).map((r) => r.id), [1]);
});

test('detectMoves flags a dump with a volume spike and ignores quiet items', () => {
  const s = structuredClone(snap);
  // whip: low falls 10% below 1h avg, 5m sell volume 6x the run-rate (20/12 ≈ 1.7 -> need >= 3.4)
  s.latest[1].low = 855_000;
  s.fiveMin[1].lowPriceVolume = 12;
  const moves = detectMoves(mapping, s);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].kind, 'dump');
  assert.equal(moves[0].id, 1);
  assert.equal(moves[0].movePct, 10);
  // spike on the high side
  s.latest[2].high = 180;
  s.fiveMin[2].highPriceVolume = 20000;
  const moves2 = detectMoves(mapping, s, { minPrice: 100 });
  assert.ok(moves2.some((m) => m.kind === 'spike' && m.id === 2));
});
