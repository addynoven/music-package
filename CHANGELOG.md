# Changelog

All notable changes to `musicstream-sdk` are documented here.
Follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — 0.3.0

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
