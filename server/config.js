import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  root,
  port: num(process.env.PORT, 3000),
  appName: process.env.APP_NAME || 'GEandChill',
  appTagline: process.env.APP_TAGLINE || 'OSRS market, minus the sweat',
  appUrl: process.env.APP_URL || 'geandchill.com',
  idleAfterSeconds: num(process.env.COFFER_IDLE_AFTER_SECONDS, 600),
  newsRefreshMinutes: num(process.env.COFFER_NEWS_REFRESH_MINUTES, 30),
  offline: process.env.COFFER_OFFLINE === '1',
  userAgent: process.env.COFFER_USER_AGENT || 'coffer/0.1 (standalone OSRS market app; set COFFER_USER_AGENT)',
  premiumKeys: (process.env.COFFER_PREMIUM_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  freeRefreshSeconds: num(process.env.COFFER_FREE_REFRESH_SECONDS, 300),
  premiumRefreshSeconds: num(process.env.COFFER_PREMIUM_REFRESH_SECONDS, 30),
  geTaxRate: num(process.env.COFFER_GE_TAX_RATE, 0.02),
  geTaxCap: num(process.env.COFFER_GE_TAX_CAP, 5_000_000),
  freeTopN: num(process.env.COFFER_FREE_TOP_N, 25),
  wikiBase: 'https://prices.runescape.wiki/api/v1/osrs',
  newsRss: 'https://secure.runescape.com/m=news/latest_news.rss?oldschool=true',
  fixturesDir: path.join(root, 'data', 'fixtures'),
  runtimeDir: path.join(root, 'data', 'runtime'),
};
