import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Tiny JSON disk cache. Every upstream response lands here so the app can boot
 * instantly from the last known data and keep working when the wiki is down.
 */
const dir = path.join(config.runtimeDir, 'cache');

function file(key) {
  return path.join(dir, `${key.replace(/[^a-z0-9_-]/gi, '_')}.json`);
}

export const cache = {
  read(key, maxAgeMs = Infinity) {
    try {
      const raw = JSON.parse(fs.readFileSync(file(key), 'utf8'));
      if (Date.now() - raw.at >= maxAgeMs) return null;
      return raw;
    } catch {
      return null;
    }
  },
  write(key, data) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file(key) + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), data }));
      fs.renameSync(tmp, file(key));
    } catch (err) {
      console.error(`[cache] write ${key}: ${err.message}`);
    }
  },
};
