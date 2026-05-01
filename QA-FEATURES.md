# musicstream-sdk v4.2.1 — QA Feature List

> **Pre-reqs to install on the test machine:** Node ≥ 22, `yt-dlp` on PATH (required for stream/download fallback). Optional: `songrec` binary (Shazam identification), AcoustID API key.

---

## 1. Search & Discovery

| Feature | API | Notes for QA |
|---|---|---|
| Free-text search | `mk.search(query)` | Returns mixed `SearchResults` (songs/albums/artists/playlists) |
| Filtered search — songs | `mk.search(q, { filter: 'songs', limit })` | `Song[]` |
| Filtered search — albums | `mk.search(q, { filter: 'albums' })` | `Album[]` |
| Filtered search — artists | `mk.search(q, { filter: 'artists' })` | `Artist[]` |
| Filtered search — playlists | `mk.search(q, { filter: 'playlists' })` | `Playlist[]` |
| Autocomplete suggestions | `mk.autocomplete(q)` | `string[]` |
| URL → ID resolver | `resolveInput(url)` / `resolveSpotifyUrl(url)` | YouTube + Spotify URLs accepted by every method |
| In-memory search cache | (internal) | LRU, 256 entries, 5-min TTL — verify second identical call is instant |

## 2. Streaming

| Feature | API | Notes for QA |
|---|---|---|
| Resolve stream URL (high) | `mk.getStream(id, { quality: 'high' })` | Returns `{ url, format, bitrate, expiresAt, isPrivateTrack, ... }` |
| Resolve stream URL (low) | `mk.getStream(id, { quality: 'low' })` | |
| Stream audio (Node Readable) | `mk.streamAudio(id)` | yt-dlp pipe |
| Stream PCM (Node Readable) | `mk.streamPCM(id)` | ffmpeg-decoded PCM, fast path uses cached URL |
| Multi-client InnerTube fallback | (internal, transparent) | Order: `ANDROID_VR → TVHTML5 → YTMUSIC`. Test: kill network mid-call, verify `'retry'` event fires. |
| yt-dlp last-resort fallback | (internal) | Triggered when all InnerTube clients fail; emits `'retry'` event with endpoint `'stream'` |
| PoToken — static | `config.poToken` | |
| PoToken — async callback | `config.getPoToken(videoId, client)` | Per-call generation; return `null` to skip |
| Stream URL caching | SQLite, ~6h TTL | Verify second call returns instantly + `cacheHit` event |
| Stream URL expiry detection | `isStreamExpired(streamData)` | |
| Cookie-authed streams | `config.cookiesPath` | Netscape cookie file; required for age-gated/private |
| Track type detection | `streamData.isPrivateTrack` | YT Music personal uploads |

## 3. Track Metadata

| API | Returns |
|---|---|
| `mk.getTrack(id)` | `AudioTrack` (with `streamingData`) |
| `mk.getMetadata(id)` | `Song` only |

## 4. Browse / Discover

| API | Notes |
|---|---|
| `mk.getHome({ language?, source? })` | Home feed sections |
| `mk.getArtist(channelId)` | Full artist page |
| `mk.getAlbum(browseId)` | Album with tracks |
| `mk.getPlaylist(playlistId)` | Playlist with tracks |
| `mk.getRadio(videoId)` | Auto-generated radio |
| `mk.getRelated(videoId)` | Related songs |
| `mk.getSuggestions(id)` | Up Next queue |
| `mk.getCharts({ country? })` | Country-specific charts |
| `mk.getMoodCategories()` | List of mood/genre params |
| `mk.getMoodPlaylists(params)` | Playlists for a mood param |

## 5. Lyrics (7-Provider Chain)

| Feature | API | Notes for QA |
|---|---|---|
| Get lyrics (default chain) | `mk.getLyrics(id)` | Returns `{ plain, synced, source }` or `null`. Caches 10 years. |
| Per-call provider override | `mk.getLyrics(id, { providers: [...] })` | Bypasses cache |
| Custom chain in config | `config.lyrics.providers` | Built-in names or custom `LyricsProvider` |
| Runtime provider registration | `mk.registerLyricsProvider(p, 'first' \| 'last')` | |
| **Provider 1: BetterLyrics** | (auto) | TTML + word-level timings (only one with words) |
| **Provider 2: LRCLIB** | (auto) | Best line-level coverage, global |
| **Provider 3: SimpMusic** | (auto) | Fan aggregator, falls back to videoId |
| **Provider 4: YouTube native** | (auto) | Plain text, official tab |
| **Provider 5: KuGou** | (auto) | Chinese music |
| **Provider 6: lyrics.ovh** | (auto) | Plain-text catch-all |
| **Provider 7: YouTube subtitles** | (auto) | Auto-captions, filters non-lyric tags |
| LRC parse helpers | `parseLrc`, `getActiveLine`, `getActiveLineIndex`, `formatTimestamp`, `offsetLrc`, `serializeLrc` | |
| Title/artist sanitization | (internal) | Strips "Official Video", VEVO, "(Explicit)" before lookup |

## 6. Download

| Feature | API | Notes for QA |
|---|---|---|
| Download (opus, default) | `mk.download(id, { path, format: 'opus' })` | |
| Download (m4a) | `mk.download(id, { format: 'm4a' })` | |
| Progress callback | `{ onProgress: ({ percent, bytesDownloaded, totalBytes, filename }) => ... }` | |

## 7. Audio Identification

| Feature | API | Notes for QA |
|---|---|---|
| Identify local file | `mk.identify(filePath)` | Requires `config.identify.acoustidApiKey` |
| SongRec (Shazam) fallback | `config.identify.songrecBin` | Optional; tried first if configured |
| Chromaprint + AcoustID | (auto) | Fallback when SongRec misses |

## 8. Podcast / RSS

| Feature | API | Notes for QA |
|---|---|---|
| Fetch podcast feed | `mk.getPodcast(feedUrl)` | Returns `Podcast` + `episodes[]` |
| iTunes namespace support | (auto) | Test on iTunes-tagged feed |
| Standalone client | `new PodcastClient().getFeed(url)` | Works without MusicKit |

## 9. Playback Queue

| Feature | API | Notes for QA |
|---|---|---|
| Add to queue | `q.add(track)` | |
| Play next (jump) | `q.playNext(track)` | Inserts at head |
| Next / previous | `q.next()` / `q.previous()` | History tracked |
| Remove by index | `q.remove(i)` | |
| Move (reorder) | `q.move(from, to)` | |
| Skip to index | `q.skipTo(i)` | |
| Shuffle upcoming | `q.shuffle()` | Fisher-Yates |
| Clear upcoming | `q.clear()` | |
| Repeat: off / one / all | `q.repeat = 'off' \| 'one' \| 'all'` | Verify `'all'` re-cycles history |
| Inspect | `q.current`, `q.upcoming`, `q.history`, `q.size`, `q.isEmpty` | |

## 10. Anti-Ban Infrastructure

| Feature | Notes for QA |
|---|---|
| Per-endpoint rate limiting | `config.rateLimit.{search, browse, stream, autocomplete}` (req/min) |
| Min request gap | `config.minRequestGap` (ms) |
| Retry with backoff | `config.maxRetries`, `backoffBase`, `backoffMax` |
| Visitor ID rotation | 30-day TTL in SQLite cache; `config.visitorId` to pin |
| Custom User-Agent | `config.userAgent` |
| Proxy support | `config.proxy` (HTTP/HTTPS/SOCKS) |
| Language / location | `config.language`, `config.location` |
| Cookie injection | `config.cookiesPath` |

## 11. Caching (SQLite, `node:sqlite`)

| Cache type | TTL | Override |
|---|---|---|
| Stream URLs | ~6h | `config.cache.ttl.stream` |
| Search results | 5 min | `config.cache.ttl.search` |
| Home feed | 8h | `config.cache.ttl.home` |
| Artist pages | 1h | `config.cache.ttl.artist` |
| Lyrics | 10 years | (fixed) |
| Visitor ID | 30 days | (fixed) |
| Custom cache dir | `config.cache.dir` | |
| Disable cache | `config.cache.enabled = false` | |

## 12. Events (typed emitter)

Test that handlers fire for each:

- `beforeRequest(req)` / `afterRequest(req, durationMs, status)`
- `cacheHit(key, ttlRemaining)` / `cacheMiss(key)`
- `rateLimited(endpoint, waitMs)`
- `retry(endpoint, attempt, reason)` — verify fires on stream fallback to yt-dlp
- `error(error)`

API: `mk.on(event, h)`, `mk.off(event, h)`, `mk.once(event, h)`

## 13. Source Routing

| Feature | API |
|---|---|
| Default order | `config.sourceOrder = 'best'` (= `['youtube']`) |
| Custom order | `config.sourceOrder = ['youtube', ...]` |
| Per-call override | `mk.search(q, { source: 'youtube' })`, `mk.getHome({ source })` |
| Register custom source | `mk.registerSource(audioSource)` (must implement `AudioSource`) |
| YouTube Data API v3 fallback | `config.youtubeApiKey` |

## 14. Error Handling

Verify the SDK throws these typed errors (exported from root):

- `NotFoundError` (track/album/artist not found)
- `RateLimitError` (429 / quota)
- `NetworkError` (with `.status`)
- `ValidationError` (bad config / args)
- `StreamError` (cipher/playback)
- `MusicKitBaseError` (parent class)

Plus error codes via `MusicKitErrorCode`: `RATE_LIMITED`, `FORBIDDEN`, `VIDEO_UNAVAILABLE`, `VIDEO_UNPLAYABLE`, `CIPHER_FAILURE`, `NETWORK_ERROR`, `PARSE_ERROR`, `DOWNLOAD_ERROR`, `UNKNOWN`.

## 15. Logging

- `config.logLevel`: `'silent' | 'error' | 'warn' | 'info' | 'debug'`
- `config.logHandler(level, message, meta)` — custom log sink

## 16. Schema Validation (Zod, exported)

Verify safe parsers don't throw on bad data:

- `safeParseSong`, `safeParseAlbum`, `safeParseArtist`, `safeParsePlaylist`
- Raw schemas: `SongSchema`, `AlbumSchema`, `ArtistSchema`, `PlaylistSchema`, `ThumbnailSchema`

## 17. Utilities

- `getBestThumbnail(thumbnails, minWidth?)` — pick highest-res thumbnail
- `isStreamExpired(streamData)` — bool check on `expiresAt`
- `version` — exported package version string

---

## Suggested Test Matrix

| Scenario | Why test |
|---|---|
| Cold cache → warm cache, same call | Validates SQLite cache hit |
| Search by YouTube URL, Spotify URL, raw videoId | URL resolver |
| Stream a normal track, age-gated, private upload, geo-blocked | Multi-client + yt-dlp fallback |
| Get lyrics for: English (BetterLyrics hit), Hindi (LRCLIB), Mandarin (KuGou), obscure indie (lyrics.ovh / subtitles) | Provider chain coverage |
| Trigger 429: send 100 search requests | Rate limiter + `rateLimited` event |
| Pull plug mid-stream | Retry + error events |
| Download large track + watch progress | Progress callback granularity |
| Identify a local mp3 (with and without SongRec) | Fingerprint flow |
| Long-running app: leave running 30 min | Check no FD/memory leaks, cache size growth |
| Run with `RUN_INTEGRATION=1 pnpm test:integration` | Full live-API regression |
