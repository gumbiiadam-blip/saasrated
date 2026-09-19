# GEandChill

Codename Coffer (that's why the env vars say `COFFER_`). A standalone Old School RuneScape market app. Live Grand Exchange flips, dump and spike detection, official news cross-referenced with prices, alerts, and a Shorts Studio that turns the market into 9:16 video with a call to action.

No framework, no build step. Node 20+, one dependency (Express), vanilla front end.

## Run it

```bash
cp .env.example .env         # set COFFER_PREMIUM_KEYS and COFFER_USER_AGENT
npm install
npm start                    # http://localhost:3000
```

Set `COFFER_USER_AGENT` to something that identifies you. The OSRS Wiki asks for it and will block anonymous clients.

Brand is config: `APP_NAME`, `APP_TAGLINE`, `APP_URL` drive the header, the Shorts frames and the CTA. Rename without touching code.

## Offline first, light on the wiki

- Every upstream response is written to `data/runtime/cache/`. On boot the app serves the last known data instantly and refreshes in the background. If the wiki is down or you have no connection, it keeps serving the cached copy and the UI shows an offline banner with the timestamp.
- The server polls only while someone is using the app (`COFFER_IDLE_AFTER_SECONDS`, default 10 min), and only at the cadence of the highest active tier. Free-only traffic never triggers the 30s poll. An idle server makes zero requests.
- The 5m and 1h endpoints are fetched once per 5-minute bucket (1h every third bucket), not on every tick. The item list is refreshed weekly, news every 30 min, timeseries cached per step.
- The client is an installable PWA. A service worker caches the app shell and the last API answers, so it opens and shows the last prices with no server at all. Hidden tabs stop polling.

Worst case for the wiki with one premium user glued to the tab: one `latest` call every 30s plus one 5m call every 5 min and one 1h call every 15 min.

Need it to run without internet (tests, demos):

```bash
npm run fixtures             # regenerates data/fixtures
npm run offline              # serves the fixtures instead of the wiki
npm test
```

## On your phone

A phone can't run Node, so the server runs elsewhere and the phone opens it. Either:

**Same Wi-Fi.** Run `npm start` on your PC or laptop. The startup log prints `On your phone: http://192.168.x.x:3000`. Open that on the phone, then "Add to Home Screen" (Safari share menu, or Chrome's ⋮ menu). It installs as an app with the service worker, so it still opens and shows the last prices when the laptop is off. Windows may ask to allow Node through the firewall the first time.

**Anywhere.** Push the repo to GitHub and click "New → Blueprint" on [Render](https://render.com) pointing at it; `render.yaml` does the rest. Set `COFFER_USER_AGENT` in the dashboard, copy the generated `COFFER_PREMIUM_KEYS` value, open the URL on your phone, Add to Home Screen, paste the key into Upgrade. Free tier sleeps after 15 idle minutes and wakes on the next request, which the PWA covers by showing cached prices in the meantime.

Docker:

```bash
docker build -t coffer . && docker run -p 3000:3000 --env-file .env coffer
```

## Free vs Premium

| | Free | Premium |
|---|---|---|
| Price refresh | every 5 min | every 30 s (10× faster) |
| Flip table | top 25 | everything |
| Volume, per-limit profit | hidden | shown |
| Dumps & spikes | count only | full list with news cause |
| Price charts | no | 5m / 1h / 6h / 24h |
| Alerts | no | live (SSE) + browser notifications |
| Watchlist | 5 items | unlimited |
| Shorts Studio | no | yes |

Premium is unlocked with a key from `COFFER_PREMIUM_KEYS` entered on the Upgrade dialog (or sent as `Authorization: Bearer <key>` to the API). Swap in Stripe by issuing a key on successful checkout.

The tiers are enforced server-side. The server polls the wiki once at the premium cadence and keeps two snapshots. The free snapshot is copied from the fast one every `COFFER_FREE_REFRESH_SECONDS`, so free users get data that is genuinely that old and the wiki is never hit twice for the same data.

## What each tool does

**Flips.** Buy = current instant-sell price, Sell = current instant-buy price. Margin is after the 2% GE tax (capped at 5m, exempt items handled). ROI = margin / buy. "Per limit" is margin × the number you can realistically move in one 4h buy-limit window, bounded by both the buy limit and the thinner side of the hourly volume. Rows where either price is over an hour old are marked stale and scored down.

**Dumps & spikes.** A dump is an item whose instant-sell price is at least 4% below its 1h average while sell-side 5-minute volume is at least 2× the hourly run rate: someone is offloading. A spike is the mirror. Thresholds are adjustable. Items mentioned in OSRS news in the last 14 days show the post as the possible cause.

**News.** Official OSRS RSS. Item names are matched against every post; each chip shows what that item has done vs its 1h average. Items in the news get a 📰 badge in the Flips and Dumps tables.

**Alerts.** Buy price, sell price, or margin, ≤ or ≥ a number. Evaluated every fast refresh, one ping per crossing, re-armed when the condition clears. Delivered over Server-Sent Events and the Notification API.

**Shorts Studio.** Picks the top N flips, dumps, or spikes, writes a hook, a countdown, on-screen captions, a voiceover script, title, description and hashtags, and records a 1080×1920 WebM straight from a canvas in the browser. The last scene is the CTA: "Free users see this 5 minutes late." Convert to MP4 with:

```
ffmpeg -i coffer-flips-2026-01-01.webm -c:v libx264 -pix_fmt yuv420p short.mp4
```

## API

All endpoints return JSON. Tier comes from the `coffer_key` cookie or a bearer token.

| Endpoint | Tier | Notes |
|---|---|---|
| `GET /api/me` | any | tier, refresh cadence, data status |
| `GET /api/flips?sort=&dir=&search=&minMargin=&minRoi=&maxBuy=&minVolume=&f2p=1&hideStale=1` | any | free: top 25, volume redacted |
| `GET /api/moves?pct=&vol=&minPrice=` | premium | dumps and spikes |
| `GET /api/moves/summary` | any | counts only |
| `GET /api/item/:id?step=5m` | any | premium adds 1h/5m data and timeseries |
| `GET /api/news` | any | posts with matched items and 1h change |
| `GET/POST/DELETE /api/alerts` | premium | |
| `GET /api/stream` | premium | SSE: `alert`, `tick` |
| `GET /api/shorts/pack?kind=flips|dumps|spikes&count=5&app=&cta=&ids=` | premium | |
| `POST /api/upgrade {key}` / `POST /api/logout` | any | |

## Layout

```
server/   Express app, wiki client, market poller, flips, dumps, news, alerts, shorts
public/   index.html, app.js (UI), shorts.js (canvas renderer + recorder), style.css
data/fixtures/  offline data (regenerate with npm run fixtures)
data/runtime/   alerts.json (gitignored)
test/     node:test unit and API tests
```

Data from the [OSRS Wiki real-time prices API](https://prices.runescape.wiki/). Be nice to it.
