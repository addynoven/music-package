# YouTube / InnerTube npm Packages

Research compiled April 2026. Focus: packages worth reverse-engineering or borrowing ideas from when building a music streaming SDK.

---

## [youtubei.js](https://www.npmjs.com/package/youtubei.js)

**Downloads:** ~90k+/week (used by 14.7k projects on GitHub as of early 2026)
**Version:** 17.0.1 (March 2026, actively maintained — 106 releases)
**Repo:** https://github.com/LuanRT/YouTube.js
**Stars:** ~4.9k

**What it does:**
The gold-standard InnerTube client for JavaScript. Reverse-engineers YouTube's private InnerTube API — the same API all YouTube clients (web, Android, iOS, TV) use under the hood. Works in Node.js, Deno, and modern browsers. No official API key required.

**Interesting bits:**

- **`yt.music` namespace** — dedicated Music client with methods: `getHomeFeed()`, `getAlbum(albumId)`, `getArtist(artistId)`, `getExplore()`, `search(query, { filter: 'song' | 'video' | 'album' | 'artist' | 'playlist' | 'all' })`, `getPlaylist(playlistId)`, `getQueue()`, lyrics support. The music namespace is a first-class citizen, not bolted on.

- **Strongly-typed parsed responses** — every API response is parsed into typed node objects (e.g., `MusicCarouselShelf`, `MusicTwoRowItem`). You can call `.as(YTNodes.MusicCarouselShelf)` on sections. Almost no raw JSON exposure.

- **DASH manifest generation** — `toDash()` on streaming data converts YouTube's format data into an MPEG-DASH manifest string, enabling direct playback in players like dash.js or Media Source Extensions. Async because it fetches the first OTF sequence to build the manifest correctly.

- **SABR stream handling** — handles YouTube's newer SABR (Scalable Adaptive Bitrate) format which multiplexes audio+video into UMP packets. Has processors to extract individual segments.

- **Multiple InnerTube clients** — can impersonate different YouTube clients (`WEB`, `ANDROID`, `IOS`, `TV_EMBEDDED`, etc.) to unlock different format sets. Android client notably gets different format availability.

- **Protobuf-based API communication** — constructs protobuf payloads for InnerTube requests, which is how real YouTube clients talk to the backend.

- **OAuth + cookie auth** — supports authenticated requests for liked/saved content, subscriptions, history, playlist management.

- **Live chat** — real-time live chat polling, sending messages, managing events. Built for Discord bots and live stream tools.

- **Browser support** — ships as ESM, works in browser with no shims needed. Streaming in-browser via DASH is a realistic pattern.

- **98.8% TypeScript codebase**.

**Gaps/weaknesses:**

- The typed node graph is powerful but steep learning curve — you have to know what `YTNodes.*` type to expect from a response section. Not beginner-friendly.
- Music-specific streaming URL extraction requires understanding the format graph (DASH vs. adaptive formats vs. SABR).
- No built-in audio decoding or playback — it gets you the stream URL/manifest, you wire the player yourself.
- Being an unofficial API client, YouTube can break it at any time. They have broken it multiple times historically, though the maintainer patches quickly.
- Large dependency surface compared to thin wrappers.

---

## [ytmusic-api](https://www.npmjs.com/package/ytmusic-api)

**Downloads:** ~334/week
**Version:** 5.3.1 (February 2026)
**Repo:** https://github.com/zS1L3NT/ts-npm-ytmusic-api

**What it does:**
A TypeScript-first YouTube Music data scraper. Rebuilt from scratch on top of the older `youtube-music-api` package, with proper types and Zod validation. Focused purely on YouTube Music data — no video downloading, no live chat, no account actions.

**Interesting bits:**

- **Zod schema validation on every response** — every API response is validated at runtime against a Zod schema before returning to the caller. This means the library is honest about what YouTube actually returns vs. what the types claim. The author acknowledges ~95% type accuracy — Zod helps surface the 5%.

- **Minimal, focused API surface** — `initialize()`, `search(query)`, `searchSongs(query)`, `searchVideos(query)`, `searchArtists(query)`, `searchAlbums(query)`, `searchPlaylists(query)`, `getSong(videoId)`, `getVideo(videoId)`, `getArtist(artistId)`, `getAlbum(albumId)`, `getPlaylist(playlistId)`, `getSearchSuggestions(query)`, `getLyrics(browseId)`. Clean method-per-entity design.

- **Initialization step** — requires `await ytmusic.initialize()` before use. This front-loads cookie setup and session context, which keeps methods clean and side-effect free.

- **Axios + tough-cookie** — uses cookies for session persistence without requiring user auth. Good pattern for anonymous scraping.

- **Excellent TypeScript typings** — return types are well defined and predictable. If you're building something type-safe on top, this is the cleanest starting point in the ecosystem for pure music data.

**Gaps/weaknesses:**

- Low popularity (334/week) — small community, single maintainer.
- No streaming URL extraction. This is purely a metadata/search library. You'd need `youtubei.js` or a ytdl-style library to actually get audio.
- Validation gap (~5%) — Zod catches mismatches but doesn't fix them; you still get undefined for some fields.
- No auth support — can't access personal library, liked songs, or saved playlists.
- No pagination continuation tokens exposed in the public API (some endpoints just return what fits in one response).

---

## [node-youtube-music](https://www.npmjs.com/package/node-youtube-music)

**Downloads:** ~12k–37k/week (varies by source)
**Version:** 0.10.3 (last published ~3 years ago — **archived June 2024**, read-only)
**Repo:** https://github.com/baptisteArno/node-youtube-music

**What it does:**
Slim, zero-dependency YouTube Music API client focused purely on music data operations. Uses the `got` HTTP library. Built for the Typebot ecosystem but widely adopted. Now archived/unmaintained.

**Interesting bits:**

- **Pure named exports, no class** — `searchMusics(query)`, `searchAlbums(query)`, `searchArtists(query)`, `searchPlaylists(query)`, `listMusicsFromAlbum(albumId)`, `listMusicsFromPlaylist(playlistId)`, `getArtist(artistId)`, `getSuggestions(youtubeId)`. Completely flat API, no `new Client()` ceremony. Import what you need.

- **ID-first design** — every result entity carries its ID (`youtubeId`, `albumId`, `artistId`, `playlistId`) so you can immediately chain to another call. Easy to build navigation flows.

- **`getSuggestions(youtubeId)`** — takes a track ID and returns related song recommendations. Good radio-mode primitive.

- **Playlist mutation** — had basic playlist create/push/remove support before archival.

- **Single dependency (`got`)** — extremely lean. The whole package is 59.5 kB.

- **Download counts relative to its tiny footprint** — the gap between its ~12k–37k weekly downloads and its minimal feature set suggests a lot of music apps rely on this for basic metadata even while using other tools for actual streaming.

**Gaps/weaknesses:**

- **Archived as of June 2024** — no maintenance. Will break when YouTube changes InnerTube response shapes.
- No streaming URLs or audio extraction.
- No user auth, no library access.
- No TypeScript validation — types are manually declared and can drift from actual responses.
- No browser support (Node.js only via `got`).

---

## [ytdlp-nodejs](https://www.npmjs.com/package/ytdlp-nodejs)

**Downloads:** ~29.6k/week
**Version:** 3.4.4 (February 2026)
**Repo:** https://github.com/iqbal-rashed/ytdlp-nodejs

**What it does:**
TypeScript wrapper around the `yt-dlp` binary. yt-dlp supports 1,000+ sites including YouTube Music. The library handles binary lifecycle management, streaming, download, audio extraction, and metadata — all via yt-dlp under the hood.

**Interesting bits:**

- **Fluent builder pattern for downloads:**
  ```ts
  ytdlp
    .download(url)
    .filter('mergevideo')
    .quality('1080p')
    .type('mp4')
    .on('progress', (p) => console.log(p.percentage))
    .run()
  ```
  Chains config before execution. Very readable, very discoverable.

- **Audio extraction with format control** — supports MP3, FLAC, AAC, M4A, Opus, Vorbis, WAV, ALAC. You pick the target format and yt-dlp + FFmpeg handle the conversion.

- **Multiple output modes** — pipe to a writable stream, buffer to memory, or get a PassThrough. The streaming API is designed for real playback pipelines.

- **Rich progress events** — `start`, `beforeDownload`, `stdout`, `stderr`, `progress` (with percentage), `error`, `finish`. Complete lifecycle coverage for UI feedback.

- **Binary management built-in** — downloads and manages the yt-dlp binary automatically. `YtDlp.updateBinary()` keeps it current. No manual binary wrangling.

- **Metadata API** — `getVideoInfo(url)` returns structured JSON with all yt-dlp fields: title, duration, formats, thumbnails, uploader, chapters, etc.

- **yt-dlp inherits SponsorBlock integration** — can strip sponsor segments from downloads via yt-dlp flags.

**Gaps/weaknesses:**

- **Requires yt-dlp binary** (a Python executable) — not a pure-JS solution. Requires Python 3.9+ available as `python3` in PATH. Not suitable for serverless or edge environments.
- **Requires FFmpeg** for audio conversion — another external dependency.
- **Not browser-compatible** — shell execution via child_process.
- **Version 3.4.0 marked beta** — API stability not guaranteed yet.
- yt-dlp itself is community-maintained and can lag on YouTube format changes.
- Slower than pure-JS approaches — each operation spawns a subprocess.

---

## [youtube-dl-exec](https://www.npmjs.com/package/youtube-dl-exec)

**Downloads:** ~13k/week
**Version:** actively maintained (part of microlink.io)
**Repo:** https://github.com/microlinkhq/youtube-dl-exec

**What it does:**
A minimal, battle-tested Node.js wrapper for yt-dlp (originally youtube-dl). Part of the Microlink ecosystem. Focused on simplicity: give it a URL and flags, get back JSON or a stream. Auto-installs the latest yt-dlp binary during `npm install`.

**Interesting bits:**

- **`youtubedl(url, flags, options)`** — dead simple. Pass any yt-dlp flag as an object key. Returns a promise that resolves to parsed JSON output. No class, no builder. Just call it.

  ```ts
  const info = await youtubedl('https://youtube.com/watch?v=...', {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot']
  })
  ```

- **`youtubedl.exec(url, flags)`** — exposes the raw subprocess for streaming use. Pipe `stdout` directly to a writable.

- **`youtubedl.create(binaryPath)`** — factory for custom binary paths. Useful when you ship yt-dlp yourself or want a frozen version.

- **Auto-install on npm install** — zero manual binary setup. `YOUTUBE_DL_SKIP_DOWNLOAD=true` env var if you want to skip it.

- **Flag-as-object approach** — instead of building CLI strings, flags are camelCase object keys. `--dump-single-json` becomes `dumpSingleJson: true`. Eliminates shell injection risk.

- **Used by Microlink in production** — battle-tested in a real commercial product doing large-scale URL metadata extraction.

**Gaps/weaknesses:**

- **Requires Python 3.9+** in PATH — same binary dependency as ytdlp-nodejs.
- Thinner API surface than ytdlp-nodejs — no built-in fluent builder, no progress events out of the box, no binary update method.
- No TypeScript-native types beyond the basic function signatures — yt-dlp JSON output isn't typed.
- Not browser-compatible.
- Less music-specific than ytdlp-nodejs — it's a general yt-dlp wrapper. You have to know your yt-dlp flags.

---

## [innertube.js](https://www.npmjs.com/package/innertube.js)

**Downloads:** Low (niche, newer package)
**Version:** 1.1.5 (June 2025)
**Repo:** https://github.com/Shashwat-CODING/innertube.js

**What it does:**
A lightweight, zero-dependency InnerTube client focused specifically on YouTube Music's data endpoints. No auth, no account features — just YouTube Music browsing and search.

**Interesting bits:**

- **Zero dependencies** — earlier versions used `node-fetch` + `tough-cookie`, but 1.1.x dropped them. Pure fetch.

- **Music-first method naming** — all methods prefixed `ytm*`:
  - `ytmGetHomeData()` — home page feed
  - `ytmGetArtist(artistId)` — artist page
  - `ytmGetAlbum(albumId)` — album with track list
  - `ytmGetPlaylist(playlistId)` — playlist contents
  - `ytmGetLyrics(videoId)` — lyrics
  - `ytmGetSong(videoId)` — song details
  - `ytmGetMoodCategories()` — all mood/genre categories
  - `ytmGetMoodPlaylists(params)` — playlists for a mood
  - `ytmSearch(query)` — search

- **Mood/genre discovery** — `getMoodCategories()` + `getMoodPlaylists()` is a feature most other npm packages skip. Useful for building "vibe-based" browse experiences.

- **Pagination support** — all list endpoints have continuation token support.

- **Tiny footprint** — without dependencies, this is essentially a thin fetch wrapper around InnerTube endpoints with response parsing. Easy to fork and study.

**Gaps/weaknesses:**

- Very low adoption and minimal documentation.
- No streaming URL extraction — metadata only.
- No auth support.
- Response parsing may be fragile (no Zod or schema validation).
- The InnerTube endpoint structure it targets could change and break silently.
- Not TypeScript (or minimal types).

---

## Summary Table

| Package | Focus | Downloads/week | Auth | Streaming | Music-First | TypeScript | Maintained |
|---|---|---|---|---|---|---|---|
| `youtubei.js` | Full InnerTube client | ~90k+ | Yes (OAuth + cookies) | DASH manifest + SABR | Yes (`yt.music`) | 98.8% TS | Yes (v17, active) |
| `ytmusic-api` | Music metadata scraper | ~334 | No | No | Yes | Yes + Zod | Yes (v5.3) |
| `node-youtube-music` | Music search/browse | ~12k–37k | No | No | Yes | Yes | No (archived 2024) |
| `ytdlp-nodejs` | yt-dlp TypeScript wrapper | ~29.6k | N/A (binary) | Yes (stream/pipe) | No (generic) | Yes | Yes (v3.4) |
| `youtube-dl-exec` | yt-dlp minimal wrapper | ~13k | N/A (binary) | Via subprocess | No (generic) | Partial | Yes (microlink) |
| `innertube.js` | Lightweight YTM client | Low | No | No | Yes | Minimal | Minimal |

---

## Key Takeaways for Building a Music SDK

1. **`youtubei.js` is the foundation** — if you need actual streaming URLs, InnerTube auth, or the most complete data model, build on or study this. The `yt.music` namespace is particularly valuable. DASH manifest generation shows how to bridge raw format data to playable streams.

2. **`ytmusic-api`'s Zod approach is worth copying** — validating InnerTube responses at runtime with Zod gives honest types instead of wishful typing. The 95% accuracy problem is real; schema validation surfaces it.

3. **`node-youtube-music`'s flat, named-export API** is the cleanest DX for music-specific ops. No class ceremony. Functions that take IDs and return well-structured entities. Worth borrowing the API shape even if not the implementation.

4. **`ytdlp-nodejs`'s fluent builder + lifecycle events** is the right pattern for download/stream operations where you need progress feedback. The `on('progress')` pattern is expected by callers building UI on top.

5. **`innertube.js`'s mood/genre endpoints** — `getMoodCategories()` + `getMoodPlaylists()` is a browsing feature the higher-profile packages often skip. Worth implementing in any music SDK that wants discover-by-mood.

6. **The binary wrapper gap** — `ytdlp-nodejs` and `youtube-dl-exec` both require Python + yt-dlp binaries, making them unsuitable for serverless/edge. The pure-JS InnerTube approach (`youtubei.js`) avoids this but requires reverse-engineering YouTube's format selection logic yourself.
