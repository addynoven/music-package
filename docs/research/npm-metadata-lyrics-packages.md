# Music Metadata & Lyrics npm Packages

Research notes for reverse engineering and design inspiration. Focused on what's worth stealing, what's broken, and what gaps exist.

---

## [music-metadata](https://www.npmjs.com/package/music-metadata)

**Downloads:** ~2.5M/week  
**What it does:** Extracts metadata from audio/video files. Supports 25+ formats (MP3, FLAC, MP4, OGG, WAV, AIFF, APE, WMA, Opus, WebM, MKV, DSD, and more). Reads all major tagging standards: ID3v1/v2, APE, Vorbis, iTunes tags, ASF, RIFF INFO, and MusicBrainz/Picard tags.

**Interesting bits:**
- Four parsing entry points covering every use case: `parseFile()` (Node filesystem), `parseStream()` (Node readable), `parseBlob()` (browser File/Blob), `parseBuffer()` (Uint8Array), `parseWebStream()` (web ReadableStream), and `parseFromTokenizer()` for completely custom sources.
- The tokenizer pattern (`strtok3` abstraction underneath) is the standout design move — it decouples the parser from any specific I/O primitive, letting you plug in cloud storage (S3 examples in the docs), custom byte sources, etc.
- Observer pattern for real-time updates during streaming parse — fires callbacks as metadata chunks arrive before the file is fully read.
- Custom error types inheriting from a `ParseError` base — good pattern for typed error handling.
- ESM-only since Node 18, 99.6% TypeScript. Clean modern codebase.
- Cover art extraction utility functions built in.

**Gaps/weaknesses:**
- Pure metadata extraction — no lyrics, no enrichment from online databases, no fingerprinting. It reads what's embedded in the file, nothing more.
- ESM-only is a breaking constraint for projects still on CJS pipelines.
- No built-in caching or memoization for repeated file reads.

---

## [musicbrainz-api](https://www.npmjs.com/package/musicbrainz-api)

**Downloads:** ~250/week  
**What it does:** Full JavaScript/TypeScript client for the MusicBrainz Web Service v2. Supports lookups by MBID, browse queries, and Lucene-syntax search across 11+ entity types (recording, release, release-group, artist, label, work, etc.). Also wraps the Cover Art Archive API and supports metadata *submission* for bot accounts.

**Interesting bits:**
- Built-in throttling with burst tolerance: defaults to 15 requests per 18 seconds, respects MusicBrainz's official rate limit, and automatically retries when the rate limiter fires. This is the right way to handle API rate limits — not naive fixed delays.
- The `include` arguments system is well thought out: you opt-in to extra data depth per request rather than always fetching everything. Keeps payloads lean.
- Lucene query syntax pass-through for search gives power users full control without the library needing to model every possible filter.
- Submission support via authenticated XML POST — most clients skip this entirely.
- Configurable proxy support and custom API base URL — useful for self-hosted MusicBrainz mirrors.
- Same author (Borewit) as `music-metadata`, so the two integrate naturally.
- 99.7% TypeScript, ESM with CJS compat shim, ES2020 target.

**Gaps/weaknesses:**
- ~250 downloads/week signals niche adoption — community is small, so issue turnaround is slow.
- No built-in response caching (every call hits the network).
- Submission API requires a MusicBrainz bot account, which has friction for casual contributors.
- The Lucene search syntax is powerful but underdocumented in the library itself — you're expected to know MusicBrainz's search fields.

---

## [genius-lyrics](https://www.npmjs.com/package/genius-lyrics)

**Downloads:** ~8,600/week  
**What it does:** Fetches song lyrics via Genius. Supports both the official Genius API (when you have an API key) and falls back to scraping genius.com without one. Returns full lyric text plus song/artist metadata.

**Interesting bits:**
- Hybrid API key / scrape strategy is clever for DX: `new Genius.Client()` works out of the box for prototyping, `new Genius.Client("api-key")` for production. The library handles the routing internally.
- OO model wrapping raw search results into Song and Artist objects — `song.lyrics()` reads more naturally than `getLyricsForSongId(id)`.
- Fluent interface: `client.songs.search("query")` → `song.lyrics()` chains cleanly.
- Full TypeScript types + both CJS and ESM exports.
- Works in environments where you can't get a Genius API key approved immediately — good for rapid prototyping.

**Gaps/weaknesses:**
- Scraping fallback is a maintenance liability — Genius can (and does) change their DOM, breaking the scraper silently.
- No rate limiting built in — hammer the API and you'll get blocked.
- No caching — every call fetches fresh. In a streaming SDK context you'd want to cache lyrics aggressively.
- Last published 2 years ago (v4.4.7), suggesting low maintenance activity.
- Genius officially provides no lyrics endpoint via their API — the "official API" integration only gives metadata (title, URL, album art). Actual lyrics always require scraping.
- No LRC/timestamped lyrics — returns plain text only.

---

## [lrc-kit](https://www.npmjs.com/package/lrc-kit)

**Downloads:** low (niche library, estimated <500/week based on ecosystem size)  
**What it does:** Parses, creates, and "runs" LRC lyric files in JavaScript/TypeScript. Handles standard `[MM:SS.MS]` timestamps plus enhanced formats (per-word timing, foobar2000/A2 extended format). Includes a `Runner` class for playback synchronization.

**Interesting bits:**
- The `Runner` class is the standout feature: it takes parsed lyrics and tracks the current line during playback by time position. You hand it a timestamp (from your audio player's `currentTime`) and it tells you which lyric line is active — down to word-level index with character position ranges.
- Enhanced format support: per-word timestamps embedded inline let you build karaoke-style highlighting where individual words light up.
- `Lrc` class has a clean static `Lrc.parse(str)` → `lrc.toString()` round-trip. Serialization auto-combines duplicate lines by content.
- Offset adjustment via `lrc.offset(ms)` — useful when lyrics are slightly out of sync.
- Multiple timestamps per lyric line supported (chorus repetitions).
- Both CJS and ESM distributions.

**Gaps/weaknesses:**
- Limited error handling for malformed input — bad LRC files can cause silent failures.
- No validation of metadata field values (e.g., bogus `[length:]` values).
- Enhanced format parsing is underdocumented relative to its complexity.
- No built-in network fetching — you supply the LRC string yourself. Purely a parse/serialize/run library.
- Minimal handling of edge cases: negative offsets, sub-millisecond timestamps, extremely long files.

---

## [@spotify/web-api-ts-sdk](https://www.npmjs.com/package/@spotify/web-api-ts-sdk)

**Downloads:** ~tens of thousands/week (official Spotify SDK, last published v1.2.0)  
**What it does:** Official Spotify TypeScript SDK for the Spotify Web API. Full access to tracks, albums, artists, playlists, audio features, audio analysis, recommendations, playback control, and user data. Embedded TypeScript types for all response shapes.

**Interesting bits:**
- Factory method initialization pattern is clean: `SpotifyApi.withUserAuthorization()`, `SpotifyApi.withClientCredentials()`, `SpotifyApi.withAccessToken()` — auth strategy selection at construction time rather than scattered config flags.
- Pluggable strategy pattern for almost every concern: you can override `fetch`, serialization, validation, error handling, redirection, and caching. Each is an injectable interface.
- `beforeRequest` and `afterRequest` hooks for instrumentation without monkey-patching.
- Pluggable caching: `LocalStorage` cache for browsers, in-memory for Node — same interface, different implementation.
- Automatic token refresh when expired tokens have a refresh credential available.
- Fluent grouped namespaces: `sdk.search()`, `sdk.tracks.get()`, `sdk.albums.get()` — logical resource grouping.
- Audio features endpoint is genuinely useful: returns danceability, energy, key, loudness, mode, speechiness, acousticness, instrumentalness, liveness, valence, tempo, time_signature per track.

**Gaps/weaknesses:**
- Last published 2 years ago (v1.2.0) — Spotify hasn't updated it to match API changes.
- 44 open issues suggests the official SDK isn't getting much love internally.
- No lyrics endpoint — Spotify's lyrics feature exists in the app but is not exposed via the public Web API.
- Requires Spotify Developer app credentials and OAuth for most calls — heavier setup than a simple API key.
- Audio analysis endpoint (detailed waveform/beat/segment data) is expensive to call and returns massive payloads with no streaming option.

---

## [disconnect](https://www.npmjs.com/package/disconnect) / [@lionralfs/discogs-client](https://www.npmjs.com/package/@lionralfs/discogs-client)

**Downloads:** `disconnect` ~200–2,000/week; `@lionralfs/discogs-client` lower but more modern  
**What it does:** Node.js clients for the Discogs.com API v2.0. Covers the full Discogs surface: database (artists, releases, masters, labels, search), marketplace (listings, orders, inventory), and user collections/wantlists. OAuth 1.0a authentication included.

**Interesting bits:**
- `@lionralfs/discogs-client` is the more interesting one — a rewrite of `disconnect` with a cleaner API. It drops callbacks entirely in favor of Promises, adds TypeScript types via JSDoc, and supports separate entry points for Node ESM, CJS, and browsers.
- Exponential backoff implementation for rate limit handling is configurable: `exponentialBackoffIntervalMs`, `exponentialBackoffMaxRetries`, `exponentialBackoffRate`. Smart default (retries off) keeps it from surprising you in scripts.
- Per-request rate limit header capture: limit, used, remaining are available after each call — lets you build adaptive throttling at the application layer.
- Namespace-grouped API: `db.getArtist()`, `marketplace.getListing()`, `user.getProfile()` — similar to what Spotify does, good model for SDK ergonomics.
- Discogs is the best open database for physical release data, label info, tracklist variants, and pressing info — data that MusicBrainz doesn't always have.

**Gaps/weaknesses:**
- `disconnect` (original) is abandoned — last release 5 years ago, no TypeScript.
- `@lionralfs/discogs-client` is actively maintained but has low adoption (39 stars, niche user base).
- OAuth 1.0a is annoying to implement on the client side — no PKCE flow, older auth standard.
- No bulk lookup support — the Discogs API itself doesn't offer it, but the client doesn't paper over this with batching either.
- Rate limits on Discogs are aggressive (60 requests/minute authenticated, 25 unauthenticated) and the default backoff config is off — you need to enable it manually.

---

## [last-fm](https://www.npmjs.com/package/last-fm)

**Downloads:** ~low hundreds/week (scoped GET-only library by feross)  
**What it does:** Lightweight read-only Last.fm API client. Covers Album, Artist, Track, Tag, Chart, and Geo endpoints via GET requests only. No authentication, no write operations — strictly public data. By Feross Aboukhadijeh (the `standard` / `webtorrent` author).

**Interesting bits:**
- Intentional scope constraint is worth studying: the library explicitly refuses to implement write endpoints or authenticated calls. This is a deliberate design decision that keeps the library tiny and predictable. Most SDK authors try to cover everything; this one draws a hard line.
- Filtering helpers: `artistInfo()` and `trackSearch()` support minimum listener count filtering — useful for filtering out obscure/noise results. Not something you'd think to add until you've built search features.
- Consistent resource-based method naming: `lastfm.artistInfo()`, `lastfm.trackSearch()`, `lastfm.chartTopTracks()` — mirrors the Last.fm API structure directly, which makes the official docs useful as supplementary documentation.
- Still callback-based (error-first pattern) — dated but at least consistent.

**Gaps/weaknesses:**
- Callback-based API is not Promise/async-await — feels anachronistic in 2025.
- No TypeScript types.
- No response caching.
- Last.fm's similar-artists and tag-based recommendations data is genuinely valuable for music discovery; this library exposes it but doesn't do anything smart with it.
- Limited to GET methods — can't scrobble or submit "now playing" status.

---

## Summary: Patterns Worth Borrowing

| Pattern | Source |
|---|---|
| Tokenizer abstraction for pluggable I/O | `music-metadata` |
| Factory method auth strategy selection | `@spotify/web-api-ts-sdk` |
| Pluggable strategy interfaces (fetch, cache, error handler) | `@spotify/web-api-ts-sdk` |
| beforeRequest/afterRequest hooks | `@spotify/web-api-ts-sdk` |
| Burst-aware rate limiting with automatic retry | `musicbrainz-api` |
| Include/depth opt-in per request | `musicbrainz-api` |
| Hybrid key/scrape fallback | `genius-lyrics` |
| Runner class for playback sync | `lrc-kit` |
| Word-level timestamp tracking | `lrc-kit` |
| Per-request rate-limit header capture | `@lionralfs/discogs-client` |
| Configurable exponential backoff | `@lionralfs/discogs-client` |
| Intentional scope constraint | `last-fm` |

## Common Gaps Across All of Them

- **No unified enrichment pipeline.** Every library is a point solution. Nothing combines fingerprint → MBID lookup → lyrics fetch → LRC sync into a single coherent flow.
- **No caching layer.** Every library hits the network every time. A streaming SDK should cache track metadata, lyrics, and cover art aggressively.
- **LRC and timed lyrics are underserved.** The LRC parsing libraries exist but are not connected to any metadata or lyrics source.
- **Audio fingerprinting is fragmented.** `acoustid` wraps a CLI binary (`fpcalc`), `chromaprint-fixed` is a WASM port — nothing is a clean pure-JS solution that runs server and browser.
- **Most Last.fm / MusicBrainz clients are unmaintained.** The ecosystem is thin and aging.
