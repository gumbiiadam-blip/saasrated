// Generates realistic-ish offline fixtures so Coffer runs and tests without network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fixtures');
fs.mkdirSync(dir, { recursive: true });

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const jitter = (n, pct) => Math.round(n * (1 + (rnd() * 2 - 1) * pct));

// id, name, limit, base price, hourly volume, members
const ITEMS = [
  [4151, 'Abyssal whip', 70, 1_450_000, 900, true],
  [11802, 'Armadyl godsword', 8, 12_500_000, 120, true],
  [13652, 'Dragon claws', 8, 45_000_000, 60, true],
  [12924, 'Toxic blowpipe (empty)', 8, 2_100_000, 150, true],
  [11832, 'Bandos chestplate', 8, 18_000_000, 90, true],
  [11834, 'Bandos tassets', 8, 24_000_000, 80, true],
  [20997, 'Twisted bow', 8, 1_550_000_000, 6, true],
  [22325, 'Scythe of vitur (uncharged)', 8, 780_000_000, 4, true],
  [26382, 'Torva full helm', 8, 210_000_000, 10, true],
  [2, 'Cannonball', 11000, 190, 900_000, true],
  [560, 'Death rune', 25000, 205, 600_000, false],
  [565, 'Blood rune', 25000, 260, 500_000, true],
  [561, 'Nature rune', 25000, 95, 800_000, false],
  [9075, 'Astral rune', 25000, 140, 300_000, true],
  [385, 'Shark', 13000, 830, 400_000, true],
  [13441, 'Anglerfish', 13000, 1_650, 150_000, true],
  [3024, 'Super restore(4)', 2000, 11_800, 40_000, true],
  [2434, 'Prayer potion(4)', 2000, 9_400, 60_000, true],
  [12695, 'Super combat potion(4)', 2000, 14_500, 30_000, true],
  [6685, 'Saradomin brew(4)', 2000, 5_900, 50_000, true],
  [453, 'Coal', 13000, 160, 1_000_000, false],
  [440, 'Iron ore', 13000, 90, 600_000, false],
  [2361, 'Adamantite bar', 10000, 1_900, 100_000, false],
  [2363, 'Runite bar', 10000, 12_300, 30_000, false],
  [1515, 'Yew logs', 13000, 240, 400_000, false],
  [1513, 'Magic logs', 13000, 1_050, 200_000, false],
  [536, 'Dragon bones', 7500, 2_700, 150_000, true],
  [22124, 'Superior dragon bones', 7500, 8_900, 20_000, true],
  [11840, 'Dragon boots', 70, 180_000, 800, true],
  [4087, 'Dragon platelegs', 70, 160_000, 700, true],
  [1187, 'Dragon sq shield', 70, 620_000, 200, true],
  [6585, 'Amulet of fury', 70, 2_900_000, 400, true],
  [19553, 'Amulet of torture', 8, 14_800_000, 100, true],
  [19547, 'Necklace of anguish', 8, 9_800_000, 80, true],
  [11284, 'Dragonfire shield', 8, 3_900_000, 120, true],
  [12002, 'Occult necklace', 8, 780_000, 300, true],
  [21034, 'Dexterous prayer scroll', 5, 18_000_000, 30, true],
  [21079, 'Arcane prayer scroll', 5, 6_500_000, 40, true],
  [12873, 'Dragon platebody', 8, 4_800_000, 90, true],
  [1631, 'Uncut dragonstone', 13000, 12_000, 40_000, true],
  [1615, 'Dragonstone', 13000, 12_500, 20_000, true],
  [5295, 'Ranarr seed', 200, 32_000, 15_000, true],
  [207, 'Grimy ranarr weed', 13000, 6_900, 120_000, true],
  [5316, 'Magic seed', 200, 95_000, 3_000, true],
  [5304, 'Torstol seed', 200, 48_000, 4_000, true],
  [13190, 'Old school bond', 100, 14_900_000, 4_000, false],
  [21820, 'Ancient essence', 20000, 250, 500_000, true],
  [24777, 'Blood shard', 5, 8_900_000, 150, true],
  [27275, 'Tumeken\'s shadow (uncharged)', 8, 1_250_000_000, 5, true],
  [26374, 'Zaryte crossbow', 8, 390_000_000, 8, true],
  [23995, 'Bow of faerdhinen (inactive)', 8, 120_000_000, 10, true],
  [25849, 'Lightbearer', 8, 4_800_000, 120, true],
  [28338, 'Voidwaker', 8, 78_000_000, 20, true],
  [22622, 'Kodai wand', 8, 92_000_000, 12, true],
  [25818, 'Osmumten\'s fang', 8, 19_000_000, 60, true],
  [1959, 'Pumpkin', 5000, 4_200, 1_200, false],
  [7060, 'Tuna potato', 10000, 1_200, 80_000, true],
  [11730, 'Saradomin sword', 8, 380_000, 400, true],
  [21003, 'Elder maul', 8, 39_000_000, 20, true],
  [12881, 'Ahrim\'s armour set', 8, 3_500_000, 60, true],
];

const now = Math.floor(Date.now() / 1000);
const mapping = ITEMS.map(([id, name, limit, value, , members]) => ({
  id, name, limit, members, value: Math.round(value * 0.6), highalch: Math.round(value * 0.6),
  icon: `${name.replace(/ /g, '_')}.png`, examine: `${name}. Looks tradeable.`,
}));

const latest = {}; const m5 = {}; const h1 = {}; const ts = {};
for (const [id, , , base, vol] of ITEMS) {
  const spread = base < 1000 ? 0.01 : base < 100_000 ? 0.02 : 0.035;
  const mid = jitter(base, 0.03);
  let low = Math.round(mid * (1 - spread / 2));
  let high = Math.round(mid * (1 + spread / 2));
  let avgLow = Math.round(mid * (1 - spread / 2));
  let avgHigh = Math.round(mid * (1 + spread / 2));
  let lowVol5 = Math.max(1, Math.round(vol / 12 * (0.6 + rnd() * 0.8)));
  let highVol5 = Math.max(1, Math.round(vol / 12 * (0.6 + rnd() * 0.8)));
  // Manufactured drama for the dump detector and news correlation
  if (id === 11802) { low = Math.round(avgLow * 0.88); lowVol5 = Math.round(vol / 12 * 6); } // AGS dump
  if (id === 24777) { low = Math.round(avgLow * 0.91); lowVol5 = Math.round(vol / 12 * 4); } // blood shard dump
  if (id === 5295) { high = Math.round(avgHigh * 1.12); highVol5 = Math.round(vol / 12 * 5); } // ranarr seed spike
  if (id === 28338) { high = Math.round(avgHigh * 1.07); highVol5 = Math.round(vol / 12 * 3); } // voidwaker spike
  if (id === 1959) { latest[id] = { high: 4300, highTime: now - 9000, low: 4100, lowTime: now - 8000 }; } // stale
  else latest[id] = { high, highTime: now - Math.round(rnd() * 600), low, lowTime: now - Math.round(rnd() * 600) };
  m5[id] = { avgHighPrice: high, highPriceVolume: highVol5, avgLowPrice: low, lowPriceVolume: lowVol5 };
  h1[id] = { avgHighPrice: avgHigh, highPriceVolume: Math.round(vol / 2), avgLowPrice: avgLow, lowPriceVolume: Math.round(vol / 2) };
  const series = [];
  let p = mid * 0.97;
  for (let i = 288; i >= 0; i--) {
    p = p * (1 + (rnd() - 0.5) * 0.01);
    const t = now - i * 300;
    series.push({ timestamp: t, avgHighPrice: Math.round(p * (1 + spread / 2)), avgLowPrice: Math.round(p * (1 - spread / 2)), highPriceVolume: Math.round(vol / 12), lowPriceVolume: Math.round(vol / 12) });
  }
  ts[id] = { '5m': series };
}

const news = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Old School RuneScape News</title>
<item><title>Armadyl Godsword Rework and Blood Shard Changes</title><link>https://secure.runescape.com/m=news/example-1</link><description><![CDATA[Following last week's poll, the Armadyl godsword special attack has been adjusted and the Blood shard drop rate at Darkmeyer is being reviewed. Voidwaker also receives a small buff.]]></description><category>Game Updates</category><pubDate>${new Date(Date.now() - 2 * 3600e3).toUTCString()}</pubDate></item>
<item><title>Herblore Rebalance: Ranarr seed drop rates</title><link>https://secure.runescape.com/m=news/example-2</link><description><![CDATA[We're adjusting Ranarr seed sources and looking at Super restore(4) as part of the herblore rebalance.]]></description><category>Game Updates</category><pubDate>${new Date(Date.now() - 26 * 3600e3).toUTCString()}</pubDate></item>
<item><title>This Week in OSRS: Deadman Mode returns</title><link>https://secure.runescape.com/m=news/example-3</link><description><![CDATA[Deadman: Armageddon is back. Bring your Dragon claws.]]></description><category>Community</category><pubDate>${new Date(Date.now() - 4 * 86400e3).toUTCString()}</pubDate></item>
</channel></rss>`;

fs.writeFileSync(path.join(dir, 'mapping.json'), JSON.stringify(mapping));
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ data: latest }));
fs.writeFileSync(path.join(dir, '5m.json'), JSON.stringify({ data: m5 }));
fs.writeFileSync(path.join(dir, '1h.json'), JSON.stringify({ data: h1 }));
fs.writeFileSync(path.join(dir, 'timeseries.json'), JSON.stringify(ts));
fs.writeFileSync(path.join(dir, 'news.rss'), news);
console.log(`wrote ${ITEMS.length} fixture items to ${dir}`);
