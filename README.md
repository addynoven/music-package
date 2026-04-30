# musicstream-sdk

[![npm](https://img.shields.io/npm/v/musicstream-sdk)](https://www.npmjs.com/package/musicstream-sdk)
[![license](https://img.shields.io/npm/l/musicstream-sdk)](LICENSE)
[![node](https://img.shields.io/node/v/musicstream-sdk)](package.json)

Music search, streaming, lyrics, download, and playback queue for Node.js.  
Powered by YouTube Music — no API keys required to get started.

```bash
npm install musicstream-sdk
```

> Requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH.

---

```ts
import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()
const songs  = await mk.search('bohemian rhapsody', { filter: 'songs' })
const stream = await mk.getStream(songs[0].videoId)
const lyrics = await mk.getLyrics(songs[0].videoId)
```

---

## Features

**Search & Discovery**
- **Search** — songs, albums, artists, playlists — typed return type per filter
- **Autocomplete** — real-time search suggestions as you type
- **Charts** — country-specific top charts
- **Mood / genre playlists** — browse YouTube Music mood categories
- **Home feed** — personalized sections ("Trending", "New Releases", "Top Picks", etc.)

**Streaming**
- **InnerTube multi-client fallback** — `YTMUSIC → ANDROID_VR → TVHTML5` automatic rotation when one client fails (geo block, cipher rotation, throttling)
- **Pluggable PoToken** — accept a static `poToken` or async `getPoToken` callback for clients that need BotGuard tokens
- **Playable stream URLs** — pre-signed, cached ~6 hours, auto-refreshed
- **Quality control** — `high` / `low` quality per individual request
- **Private-track aware** — detects `MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK` (user-uploaded library tracks)
- **Raw audio stream** — yt-dlp stdout as a Node.js Readable, zero decode overhead
- **Raw PCM stream** — 48 kHz / 16-bit LE / stereo — drop straight into a Discord voice connection
- **yt-dlp universal fallback** — final safety net when every InnerTube client fails

**URL Resolution**
- **Paste any URL, it just works** — YouTube (`youtube.com/watch`, `youtu.be`), YouTube Music (`music.youtube.com/watch`, `/browse`, `/playlist`, `/search`) — all resolve to the right ID automatically
- **Spotify resolver** — converts a Spotify track URL to a `"Title Artist"` search query

**Metadata & Lyrics**
- **Track metadata** — title, artist, album, duration, thumbnails
- **7-provider lyrics chain** — BetterLyrics, LRCLIB, SimpMusic, YouTube Music native, KuGou, lyrics.ovh, YouTube subtitles. First non-null wins.
- **Real per-word timings** — Apple Music TTML `<span begin end>` from BetterLyrics, surfaced as `LyricLine.words[]` (no fake interpolation)
- **User-configurable chain** — reorder, disable, add custom providers via config, runtime registration, or per-call override
- **Provider attribution** — `Lyrics.source` reports which provider produced the result
- **Multi-language coverage** — KuGou for Chinese music, YouTube subtitles as universal last-resort
- **LRC utilities** — parse, seek to timestamp, offset, reserialize `.lrc` files

**Browse**
- **Artist pages** — top songs, albums, singles
- **Album pages** — full track listing
- **Playlist pages** — all songs with metadata
- **Radio / seed stations** — generate a station from any track ID
- **Related tracks** — "you might also like" recommendations
- **Up-next suggestions** — YouTube's continuation queue for any track

**Download & Identification**
- **Download** — save audio as `opus` or `m4a` via yt-dlp, with per-chunk progress callback
- **Audio identification** — fingerprint any local file via AcoustID + optional SongRec (Shazam)
- **Podcast / RSS** — parse any RSS feed, full iTunes namespace, direct episode audio URLs

**Infrastructure**
- **Multi-source routing** — automatic best-source selection, configurable order, per-request override
- **SQLite cache** — built on Node 22's `node:sqlite` (zero native deps), automatic TTL per data type
- **Rate limiter + retry** — per-endpoint limits, exponential backoff, 429-aware
- **Visitor-ID rotation + cookie auth + proxy** — full anti-ban toolkit (`undici.ProxyAgent`, persistent visitor-ID, Netscape cookies)
- **Event system** — `beforeRequest`, `afterRequest`, `cacheHit`, `cacheMiss`, `rateLimited`, `retry`, `error`
- **Custom sources** — implement `AudioSource` and register any platform with `mk.registerSource()`
- **Custom lyrics providers** — implement `LyricsProvider` and register via config or `mk.registerLyricsProvider()`
- **Zod validation** — schemas + `safeParse` helpers for all core models
- **Full TypeScript** — strict types, typed search overloads, typed events
- **Playback queue** — in-memory queue with repeat modes (`off`/`one`/`all`), shuffle, history, reorder

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Production Setup](#production-setup)
- [API Reference](#api-reference)
  - [Search](#search)
  - [Streaming](#streaming)
  - [Metadata](#metadata)
  - [Lyrics](#lyrics)
  - [Browse](#browse)
  - [Download](#download)
  - [Queue](#queue)
  - [Podcast](#podcast)
  - [Audio Identification](#audio-identification)
  - [Events](#events)
- [Configuration](#configuration)
  - [`.env` template](#env--recommended-template)
  - [Wiring `.env` → `MusicKitConfig`](#wiring-env--musickitconfig)
  - [Full option reference](#full-option-reference)
  - [External binaries (PATH dependencies)](#external-binaries-path-dependencies)
- [Custom Sources](#custom-sources)
- [Custom Lyrics Providers](#lyrics)
- [Validation](#validation)
- [Error Handling](#error-handling)
- [Utilities](#utilities)
  - [URL Resolver](#url-resolver)
- [Data Models](#data-models)
- [Requirements](#requirements)

---

## Installation

```bash
npm install musicstream-sdk
# pnpm
pnpm add musicstream-sdk
```

---

## Quick Start

```ts
import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

const songs = await mk.search('bohemian rhapsody', { filter: 'songs' })
const song  = songs[0]

const stream = await mk.getStream(song.videoId)
console.log(stream.url)      // playable URL
console.log(stream.codec)    // "opus" | "mp4a"
console.log(stream.bitrate)  // 320000

const lyrics = await mk.getLyrics(song.videoId)
console.log(lyrics?.plain)
console.log(lyrics?.synced)  // LyricLine[] | null
```

---

## Production Setup

For high-traffic apps, set both credentials to avoid rate limits:

```ts
const mk = new MusicKit({
  youtubeApiKey: process.env.YT_API_KEY,   // YouTube Data API v3 — for search
  cookiesPath:   process.env.COOKIES_PATH, // cookies.txt — for streams
})
```

| Credential | Purpose | How to get |
|---|---|---|
| `youtubeApiKey` | YouTube Data API v3 for search | [Google Cloud Console](https://console.cloud.google.com) → YouTube Data API v3 |
| `cookiesPath` | Logged-in yt-dlp session for streams | `yt-dlp --cookies-from-browser chrome --cookies cookies.txt --skip-download "https://youtube.com"` |

Without either, the SDK falls back to anonymous InnerTube + yt-dlp (fine for personal use).

---

## API Reference

### Search

```ts
// Autocomplete
const hints = await mk.autocomplete('bohemian')  // string[]

// All types
const results = await mk.search('queen')
// results.songs · results.albums · results.artists · results.playlists

// Typed by filter — TypeScript infers the return type
const songs     = await mk.search('bohemian rhapsody', { filter: 'songs' })    // Song[]
const albums    = await mk.search('a night at the opera', { filter: 'albums' }) // Album[]
const artists   = await mk.search('queen', { filter: 'artists' })               // Artist[]
const playlists = await mk.search('rock classics', { filter: 'playlists' })     // Playlist[]

// Limit + source override
const top5 = await mk.search('shakira', { filter: 'songs', limit: 5 })
const top5 = await mk.search('shakira', { filter: 'songs', limit: 5 })

// Spotify URL → search query → results
import { resolveSpotifyUrl } from 'musicstream-sdk'
const query = await resolveSpotifyUrl('https://open.spotify.com/track/...')
if (query) await mk.search(query, { filter: 'songs' })
```

---

### Streaming

```ts
// Playable URL (cached ~6h)
const stream = await mk.getStream(songId)
// stream.url · stream.codec · stream.bitrate · stream.expiresAt · stream.loudnessDb?

// Quality
const hq = await mk.getStream(songId, { quality: 'high' })  // default
const lq = await mk.getStream(songId, { quality: 'low' })

// Metadata + stream together
const track = await mk.getTrack(songId)  // AudioTrack = Song + StreamingData

// Raw audio bytes (yt-dlp stdout, no decode)
const readable = await mk.streamAudio(videoId)
readable.pipe(destination)

// Raw PCM — 48 kHz, 16-bit LE, stereo
const pcm = await mk.streamPCM(videoId)
pcm.pipe(discordVoiceConnection)

// Check if a cached URL is still valid
import { isStreamExpired } from 'musicstream-sdk'
if (isStreamExpired(cachedStream)) {
  const fresh = await mk.getStream(songId)
}
```

---

### Metadata

```ts
const song = await mk.getMetadata(songId)
// song.title · song.artist · song.album · song.duration · song.thumbnails

import { getBestThumbnail } from 'musicstream-sdk'
const thumb = getBestThumbnail(song.thumbnails, 300)  // closest to 300px
```

---

### Lyrics

Returns `Lyrics | null`. `synced` is `null` when only plain text is available. `source` reports which provider won.

```ts
const lyrics = await mk.getLyrics(songId)

lyrics?.plain          // full plain text string
lyrics?.synced         // LyricLine[] | null
lyrics?.source         // 'better-lyrics' | 'lrclib' | ... — provider that won

// LyricLine: { time: number, text: string, words?: WordTime[] }
// WordTime:  { time: number, duration?: number, text: string }
//
// Per-word timings (words[]) are populated only by BetterLyrics — Apple Music TTML
// with real <span begin end> timestamps. Other providers leave words undefined.
```

#### Provider chain — default

```
1. BetterLyrics       (lyrics-api.boidu.dev)        — Apple Music TTML, real word timings
2. LRCLIB             (lrclib.net)                  — synced lyrics, broad coverage
3. SimpMusic          (api-lyrics.simpmusic.org)    — synced, videoId fallback
4. YouTube Music      (yt.music.getLyrics)          — official major-label, plain text
5. KuGou              (lyrics.kugou.com)            — Chinese music coverage
6. lyrics.ovh         (lyrics.ovh)                  — plain text fallback
7. YouTube subtitles  (info.getTranscript)          — auto-captions, last resort
```

#### Customizing the chain

```ts
// Config-time — replace the default chain entirely
const mk = new MusicKit({
  lyrics: {
    providers: ['lrclib', 'simpmusic', 'lyrics-ovh'],   // synced-focused
  },
})

// Runtime — register custom or built-in providers
mk.registerLyricsProvider(myGeniusProvider)             // append
mk.registerLyricsProvider(myProvider, 'first')          // prepend
mk.registerLyricsProvider(myProvider, 'before:lrclib')  // ordered insert

// Per-call override — bypass the default chain for one request
const synced = await mk.getLyrics(id, { providers: ['lrclib', 'kugou'] })
const wordLevel = await mk.getLyrics(id, { providers: ['better-lyrics'] })
```

#### Custom providers

Implement the `LyricsProvider` interface for any source:

```ts
import type { LyricsProvider, LyricsProviderName, Lyrics } from 'musicstream-sdk'

const myProvider: LyricsProvider = {
  name: 'my-provider' as LyricsProviderName,  // pick one of the built-in names or extend the union
  async fetch(artist, title, duration?, fetchFn?, videoId?): Promise<Lyrics | null> {
    // Return synced/plain lyrics, or null if you can't find them.
    return null
  },
}

mk.registerLyricsProvider(myProvider, 'first')
```

#### LRC utilities

```ts
import { parseLrc, getActiveLine, getActiveLineIndex, formatTimestamp, offsetLrc, serializeLrc } from 'musicstream-sdk'

const lines  = parseLrc(rawLrcString)           // LyricLine[]
const active = getActiveLine(lines, 42.5)        // current line at 42.5s
const idx    = getActiveLineIndex(lines, 42.5)   // index (-1 if before start)
const ts     = formatTimestamp(42.5)             // "[00:42.50]"
const fixed  = offsetLrc(lines, 1.0)             // shift all timestamps by +1s
const lrc    = serializeLrc(lines)               // back to .lrc string
```

---

### Browse

```ts
// Home feed
const home = await mk.getHome()
const home = await mk.getHome({ language: 'ja' })  // locale-aware

for (const section of home) {
  console.log(section.title)  // "Trending Songs", "New Releases", etc.
  console.log(section.items)  // (Song | Album | Playlist)[]
}


// Artist / album / playlist pages
const artist   = await mk.getArtist(channelId)   // songs · albums · singles
const album    = await mk.getAlbum(browseId)      // tracks[]
const playlist = await mk.getPlaylist(playlistId) // songs[]

// Suggestions + radio
const upNext = await mk.getSuggestions(songId)  // YouTube recommendations
const radio  = await mk.getRadio(songId)        // seed-based station
const related = await mk.getRelated(videoId)    // "you might also like"

// Charts
const charts = await mk.getCharts()
const us     = await mk.getCharts({ country: 'US' })

// Mood / genre (YouTube Music)
const categories = await mk.getMoodCategories()
// [{ title: 'Feeling Happy', params: '...' }, ...]
const sections = await mk.getMoodPlaylists(categories[0].params)

```

---

### Download

```ts
await mk.download(videoId, {
  path:   './downloads',
  format: 'opus',            // 'opus' | 'm4a'  (default: 'opus')
  onProgress: (p) => process.stdout.write(`\r${p.percent.toFixed(0)}%`),
})
// Saved as: <title> (<artist>).opus
```

---

### Queue

```ts
import { Queue } from 'musicstream-sdk'
import type { RepeatMode } from 'musicstream-sdk'

const queue = new Queue<Song>()

queue.add(song)           // append to end
queue.playNext(song)      // insert at front

queue.next()              // advance — returns Song | null
queue.previous()          // step back through history

queue.current             // Song | null
queue.upcoming            // Song[] remaining
queue.history             // Song[] played
queue.size                // upcoming count
queue.isEmpty             // boolean

queue.repeat = 'off'      // 'off' | 'one' | 'all'
queue.shuffle()           // Fisher-Yates in-place

queue.move(2, 0)          // reorder: move index 2 to front
queue.skipTo(3)           // drop everything before index 3
queue.remove(1)           // remove upcoming[1]
queue.clear()             // wipe all
```

---

### Podcast

```ts
import { PodcastClient } from 'musicstream-sdk'

// Via MusicKit
const podcast = await mk.getPodcast('https://feeds.example.com/podcast.rss')

// Or standalone
const client  = new PodcastClient()
const podcast = await client.getFeed('https://...')

podcast.title · podcast.author · podcast.thumbnails · podcast.episodes

const ep = podcast.episodes[0]
ep.title · ep.url · ep.duration · ep.publishedAt
ep.season · ep.episode · ep.explicit · ep.thumbnails
// ep.url is the direct audio URL — pipe to any player
```

---

### Audio Identification

Identify a song from a local audio file using AcoustID fingerprinting + optional SongRec.

```ts
const mk = new MusicKit({
  identify: {
    acoustidApiKey: process.env.ACOUSTID_KEY,  // free at acoustid.org
    songrecBin: '/usr/bin/songrec',            // optional Shazam-backed recognizer
  },
})

const song = await mk.identify('./unknown-track.mp3')  // Song | null
// Tries SongRec first (faster), then AcoustID fingerprint.
// Returns a full Song with videoId on match.
```

Requires `fpcalc` on PATH (from [Chromaprint](https://acoustid.org/chromaprint)).

---

### Events

```ts
mk.on('beforeRequest',  (req) => {})
mk.on('afterRequest',   (req, durationMs, statusCode) => {})
mk.on('cacheHit',       (key, ttl) => {})
mk.on('cacheMiss',      (key) => {})
mk.on('rateLimited',    (endpoint, waitMs) => {})
mk.on('retry',          (endpoint, attempt, reason) => {})
mk.on('error',          (err) => {})
mk.off('error', handler)
mk.once('error', handler)
```

---

## Configuration

All options are optional. The SDK doesn't read environment variables directly — you pass them in via `MusicKitConfig`. The `.env` template below is the canonical convention; map them as shown in the example.

### `.env` — recommended template

```bash
# ── Credentials (recommended for production) ──────────────────────────────
YT_API_KEY=               # YouTube Data API v3 — better search + lower rate limits
COOKIES_PATH=             # Netscape cookies.txt for yt-dlp + InnerTube auth
                          # Export with: yt-dlp --cookies-from-browser chrome --cookies cookies.txt
                          #              --skip-download "https://youtube.com"

# ── Logging ───────────────────────────────────────────────────────────────
LOG_LEVEL=info            # silent | error | warn | info | debug

# ── YouTube Music locale ─────────────────────────────────────────────────
YT_LANGUAGE=              # BCP-47 language tag (en, hi, ja, ta, ...)
YT_LOCATION=              # ISO 3166-1 alpha-2 country code (US, IN, JP, ...)

# ── Network ──────────────────────────────────────────────────────────────
PROXY=                    # http://user:pass@host:port — applied to InnerTube + lyrics + AcoustID + yt-dlp
USER_AGENT=               # override the User-Agent for outbound external API calls
VISITOR_ID=               # pin a YouTube X-Goog-Visitor-Id (rotated automatically if unset)

# ── Rate limiting (ms between requests per bucket) ───────────────────────
RATE_LIMIT_SEARCH=        # default ~ unrestricted
RATE_LIMIT_BROWSE=        # default ~ unrestricted
RATE_LIMIT_STREAM=        # default ~ unrestricted
RATE_LIMIT_AUTOCOMPLETE=  # default ~ unrestricted

# ── PoToken (advanced — only needed for some web/age-restricted content) ─
PO_TOKEN=                 # static BotGuard token (paste from a logged-in session)
                          # OR provide a getPoToken callback in code (see below)

# ── Audio identification (mk.identify) ───────────────────────────────────
ACOUSTID_KEY=             # free key at acoustid.org
SONGREC_BIN=              # optional /usr/bin/songrec — Shazam-backed fallback
```

### Wiring `.env` → `MusicKitConfig`

```ts
import { MusicKit } from 'musicstream-sdk'

const mk = await MusicKit.create({
  // Logging
  logLevel: process.env.LOG_LEVEL as any ?? 'info',
  logHandler: (level, msg, meta) => myLogger.log(level, msg, meta),

  // Credentials
  youtubeApiKey: process.env.YT_API_KEY,
  cookiesPath:   process.env.COOKIES_PATH,

  // Locale
  language: process.env.YT_LANGUAGE,
  location: process.env.YT_LOCATION,

  // Network
  proxy:     process.env.PROXY,
  userAgent: process.env.USER_AGENT,
  visitorId: process.env.VISITOR_ID,

  // Rate limiting (ms between requests per bucket)
  rateLimit: {
    search:       process.env.RATE_LIMIT_SEARCH       ? Number(process.env.RATE_LIMIT_SEARCH)       : undefined,
    browse:       process.env.RATE_LIMIT_BROWSE       ? Number(process.env.RATE_LIMIT_BROWSE)       : undefined,
    stream:       process.env.RATE_LIMIT_STREAM       ? Number(process.env.RATE_LIMIT_STREAM)       : undefined,
    autocomplete: process.env.RATE_LIMIT_AUTOCOMPLETE ? Number(process.env.RATE_LIMIT_AUTOCOMPLETE) : undefined,
  },
  minRequestGap: 100,

  // Retry
  maxRetries: 3,
  backoffBase: 1000,
  backoffMax: 30000,

  // Cache (SQLite)
  cache: {
    enabled: true,
    dir: './cache',
    ttl: { stream: 21600, search: 300, home: 28800, artist: 3600 },
  },

  // PoToken (static or callback — getPoToken wins if both set)
  poToken: process.env.PO_TOKEN,
  getPoToken: async (videoId, client) => {
    // Plug your own generator (puppeteer, external service, etc.)
    return null
  },

  // Audio identification
  identify: process.env.ACOUSTID_KEY ? {
    acoustidApiKey: process.env.ACOUSTID_KEY,
    songrecBin:     process.env.SONGREC_BIN,
  } : undefined,

  // Source routing — default 'best' picks the right source automatically
  sourceOrder: 'best',

  // Lyrics provider chain — defaults to all 7, in quality order
  lyrics: {
    providers: ['better-lyrics', 'lrclib', 'simpmusic', 'youtube-native', 'kugou', 'lyrics-ovh', 'youtube-subtitle'],
  },
})
```

### Full option reference

| Option | Type | Default | What it controls |
|---|---|---|---|
| `logLevel` | `'silent' \| 'error' \| 'warn' \| 'info' \| 'debug'` | `'info'` | Verbosity |
| `logHandler` | `(level, msg, meta) => void` | `console` | Custom log sink |
| `youtubeApiKey` | `string` | — | YouTube Data API v3 — improved search, lower rate limits |
| `cookiesPath` | `string` | — | Path to Netscape `cookies.txt` — passed to InnerTube + yt-dlp |
| `language` | `string` | — | BCP-47 language for YT Music (e.g. `'hi'`, `'ja'`) |
| `location` | `string` | — | ISO country for YT Music (e.g. `'IN'`, `'US'`) |
| `proxy` | `string` | — | Proxy URL routed to InnerTube + LRCLIB + lyrics.ovh + AcoustID + yt-dlp |
| `userAgent` | `string` | youtubei.js default | UA for external API calls (LRCLIB, AcoustID, etc.) |
| `visitorId` | `string` | auto-generated, cached 30 days | Pin a YouTube `X-Goog-Visitor-Id` |
| `rateLimit.{search,browse,stream,autocomplete}` | `number` (ms) | unrestricted | Min ms between requests per bucket |
| `minRequestGap` | `number` (ms) | `100` | Hard floor between any two outbound requests |
| `maxRetries` | `number` | `3` | Per-request retry count |
| `backoffBase` | `number` (ms) | `1000` | Initial retry backoff |
| `backoffMax` | `number` (ms) | `30000` | Backoff ceiling |
| `cache.enabled` | `boolean` | `true` | SQLite cache on/off |
| `cache.dir` | `string` | `~/.musicstream-sdk` | Cache directory |
| `cache.ttl.{stream,search,home,artist}` | `number` (sec) | `21600 / 300 / 28800 / 3600` | Cache TTL per data type |
| `sourceOrder` | `'best' \| SourceName[]` | `'best'` | Source-routing preference |
| `poToken` | `string` | — | Static BotGuard token for InnerTube web clients |
| `getPoToken` | `(videoId, client) => Promise<string \| null>` | — | Async PoToken generator (overrides static) |
| `lyrics.providers` | `Array<LyricsProviderName \| LyricsProvider>` | all 7 in quality order | Custom lyrics chain |
| `identify.acoustidApiKey` | `string` | — | Required for `mk.identify()` |
| `identify.songrecBin` | `string` | — | Optional path to SongRec for Shazam fallback |

### External binaries (PATH dependencies)

The SDK isn't all-Node — some features call out to system binaries:

| Binary | Required for | Where to get |
|---|---|---|
| `yt-dlp` | `getStream` (yt-dlp fallback path), `download`, `streamAudio`, `streamPCM` | [yt-dlp.org](https://github.com/yt-dlp/yt-dlp) |
| `fpcalc` | `identify` (Chromaprint fingerprint) | [Chromaprint](https://acoustid.org/chromaprint) |
| `songrec` | `identify` — optional Shazam fallback | [marin-m/SongRec](https://github.com/marin-m/SongRec) |

---

## Custom Sources

Implement `AudioSource` to add any platform:

```ts
import type { Song, Album, Artist, Playlist, Section, StreamingData, SearchResults } from 'musicstream-sdk'

class MySource {
  readonly name = 'my-source'
  canHandle(query: string) { return query.startsWith('mysrc:') }

  async search(query: string): Promise<SearchResults> { /* ... */ }
  async getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData> { /* ... */ }
  async getMetadata(id: string): Promise<Song> { /* ... */ }

  // Optional
  async getAlbum?(id: string): Promise<Album> { /* ... */ }
  async getArtist?(id: string): Promise<Artist> { /* ... */ }
  async getPlaylist?(id: string): Promise<Playlist> { /* ... */ }
  async getRadio?(id: string): Promise<Song[]> { /* ... */ }
  async getHome?(language?: string): Promise<Section[]> { /* ... */ }
}

mk.registerSource(new MySource())
// Registered sources take priority over built-in sources.
```

---

## Validation

Zod schemas and safe-parse helpers for all core models:

```ts
import {
  SongSchema, AlbumSchema, ArtistSchema, PlaylistSchema, ThumbnailSchema,
  safeParseSong, safeParseAlbum, safeParseArtist, safeParsePlaylist,
} from 'musicstream-sdk'

SongSchema.parse(data)     // throws ZodError if invalid
safeParseSong(data)        // returns Song | null — never throws
safeParseAlbum(data)       // Album | null
safeParseArtist(data)      // Artist | null
safeParsePlaylist(data)    // Playlist | null
```

---

## Error Handling

All errors extend `MusicKitBaseError` and carry a `code` string.

```ts
import {
  NotFoundError, RateLimitError, NetworkError,
  ValidationError, StreamError, HttpError, NonRetryableError,
} from 'musicstream-sdk'

try {
  await mk.getStream(id)
} catch (err) {
  if (err instanceof RateLimitError)  console.log(err.retryAfterMs)
  if (err instanceof NetworkError)    console.log(err.statusCode, err.cause)
  if (err instanceof NotFoundError)   console.log(err.resourceId)
  if (err instanceof StreamError)     console.log(err.videoId)
}
```

| Class | Code | When |
|---|---|---|
| `NotFoundError` | `NOT_FOUND` | Resource doesn't exist |
| `RateLimitError` | `RATE_LIMITED` | 429 from any source |
| `NetworkError` | `NETWORK_ERROR` | HTTP failure or fetch error |
| `ValidationError` | `VALIDATION_ERROR` | Bad input / missing config |
| `StreamError` | `STREAM_ERROR` | Stream URL resolution failed |
| `HttpError` | — | Raw HTTP error (for custom sources) |
| `NonRetryableError` | — | Stop retry engine immediately |

---

## Utilities

### URL resolver

Paste any URL — the SDK figures out the ID or query automatically:

```ts
import { resolveInput } from 'musicstream-sdk'

resolveInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')   // "dQw4w9WgXcQ"
resolveInput('https://youtu.be/dQw4w9WgXcQ')                  // "dQw4w9WgXcQ"
resolveInput('https://music.youtube.com/watch?v=dQw4w9WgXcQ') // "dQw4w9WgXcQ"
resolveInput('https://music.youtube.com/browse/MPREb_...')     // "MPREb_..."  (album/artist)
resolveInput('https://music.youtube.com/playlist?list=PL...') // "PL..."      (playlist)
resolveInput('https://music.youtube.com/search?q=bohemian+rhapsody')  // "bohemian rhapsody"
resolveInput('some plain search query')                        // "some plain search query"

// So you can do:
const id = resolveInput(anyInput)
const stream = await mk.getStream(id)  // works for any URL or plain video ID
```

```ts
import {
  getBestThumbnail,    // (thumbnails, targetPx) → Thumbnail | null
  isStreamExpired,     // (stream) → boolean — true within 5min of expiry
  resolveInput,        // (url | id | query) → canonical ID string
  resolveSpotifyUrl,   // (spotifyTrackUrl) → "Title Artist" | null
  version,             // SDK version string e.g. "3.0.0"
} from 'musicstream-sdk'
```

---

## Data Models

```ts
interface Song        { type: 'song';     videoId: string; title: string; artist: string; album?: string; duration: number; thumbnails: Thumbnail[] }
interface Album       { type: 'album';    browseId: string; title: string; artist: string; year?: string; thumbnails: Thumbnail[]; tracks: Song[] }
interface Artist      { type: 'artist';   channelId: string; name: string; subscribers?: string; thumbnails: Thumbnail[]; songs: Song[]; albums: Album[]; singles: Album[] }
interface Playlist    { type: 'playlist'; playlistId: string; title: string; thumbnails: Thumbnail[]; songs?: Song[]; songCount?: number }
interface AudioTrack extends Song { stream: StreamingData }
interface StreamingData { url: string; codec: 'opus' | 'mp4a'; mimeType: string; bitrate: number; expiresAt: number; loudnessDb?: number; sizeBytes?: number }
interface Thumbnail   { url: string; width: number; height: number }
interface Section     { title: string; items: (Song | Album | Artist | Playlist)[] }
interface Lyrics      { plain: string; synced: LyricLine[] | null; source?: LyricsProviderName }
interface LyricLine   { time: number; text: string; words?: WordTime[] }
interface WordTime    { time: number; duration?: number; text: string }
type LyricsProviderName =
  | 'better-lyrics' | 'lrclib' | 'lyrics-ovh' | 'kugou'
  | 'simpmusic' | 'youtube-native' | 'youtube-subtitle'
interface LyricsProvider {
  readonly name: LyricsProviderName
  fetch(artist: string, title: string, duration?: number, fetchFn?: typeof fetch, videoId?: string): Promise<Lyrics | null>
}
interface Podcast     { type: 'podcast'; feedUrl: string; title: string; description: string; author: string; language: string; link: string; thumbnails: Thumbnail[]; episodes: PodcastEpisode[] }
interface PodcastEpisode { type: 'episode'; guid: string; title: string; description: string; url: string; mimeType: string; duration: number; publishedAt: string; thumbnails: Thumbnail[]; season?: number; episode?: number; explicit: boolean }
```

---

## Stability

This SDK uses **unofficial APIs** (YouTube InnerTube). No published SLA.

- YouTube stream cipher can break when YouTube rotates its player JS — usually fixed in [youtubei.js](https://github.com/LuanRT/YouTube.js) within days. Update the package.
- Use for Discord bots, CLI tools, desktop apps, personal projects. Not for infrastructure where an hour of downtime is unacceptable.

---

## Requirements

| Dependency | Required for |
|---|---|
| Node.js 22+ | Everything |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) on PATH | Stream resolution, `download()`, `streamAudio()`, `streamPCM()` |
| [fpcalc](https://acoustid.org/chromaprint) on PATH | `identify()` only |
| [songrec](https://github.com/marin-m/SongRec) | `identify()` — optional, adds Shazam recognition |

---

## License

MIT
