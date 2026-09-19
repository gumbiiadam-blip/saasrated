import { wiki } from './wikiClient.js';
import { config } from './config.js';

/**
 * Official OSRS news, pulled from Jagex's RSS feed and cross-referenced against
 * the item list so we can show which posts touched which items and what the
 * price did afterwards. This is the "why did this dump" layer on top of the tools.
 */
const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'to', 'in', 'for', 'with', 'on', 'is', 'new', 'old', 'school', 'update', 'game', 'week', 'this', 'that', 'poll', 'blog', 'runescape']);

function unescapeXml(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? unescapeXml(m[1]) : '';
}

export function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const pubDate = tag(block, 'pubDate');
    items.push({
      title: tag(block, 'title'),
      link: tag(block, 'link'),
      description: tag(block, 'description'),
      category: tag(block, 'category'),
      publishedAt: pubDate ? Date.parse(pubDate) : null,
    });
  }
  return items;
}

/**
 * Find item names mentioned in a post. We only accept names that are either
 * multi-word or long enough to not be noise ("Bow" would match everything).
 */
export function matchItems(text, mapping) {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9()' ]+/g, ' ')} `;
  const hits = [];
  for (const meta of mapping.values()) {
    const name = meta.name.toLowerCase();
    if (name.length < 6 && !name.includes(' ')) continue;
    if (STOP.has(name)) continue;
    // Whole-word match
    if (hay.includes(` ${name} `) || hay.includes(` ${name}s `)) hits.push(meta.id);
  }
  return hits;
}

export class NewsStore {
  constructor(market) {
    this.market = market;
    this.posts = [];
    this.updatedAt = 0;
    this.timer = null;
  }

  async refresh() {
    try {
      const { data: xml } = await wiki.newsRss();
      const parsed = parseRss(xml);
      this.posts = parsed.map((p) => ({
        ...p,
        items: matchItems(`${p.title} ${p.description}`, this.market.mapping),
      }));
      this.updatedAt = Date.now();
    } catch (err) {
      this.market.recordError('news', err);
    }
  }

  start() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), config.newsRefreshMinutes * 60_000).unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Posts enriched with what each mentioned item's price has done since. */
  enriched(tier) {
    const snap = this.market.snapshot(tier);
    return this.posts.map((p) => ({
      ...p,
      items: p.items.map((id) => {
        const meta = this.market.mapping.get(id);
        const latest = snap.latest?.[id];
        const h1 = snap.oneHour?.[id];
        const mid = latest ? Math.round(((latest.high || latest.low) + (latest.low || latest.high)) / 2) : null;
        const ref = h1?.avgLowPrice && h1?.avgHighPrice ? Math.round((h1.avgLowPrice + h1.avgHighPrice) / 2) : null;
        return {
          id,
          name: meta?.name,
          icon: meta?.icon,
          price: mid,
          changePct1h: mid && ref ? Number((((mid - ref) / ref) * 100).toFixed(2)) : null,
        };
      }),
    }));
  }

  /** Map of item id -> most recent post that mentioned it (for badges on the tools). */
  itemIndex(maxAgeDays = 14) {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const index = {};
    for (const p of this.posts) {
      if (p.publishedAt && p.publishedAt < cutoff) continue;
      for (const id of p.items) {
        if (!index[id] || (p.publishedAt || 0) > (index[id].publishedAt || 0)) {
          index[id] = { title: p.title, link: p.link, publishedAt: p.publishedAt };
        }
      }
    }
    return index;
  }
}
