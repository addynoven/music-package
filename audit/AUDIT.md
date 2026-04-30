# SDK Audit — Dead Code, Half-Wired Config, Source-Routing Gaps

**Date:** 2026-04-30
**Scope:** `musicstream-sdk` v3.0.0 — full read of `src/`, cross-referenced with `models/index.ts` (`MusicKitConfig`).
**Constraint observed throughout:** the SDK must continue to work with **no env / no API key** (degraded but functional). No fix in this audit makes env required, and every fix ensures env actually takes effect when supplied.

---

## TL;DR

The SDK accepts ~17 config fields and exposes ~20 public methods. Today:

- **`youtubeApiKey`** affects only **`search`** (1 of 14 user-facing methods). The other 13 silently bypass the configured source and call InnerTube directly — so the API key has no effect on metadata, browse, charts, radio, autocomplete, etc.
- **`cookiesPath`** reaches **yt-dlp** (stream/download) but is **never** passed to InnerTube — which is the path most heavily used and most prone to rate limits / IP bans. This is the literal cause of the rate-limit pain.
- Setting `youtubeApiKey` **silently breaks** album/artist/playlist search (Data API only handles songs; the YouTube Music source isn't co-registered).
- An entire `SessionManager` (visitor IDs + UA headers) is constructed and stored but never read — its outputs never reach any HTTP request.
- 6 config fields (`proxy`, `userAgent`, `visitorId`, `rateLimit.browse`, `rateLimit.stream`, `rateLimit.autocomplete`) are accepted but never consumed.

---

## Methodology

1. Listed every field declared in `MusicKitConfig` (`src/models/index.ts:155-176`).
2. For each field, `grep` for read sites in `src/` excluding tests.
3. For each public method on `MusicKit`, traced what backend (sources vs `_discovery`) actually serves the call.
4. Verified `youtubei.js` (InnerTube) capability surface (`node_modules/youtubei.js/.../core/Session.d.ts`) — confirmed it accepts `cookie` and a custom `fetch` we are not using.
5. Live-tested via `playground/verify-api-usage.ts` to confirm which backend was hit for each operation (intercepted global `fetch` and counted by host).

---

## Findings

### 🔴 SEV-1: Causes the IP-ban / rate-limit pain

#### S1-A — `cookiesPath` half-wired (yt-dlp only; InnerTube anonymous)

**Where:** `src/musickit/index.ts:96-97, 110-114, 137-141`

`cookiesPath` flows into `StreamResolver` and `Downloader`, both of which forward it to yt-dlp via `--cookies <path>`.

But `Innertube.create(...)` is invoked with only `generate_session_locally`, `lang`, `location`. No `cookie`. No custom `fetch`.

**Implication:** every search, getMetadata, getHome, getArtist, etc. hits InnerTube as an anonymous visitor — no logged-in session — so the cookies you exported only protect stream resolution and downloads. This is the most-called surface and the unauthenticated one.

**`youtubei.js` actually supports it:** `core/Session.d.ts` declares `cookie?: string` (a cookie header string, not a path) on `SessionOptions`, plus a `fetch?: FetchFunction` for proxy/UA injection.

#### S1-B — `youtubeApiKey` silently breaks album/artist/playlist search

**Where:** `src/musickit/index.ts:148-158` (source registration is XOR), `src/sources/youtube-data-api.ts:86` (filter≠'songs' → `return []`).

When `youtubeApiKey` is set, only `YouTubeDataAPISource` is registered. `YouTubeMusicSource` is not. The Data API source returns empty arrays for any non-'songs' filter.

So `mk.search(q, { filter: 'albums' })` returns `[]` when the key is set, and works correctly when it isn't — a regression from setting the key.

#### S1-C — No fallback when Data API quota / 403 hits

**Where:** Same code as S1-B (single-source registration).

YouTube Data API default quota is 10,000 units/day; each search costs ~100 units → ~100 searches/day before exhaustion. Once exhausted, `YouTubeDataAPISource.search()` throws `NetworkError 403` and there is no `YouTubeMusicSource` to fall back to.

---

### 🟠 SEV-2: `youtubeApiKey` has no effect on most public methods

#### S2-A — 12 of 14 methods bypass `sourceFor()`

**Where:** `src/musickit/index.ts:196, 247, 260, 273, 285, 297, 309, 321, 345, 375, 380, 385`

| Method | Routing | Source-aware? |
|---|---|---|
| `search` | `sourceFor()` | ✅ |
| `getStream` | `sourceFor()` (delegates to shared resolver) | ✅ partially |
| `getTrack` | `sourceFor()` for stream + `_discovery.getInfo` for metadata | ⚠️ mixed |
| `getMetadata` | `_discovery.getInfo` | ❌ |
| `getHome` | `_discovery.getHome` | ❌ |
| `getArtist` | `_discovery.getArtist` | ❌ |
| `getAlbum` | `_discovery.getAlbum` | ❌ |
| `getPlaylist` | `_discovery.getPlaylist` | ❌ |
| `getRadio` | `_discovery.getRadio` | ❌ |
| `getRelated` | `_discovery.getRelated` | ❌ |
| `getSuggestions` | calls `getRelated` | ❌ |
| `autocomplete` | `_discovery.autocomplete` | ❌ |
| `getCharts` | `_discovery.getCharts` | ❌ |
| `getMoodCategories` | `_discovery.getMoodCategories` | ❌ |
| `getMoodPlaylists` | `_discovery.getMoodPlaylists` | ❌ |

`_discovery` is always the InnerTube `DiscoveryClient`, regardless of `youtubeApiKey`.

#### S2-B — `sourceFor()` override hardcodes `'youtube-music'`

**Where:** `src/musickit/index.ts:122-128`

```ts
private sourceFor(query: string, override?: SourceName): AudioSource {
  if (override) {
    const targetName = 'youtube-music'   // ← ignores override value
    const found = this.sources.find(s => s.name === targetName)
    if (!found) throw new ValidationError(`Source '${override}' is not registered…`)
    return found
  }
  ...
}
```

When `youtubeApiKey` is set, the registered source's name is `'youtube-data-api'`, so any caller passing `{ source: 'youtube' }` triggers `ValidationError`. The override path only "works" by coincidence in the no-key case.

---

### 🟡 SEV-3: Dead infrastructure (instantiated, never used)

#### S3-A — `SessionManager` is dead weight

**Where:** `src/musickit/index.ts:89` (constructed) — and that's the only mention. No reads.

`SessionManager` produces `getHeaders()` (visitor ID + UA + accept-language), but nothing in the SDK calls it. This is why `config.userAgent` and `config.visitorId` are effectively dead.

The class is exported from `src/index.ts:13`, so external users could call it directly, but internally it does nothing.

#### S3-B — `YouTubeDataAPISource.getMetadata` unreachable from `MusicKit`

**Where:** `src/sources/youtube-data-api.ts:138-157` (definition); `src/musickit/index.ts:345` (uses `_discovery.getInfo` instead of `sourceFor(id).getMetadata(id)`).

The recently-added `extractArtistTitle` cleanup in this method does nothing in practice.

#### S3-C — `AudioSource` interface is interface theatre

**Where:** `src/sources/audio-source.ts:9-15`

`getAlbum`, `getArtist`, `getPlaylist`, `getRadio`, `getHome`, `getFeaturedPlaylists`, `getLyrics` are declared as optional methods on the interface. **No source class implements any of them**, and `MusicKit` does not try to call them on sources. Pure noise.

---

### 🟡 SEV-3: Config fields with zero effect

| Field | Status | Detail |
|---|---|---|
| `proxy` | **Dead** | Zero usages in `src/`. Declared in `MusicKitConfig:165` only. |
| `userAgent` | **Dead** | Only flows to unused `SessionManager`. |
| `visitorId` | **Dead** | Only flows to unused `SessionManager`. |
| `rateLimit.browse` | **Dead** | `limiter.throttle()` only called with `'search'` (musickit:224). |
| `rateLimit.stream` | **Dead** | Same. |
| `rateLimit.autocomplete` | **Dead** | Same. |

---

### 🟢 SEV-4: Smaller dead bits

- **`MusicKitEvent: 'visitorIdRefreshed'`** declared (`models:212`, `events/index.ts:7`) — never emitted anywhere.
- **Cache events asymmetric**: `cacheHit`/`cacheMiss` only emitted from `search()`. The other 13 cache reads are silent — observers can't reason about cache behavior for browse/metadata.
- **`searchCache` Map has no eviction** (musickit:61). Grows unbounded over the lifetime of a `MusicKit` instance — relevant for long-running processes (e.g. the Discord bot).

---

## What does work as advertised

`youtubeApiKey` (search only — see S2-A), `cookiesPath` (yt-dlp only — see S1-A), `language`, `location`, `identify.acoustidApiKey`, `identify.songrecBin`, `cache.*`, `maxRetries`, `backoffBase`, `backoffMax`, `logLevel`, `logHandler`, `minRequestGap`, `rateLimit.search`.

---

## Live-test evidence (2026-04-30)

`playground/verify-api-usage.ts` with `YT_API_KEY` set ran:
- `mk.search('Adele Hello')` → 2 calls to `googleapis.com/youtube/v3/{search,videos}` ✅ Data API used.
- `mk.getMetadata(...)` → 0 calls to googleapis (output title `"Hello (Official Music Video)"` is the InnerTube response, not the Data API one). ❌ Confirms `getMetadata` ignores the configured source.

Lyrics-sync test (12 tracks, brand-new queries) hit **12/12 correct synced lyrics** after `videoCategoryId=10` + LRCLIB `duration` param fixes — corroborates that `search` goes through the Data API source and the Data API filtering is now effective.

---

## Constraints for any fix

1. **No env still works** — every change is conditional on env presence. Falling back is fine; failing without env is not.
2. **Env actually takes effect when set** — no field stays declared-but-unused.
3. **No silent regression** — fixes must not flip a working filter (e.g. album search) into broken just because the user set a key.

---

See `TODO.md` for the staged fix plan.
