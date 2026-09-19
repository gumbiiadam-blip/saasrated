import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Point the runtime dir at a temp folder and force live mode so the client uses fetch.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coffer-cache-'));
process.env.COFFER_OFFLINE = '0';
const { config } = await import('../server/config.js');
config.runtimeDir = tmp;
const { wiki } = await import('../server/wikiClient.js');

let calls = 0;
let fail = false;
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => {
    calls++;
    if (fail) throw new Error('ECONNREFUSED');
    return { ok: true, json: async () => ({ data: { 1: { high: 100, low: 90 } } }), text: async () => '<rss/>' };
  };
});
after(() => { globalThis.fetch = realFetch; fs.rmSync(tmp, { recursive: true, force: true }); });

test('latest fetches, caches to disk, and serves the cached copy when the wiki is down', async () => {
  const a = await wiki.latest();
  assert.equal(a.fromCache, false);
  assert.equal(a.data[1].high, 100);
  assert.ok(fs.existsSync(path.join(tmp, 'cache', 'latest.json')));
  fail = true;
  const b = await wiki.latest();
  assert.equal(b.fromCache, true);
  assert.equal(b.data[1].high, 100);
  assert.match(b.error, /ECONNREFUSED/);
});

test('mapping does not hit the network again while the cached copy is fresh', async () => {
  fail = false;
  calls = 0;
  await wiki.mapping();
  await wiki.mapping();
  await wiki.mapping();
  assert.equal(calls, 1);
});

test('throws only when there is no cached copy at all', async () => {
  fail = true;
  await assert.rejects(() => wiki.timeseries(999, '5m'), /ECONNREFUSED/);
});
