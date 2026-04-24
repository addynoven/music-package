# Changelog

All notable changes to `musicstream-sdk` are documented here.
Follows [Semantic Versioning](https://semver.org/).

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
- SQLite backend replaced: `better-sqlite3` (native C++ addon, NODE_MODULE_VERSION issues)
  removed in favour of Node's built-in `node:sqlite` (`DatabaseSync`). Zero native
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
