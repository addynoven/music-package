# Changelog

All notable changes to `musicstream-sdk` are documented here.
Follows [Semantic Versioning](https://semver.org/).

---

## [4.2.1] — 2026-04-30

Metadata-only release. No code changes.

### Changed

- **Expanded npm keywords** — added `word-by-word-lyrics`, `word-level-lyrics`, `karaoke`, `ttml`, `lrclib`, `betterlyrics`, `kugou`, `simpmusic`, `lyrics-provider`, `lyrics-api`, `youtubei`, `potoken`, `multi-client`, `anti-ban`, `rate-limiter`, `proxy`, `chromaprint`, `songrec`, `node22`. Improves npm discoverability for the v4.2.0 feature surface.

---

## [4.2.0] — 2026-04-30

Closes the two remaining gaps Echo Music had on us. Stream resolution gets a proper multi-client InnerTube pool with PoToken plumbing. Lyrics grows from 4 to 7 providers with a user-configurable chain.

**No breaking API changes.** All additions are opt-in. Existing callers keep working without changes.

### Added — multi-client stream resolution

- **`InnertubePool`** (`src/stream/innertube-pool.ts`) — lazy pool of `Innertube` instances keyed by `StreamClient` (`'YTMUSIC' | 'ANDROID_VR' | 'TVHTML5' | 'WEB_REMIX'`). `pool.get(client)` creates the session on first use, caches the promise so concurrent gets share one create call. Replaces the single-Innertube approach in `StreamResolver`.
- **Multi-client fallback wired into `StreamResolver.resolve()`** — walks `STREAM_CLIENT_FALLBACK_ORDER = ['YTMUSIC', 'ANDROID_VR', 'TVHTML5']` via `tryClients()`. Each client is tried until one returns a valid `StreamingData`; the last error message is surfaced to `onFallback` when all clients fail. yt-dlp remains the universal final fallback.
- **`MusicKitConfig.poToken`** + **`MusicKitConfig.getPoToken`** — pluggable PoToken support. Static token via `poToken: string`, or async generator via `getPoToken: (videoId, client) => Promise<string | null>`. Most content streams without a PoToken via ANDROID_VR; web clients increasingly require one. The SDK doesn't ship a built-in generator (would require a Chromium dep) — bring your own (puppeteer-based microservice, manual copy-paste, etc.).
- **`src/stream/client-headers.ts`** — `headersForClient(clientId)`, `parseClientFromUrl(url)`, `headersForUrl(url)`. Per-client UA/Origin/Referer canonical headers extracted from Echo Music's `YouTubeClient.kt`. Useful when you need to fetch a stream URL through your own pipeline (CDN URLs include `c=<client>` and YouTube CDN expects matching headers — sending the wrong ones returns 403). Not yet wired into `StreamResolver` itself.

### Added — lyrics provider chain (7 providers)

- **SimpMusic** (`src/lyrics/simpmusic.ts`) — fan-hosted aggregator. Lookup by YouTube `videoId` makes it work when artist/title metadata is unreliable (mojibake, wrong-language metadata, etc.). Two-step flow: search by `title artist`, fall back to `videoId`-keyed lookup.
- **YouTube Music native lyrics** (`src/lyrics/youtube-native.ts`) — wraps `yt.music.getLyrics(videoId)`. Official, licensed major-label coverage. Plain text only (`synced: null`).
- **YouTube subtitles / transcripts** (`src/lyrics/youtube-subtitle.ts`) — wraps `info.getTranscript()`. Last-resort universal fallback for any video with auto-captions. Filters `[Music]`/`[Applause]`/`♪` non-lyric segments. Synced at line level, no per-word timing.

### Added — user-configurable provider chain

- **`MusicKitConfig.lyrics.providers`** — pass an ordered array of built-in name strings (`'better-lyrics'`, `'lrclib'`, etc.) and/or custom `LyricsProvider` instances. Omitted providers are disabled. Default chain when undefined: `['better-lyrics', 'lrclib', 'simpmusic', 'youtube-native', 'kugou', 'lyrics-ovh', 'youtube-subtitle']`.
- **`mk.registerLyricsProvider(provider, position?)`** — runtime registration with positional placement: `'first'`, `'last'`, `'before:<name>'`, `'after:<name>'`. Throws `ValidationError` on unknown reference names.
- **`mk.getLyrics(id, { providers })`** — per-call override accepting the same `LyricsProviderSpec[]` as the config option. Useful for "synced-only" calls (`{ providers: ['lrclib', 'kugou'] }`) without changing global config. Per-call overrides bypass the lyrics cache.
- **`Lyrics.source`** — new optional field reporting which provider produced the result (`'better-lyrics' | 'lrclib' | ...`). Lets consumers display attribution / debug coverage gaps.
- **`LyricsRegistry`** class + **`RegistryPosition`** type exported publicly for advanced users who want to manage their own chain instance.

### Internal

- `StreamResolver` constructor: `(cache, cookiesPath?, proxy?, yt?: Innertube?, onFallback?)` → `(cache, cookiesPath?, proxy?, pool?: InnertubePool?, onFallback?)`. Same arg position; type changed from a single Innertube to a pool.
- `MusicKit` constructor & `create()` now build an `InnertubePool` and seed `'YTMUSIC'` for the discovery layer. The legacy single-Innertube constructor branch (mostly used by tests) ignores the passed instance and creates a fresh pool — documented inline.
- 18 musickit unit-test files updated to add `ClientType` to their `youtubei.js` mock factory (required by `innertube-pool.ts`'s module-load-time client map).
- `LyricsProvider.fetch()` signature extended with optional `videoId?: string` 5th arg. Additive — existing implementations don't need updates.
- `LyricsProviderName` union extended with `'simpmusic'`, `'youtube-native'`, `'youtube-subtitle'`. Moved canonical home to `src/models/index.ts` (re-exported from `src/lyrics/provider.ts` for backward compat).
- 130+ new unit tests across `LyricsRegistry`, `InnertubePool`, `client-headers`, the 3 new lyrics providers, and the rewired `getLyrics` chain. Total: 774 unit tests passing.

### Migration

None required for typical usage. If you constructed a `StreamResolver` directly (rare — most consumers go through `MusicKit`), the 4th constructor arg is now `InnertubePool` instead of `Innertube`. Wrap your existing Innertube in a pool: `new StreamResolver(cache, cookiesPath, proxy, new InnertubePool({...}), onFallback)`.

If you imported `LyricsProviderName` from `'musicstream-sdk/lyrics/provider'`, that path still works — the type is now defined in `models` and re-exported.

---

## [4.1.0] — 2026-04-30

Stream resolution and lyrics get teeth. The "4-step waterfall" CLAUDE.md described in v4 was aspirational — the actual `StreamResolver` was a single yt-dlp shell-out. v4.1 implements the real chain. Lyrics gets a proper provider chain with genuine per-word timings.

**No breaking API changes.** Public types and method signatures unchanged. `LyricLine` gains an optional `words?: WordTime[]` field — additive only.

### Added — stream resolver actually has a fast path

- **InnerTube fast-path** (`src/stream/innertube-resolver.ts`) — `StreamResolver.resolve()` now tries `yt.music.getInfo` + `chooseFormat` + `decipher` *before* falling back to yt-dlp. Steady-state stream calls are ~1.5-2s instead of the previous ~2.4s yt-dlp shell-out. yt-dlp remains the final fallback for cipher failures, geo blocks, age gates, and any track InnerTube can't return.
- **`videoDetails.musicVideoType` exposure** — the field youtubei.js silently drops (only 17 fields parsed) is now read from the raw `info.page[0]` and surfaced as `videoType` and `isPrivateTrack` on `InnertubeResolveResult`. `MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK` is detected so future work can skip HEAD validation for user-uploaded library tracks.
- **`onFallback` event hook** — `StreamResolver` accepts an optional callback that fires when InnerTube fails and yt-dlp takes over. `MusicKit` wires it to emit a `'retry'` event with endpoint `'stream'` for observability.
- **`src/stream/multi-client.ts`** — `tryClients()` helper and `STREAM_CLIENT_FALLBACK_ORDER` constant. Not yet wired into the default resolver (youtubei.js binds a single client at session creation), but available for consumers and v4.2.0 work.

### Added — lyrics provider chain

- **BetterLyrics** (`src/lyrics/better-lyrics.ts`) — fetches Apple Music TTML from `lyrics-api.boidu.dev` and parses real per-word `<span begin end>` timestamps. Echo Music fetches this provider but discards the word data; we surface it.
- **KuGou** (`src/lyrics/kugou.ts`) — Chinese music coverage via `mobileservice.kugou.com` + `lyrics.kugou.com`. Three-step flow: song search → lyric candidate by hash → base64-encoded LRC. Handles multi-timestamp LRC lines (`[00:01.00][00:30.00]text`).
- **`LyricsProvider` interface** (`src/lyrics/provider.ts`) — uniform contract `{ name, fetch(artist, title, duration?, fetchFn?) }`. Existing providers expose `lrclibProvider` and `lyricsOvhProvider` conforming exports alongside their original function exports (no breaking change).
- **`WordTime` type** + optional `LyricLine.words` field — additive type extension, public via the SDK barrel. `LyricWord` is preserved as a `@deprecated` alias of `WordTime`, so existing imports keep working. `WordTime.duration` is optional — only providers with real per-word duration data (BetterLyrics) populate it.
- **Conforming `LyricsProvider` exports** — every built-in provider now exports a const conforming to the `LyricsProvider` interface: `betterLyricsProvider`, `lrclibProvider`, `lyricsOvhProvider`, `kugouProvider`. Useful for consumers who want to drive their own chain.
- `MusicKit.getLyrics()` chain: BetterLyrics → LRCLIB → lyrics.ovh → KuGou. First non-null wins. 10-year cache TTL unchanged.

### Fixed — documentation lie

- `CLAUDE.md` previously described a 4-step stream resolution chain (pre-signed → cached → decipher → yt-dlp) that did not exist in the code. The chain now exists and the doc reflects reality.

### Internal

- `src/musickit/index.ts` — three `new StreamResolver(...)` construction sites now pass the `Innertube` instance and an `onStreamFallback` callback bound on MusicKit.
- New playground assets and unit tests for the new modules — 64 new unit tests added (29 multi-client, 13 InnerTube resolver, 12 BetterLyrics, 10 KuGou).
- Live integration tests pass against real YouTube Music — `getStream` works through the InnerTube path with high+low quality, fallback paths preserved.

### Migration

None required. If you import `LyricLine` and exhaustively destructure its fields, the optional `words` will simply be `undefined` for providers that don't supply per-word timing — same behavior as before.

---

## [4.0.0] — 2026-04-30

Major hardening pass. Many config fields that were previously declared but not wired now actually take effect. Source routing, anti-ban headers, lyrics matching, and rate limiting all properly honor user configuration.

**No breaking API changes.** No-env behavior is preserved — the SDK still works without `youtubeApiKey`/`cookiesPath`/`proxy`.

### Fixed — config that didn't do anything now does

- **`cookiesPath`** is now also passed to InnerTube (`youtubei.js`), not just to yt-dlp. Search/getMetadata/getHome and every other browse operation now use the logged-in session, dramatically reducing rate-limit / IP-ban exposure.
- **`proxy`** is now wired through every outbound code path: InnerTube, LRCLIB, lyrics.ovh, AcoustID (via `undici.ProxyAgent`), and yt-dlp (via `--proxy`).
- **`userAgent`** and **`visitorId`** now actually flow into outbound external API calls via the previously-unused `SessionManager` (`X-Goog-Visitor-Id`, `User-Agent`).
- **`rateLimit.browse`**, **`rateLimit.stream`**, **`rateLimit.autocomplete`** now throttle their respective endpoints. Previously only `rateLimit.search` worked.

### Fixed — silent regressions when `youtubeApiKey` was set

- `mk.search(q, { filter: 'albums' | 'artists' | 'playlists' })` no longer returns `[]` when an API key is set. The SDK now co-registers both `YouTubeDataAPISource` and `YouTubeMusicSource`, with Data API handling `songs` and YouTube Music handling everything else.
- When the YouTube Data API quota is exhausted (HTTP 403/429), search now falls back automatically to YouTube Music. Previously the SDK would throw until the quota reset.
- `mk.getMetadata`, `getHome`, `getArtist`, `getAlbum`, `getPlaylist`, `getRadio`, `getRelated`, `getCharts`, `getMoodCategories`, `getMoodPlaylists`, `autocomplete` now all route through the configured source list (with quota fallback). Previously they always hit InnerTube directly, regardless of `youtubeApiKey`.
- `mk.search(q, { source: 'youtube' })` no longer throws `ValidationError` when the API key is set. The override now picks any registered source whose name starts with `youtube`.

### Fixed — search & lyrics quality

- `YouTubeDataAPISource.search()` now passes `videoCategoryId=10` so YouTube filters to its Music category before returning results. No more random teasers / vlogs / reactions in song search results.
- `YouTubeDataAPISource` now extracts a clean `artist` and `title` from results, recognizing YT Music's `"<Artist> - Topic"` channels and `"Artist - Title (Official Video)"` patterns.
- `fetchFromLrclib(artist, title, duration?, fetchFn?)` now passes `duration` to LRCLIB for ±2s server-side matching, and falls back to `/api/search` with closest-duration pick (±5s reject). No more confidently-wrong synced lyrics from a different recording.

### Removed — dead code

- `'visitorIdRefreshed'` event — was declared in the public types but never emitted. Removed.
- Unused optional methods (`getFeaturedPlaylists`, `getLyrics`) on the `AudioSource` interface — no source ever implemented them. Removed.

### Internal

- New `src/utils/cookies.ts` — Netscape `cookies.txt` → cookie header serializer.
- New `src/utils/fetch.ts` — `makeFetch({ proxy, session })` with `undici.ProxyAgent` proxy support and SessionManager header injection.
- New `tryEachSource()` and `pickSearchSource()` helpers in `MusicKit` — uniform multi-source routing with quota fallback.
- `searchCache` capped at 256 entries with insertion-order LRU. Previously unbounded — relevant for long-running consumers.
- New playgrounds: `verify-api-usage.ts` (header capture), `test-source-routing.ts` (T2/T3/T4 live checks), `test-throttle.ts` (T7 timing), `test-lyrics-sync.ts` (LRCLIB duration matching).
- `audit/AUDIT.md` and `audit/TODO.md` document the full audit and the staged fix plan.

### Migration

None required for typical usage. If you set `youtubeApiKey` previously and were silently getting empty results for albums/artists/playlists, those calls will now return real data — verify your downstream code handles non-empty responses for those filters.

---

## [1.0.0] — 2026-04-25

First stable release. API is considered stable — breaking changes will follow semver from here.

### Summary of what's in v1
- Unified search, stream, browse, lyrics, and download across **YouTube Music** and **JioSaavn**
- `MusicKit` class with `search`, `getStream`, `getTrack`, `getMetadata`, `getLyrics`,
  `getHome`, `getArtist`, `getAlbum`, `getPlaylist`, `getRadio`, `getRelated`,
  `getSuggestions`, `getFeaturedPlaylists`, `getCharts`, `autocomplete`, `download`
- Source routing: YouTube-first by default (`sourceOrder: 'best'`), opt-in JioSaavn-first
  with `sourceOrder: ['jiosaavn', 'youtube']`
- Per-call source override: `search(q, { source: 'jiosaavn' })`
- Synced lyrics via LRCLIB + lyrics.ovh fallback — returns `{ plain, synced }` JSON
- Built-in SQLite cache (`node:sqlite`), rate limiter, retry engine, session manager
- Optional `youtubeApiKey` for YouTube Data API v3 search backend
- Optional `cookiesPath` for elevated YouTube rate limits via yt-dlp
- Zero native addons — runs on any Node ≥ 22 without compilation

---

## [0.6.0] — 2026-04-25

### Breaking
- `getLyrics(id)` now returns `Lyrics | null` instead of `string | null`.
  `Lyrics = { plain: string, synced: LyricLine[] | null }` where
  `LyricLine = { time: number, text: string }` (time in seconds).

### Changed
- `getLyrics` completely rewritten. JioSaavn lyrics removed (poor coverage outside
  Indian music). Now uses **LRCLIB** as primary source (synced + plain lyrics, no auth,
  no rate limit) with **lyrics.ovh** as fallback (plain only, fans out to Genius,
  AZLyrics, and four others). Works for any song ID — YouTube or JioSaavn.
- YouTube artist/title sanitised before lookup: strips VEVO suffix, "(Official Video)",
  "(Explicit)", and similar noise so lyrics APIs can match cleanly.
- `getLyrics` results cached permanently (`TTL = 10 years`) — lyrics never change.
- `LyricLine` and `Lyrics` types exported from the public API.

---

## [0.5.2] — 2026-04-25

### Fixed
- **`node:sqlite` import preserved in dist** — esbuild was normalising `node:sqlite` to `sqlite`
  (a specifier that doesn't exist as a bare module). Added a `tsup.config.ts` with a post-build
  patch so both `dist/index.mjs` and `dist/index.js` correctly import from `"node:sqlite"`.
  Previously the package was broken on a clean `pnpm install` unless the dist was patched manually.

---

## [0.5.1] — 2026-04-24

### Fixed
- **Autocomplete** switched from InnerTube (`yt.music.getSearchSuggestions`) to the public
  `suggestqueries.google.com/complete/search?client=youtube&ds=yt` endpoint. No auth, no API
  key, no InnerTube session needed. Zero quota cost. JSONP response parsed with a regex extractor.
- **Caching gaps** — `getMetadata`, `getHome`, `getArtist`, `getAlbum`, `getPlaylist`,
  `getRadio`, `getRelated`, `getSuggestions`, and `autocomplete` were not persisting results
  despite TTL constants existing. All gaps fixed; browse calls now correctly hit SQLite cache.
- **`getSuggestions()` bypass** — was calling `this._discovery.getRelated()` and
  `this._discovery.search()` directly, skipping MusicKit's cache and rate-limiter layers.
  Now routes through `this.getMetadata()`, `this.search()`, and `this.getRelated()`.
- **`getRelated()` empty `videoId` entries** — missing `.filter()` before `.map(mapSongItem)`
  in `DiscoveryClient.getRelated()` caused songs with `videoId: ''` to appear in results.
  Filter now guards the map.
- **JioSaavn live tests failing when `YT_API_KEY` is set** — `live-jiosaavn.test.ts` now
  uses `sourceOrder: ['jiosaavn']` so `YouTubeDataAPISource` is never registered during the
  JioSaavn-specific test run.

---

## [0.5.0] — 2026-04-24

### Added
- `youtubeApiKey` config option — when set, registers `YouTubeDataAPISource` as the YouTube
  search backend. Uses YouTube Data API v3 (`search.list` + batch `videos.list`) instead of
  InnerTube. Official API with generous quotas — never rate-limited at normal bot usage.
  Falls back to `YouTubeMusicSource` (InnerTube) when no key is provided.
- `cookiesPath` config option — path to a Netscape `cookies.txt` file. Passed via
  `--cookies` to every yt-dlp invocation (stream resolution and download), giving the
  session significantly higher YouTube rate limits.
- Startup warning logged when neither `youtubeApiKey` nor `cookiesPath` is configured,
  recommending credentials for production use.
- `YouTubeDataAPISource` exported from `musicstream-sdk/sources` for custom pipelines.

### Changed
- SQLite cache now uses Node's built-in `node:sqlite` (`DatabaseSync`). Zero native
  compilation — works on any Node 22+ machine without rebuilding.
- Minimum Node version raised to **22** (`engines: { node: ">=22" }`).
- GitHub Actions CI updated to Node 22.

---

## [0.4.0]

### Added
- `getSuggestions(id)` — unified "up next" API. YouTube-first: looks up the YouTube
  equivalent of any song via metadata search, then uses YouTube's global recommendation
  engine. Falls back to source-native radio when YouTube lookup fails.

### Added
- `getSuggestions(id)` — unified "up next" API. YouTube-first: looks up the YouTube
  equivalent of any song via metadata search, then uses YouTube's global recommendation
  engine. Falls back to source-native radio when YouTube lookup fails. Replaces the old
  approach of routing `jio:` IDs straight to JioSaavn radio (which gave poor results for
  non-Indian/English songs).
- `getLyrics(id)` — fetch lyrics for any song ID. Routes to JioSaavn's `lyrics.getLyrics`
  endpoint. Returns `null` for YouTube IDs (no lyrics API on YouTube). Resolves platform
  URLs automatically.
- `getMetadata(id)` — fetch song metadata (title, artist, duration, thumbnails) without
  resolving a stream URL. Routes `jio:` IDs to JioSaavn, YouTube IDs to DiscoveryClient.
- `getBestThumbnail(thumbnails, targetSize)` — exported utility. Returns the thumbnail
  closest to the requested pixel size. Handles legacy `width: 0` thumbnails gracefully.
- `isStreamExpired(stream)` — exported utility. Returns `true` when a cached `StreamingData`
  URL is within 5 minutes of expiry.
- `search(query, { filter, limit })` — `limit` option added. Flows through to all sources.
  Cache key includes limit so different limits don't collide.
- `getHome({ language })` — `language` option added. Passed to JioSaavn's
  `getBrowseModules` for localised content (hindi, punjabi, english, etc.).
- YouTube playlist support in `getPlaylist()`. Previously threw for non-`jio:` IDs.
  Now routes to `DiscoveryClient.getPlaylist` for YouTube playlist IDs.
- JioSaavn stream caching with expiry check. Previously every `getStream` call for a
  `jio:` ID hit the API. Now cached for ~6h with automatic re-fetch when expired.

### Fixed
- `getTrack()` — was YouTube-only (crashed on `jio:` IDs). Now routes metadata fetch to
  JioSaavn source and combines with JioSaavn stream correctly.
- `autocomplete()` — now returns `[]` immediately for `jio:` prefixed input instead of
  sending a nonsensical query to YouTube. Platform URLs are resolved before lookup.
- JioSaavn thumbnail dimensions — all thumbnails were returning `width: 0, height: 0`.
  Now parsed from the URL pattern (e.g. `150x150.jpg` → `{ width: 150, height: 150 }`).
- Search cache key normalisation — `resolveInput` now applied before building the cache
  key so `music.youtube.com/search?q=queen` and `queen` share the same cache entry.
- `AudioSource.search` return type — was too narrow (`Promise<SearchResults | Song[]>`),
  widened to `Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]>`.

---

## [0.2.4] — JioSaavn Browse + URL Resolution

### Added
- JioSaavn browse endpoints: `getAlbum`, `getArtist`, `getPlaylist`, `getRadio`, `getHome`
  all implemented on `JioSaavnSource` and wired into the `MusicKit` routing layer.
- URL resolution layer (`src/utils/url-resolver.ts`):
  - JioSaavn URLs (`jiosaavn.com/song/...`, `/album/...`, `/artist/...`, `/featured/...`)
    resolved to `jio:ID` before routing.
  - YouTube URLs (`youtube.com/watch?v=`, `youtu.be/`) resolved to bare video ID.
  - YouTube Music URLs (`music.youtube.com/watch`, `/browse`, `/playlist`, `/search`)
    resolved appropriately — search URLs extract the decoded query text.
- All `MusicKit` public methods call `resolveInput()` at entry. Users can pass raw platform
  URLs anywhere they'd pass an ID.
- `Playlist` model extended with optional `songs?: Song[]`.
- `AudioSource` interface extended with optional browse methods:
  `getAlbum?`, `getArtist?`, `getPlaylist?`, `getRadio?`, `getHome?`, `getLyrics?`.

---

## [0.2.0] — Multi-Source Architecture + JioSaavn

### Breaking changes
- Package renamed from `musickit` to `musicstream-sdk`.

### Added
- `AudioSource` interface — pluggable source architecture. First `canHandle()` match wins.
  `registerSource(source)` for custom sources.
- `JioSaavnSource` — JioSaavn as primary stream source.
  - Direct `jiosaavn.com/api.php` calls via `DefaultJioSaavnClient`.
  - DES-ECB stream URL decryption (node-forge, key `38346591`).
  - All four search filter types (songs / albums / artists / playlists), each using its own
    JioSaavn endpoint.
  - No-filter search via `autocomplete.get` — all types in one response.
  - `jio:` prefix on all JioSaavn entity IDs to prevent routing ambiguity.
- `YouTubeMusicSource` — existing YouTube Music logic extracted into source plugin.
- Default pipeline (auto-registered in `ensureClients`):
  1. JioSaavn — handles plain text queries and `jio:` IDs
  2. YouTube Music — catch-all fallback, anti-ban layer activates here
- GitHub Actions workflow for automated npm publishing.

---

## [0.1.0] — Initial Release

### Added
- YouTube Music SDK wrapping YouTube's InnerTube API via `youtubei.js`.
- `search(query, { filter })` — songs, albums, artists, playlists, or all types.
- `autocomplete(query)` — search suggestions.
- `getStream(videoId, { quality })` — stream URL resolution with cipher decoding.
  Priority: pre-signed URL → cached deciphered URL (6h TTL) → fresh decipher → yt-dlp fallback.
- `getTrack(videoId)` — metadata + stream in one call.
- `getHome()` — curated home feed sections.
- `getArtist(channelId)` — artist page with top songs, albums, singles.
- `getAlbum(browseId)` — album with track list.
- `getRadio(videoId)` — auto-generated station from a seed song.
- `getRelated(videoId)` — sidebar-style related songs.
- `getCharts({ country? })` — regional or global charts.
- `download(videoId, options)` — audio download via yt-dlp.
- Anti-ban layer: `RateLimiter`, `RetryEngine` (exponential backoff), `SessionManager`
  (visitor ID rotation), `Cache` (SQLite).
- Event system: `beforeRequest`, `afterRequest`, `cacheHit`, `cacheMiss`, `rateLimited`,
  `retry`, `error`.
- `MusicKitConfig` — configurable rate limits, cache TTLs, log level, retry settings.
