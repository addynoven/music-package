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
- **Playable stream URLs** — pre-signed, cached ~6 hours, auto-refreshed
- **Quality control** — `high` / `low` quality per individual request
- **Raw audio stream** — yt-dlp stdout as a Node.js Readable, zero decode overhead
- **Raw PCM stream** — 48 kHz / 16-bit LE / stereo — drop straight into a Discord voice connection

**URL Resolution**
- **Paste any URL, it just works** — YouTube (`youtube.com/watch`, `youtu.be`), YouTube Music (`music.youtube.com/watch`, `/browse`, `/playlist`, `/search`) — all resolve to the right ID automatically
- **Spotify resolver** — converts a Spotify track URL to a `"Title Artist"` search query

**Metadata & Lyrics**
- **Track metadata** — title, artist, album, duration, thumbnails
- **Synced lyrics (LRC)** — per-line timestamps from LRCLib
- **Plain text lyrics** — fallback via lyrics.ovh when LRC is unavailable
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
- **Event system** — `beforeRequest`, `afterRequest`, `cacheHit`, `cacheMiss`, `rateLimited`, `retry`, `error`
- **Custom sources** — implement `AudioSource` and register any platform with `mk.registerSource()`
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
- [Custom Sources](#custom-sources)
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

Returns `Lyrics | null`. `synced` is `null` when only plain text is available.

```ts
const lyrics = await mk.getLyrics(songId)

lyrics?.plain          // full plain text string
lyrics?.synced         // LyricLine[] | null

// LyricLine: { time: number (seconds), text: string, words?: LyricWord[] }

// LRC utilities
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

All options are optional.

```ts
const mk = new MusicKit({
  // Logging
  logLevel: 'warn',  // 'silent' | 'error' | 'warn' | 'info' | 'debug'
  logHandler: (level, message, meta) => myLogger.log(level, message, meta),

  // Rate limiting
  rateLimit: { search: 10, browse: 20, stream: 5, autocomplete: 30 },
  minRequestGap: 100,  // ms between any two requests

  // Retry
  maxRetries: 3,
  backoffBase: 1000,
  backoffMax: 30000,

  // Credentials
  youtubeApiKey: process.env.YT_API_KEY,
  cookiesPath: process.env.COOKIES_PATH,

  // Cache (SQLite)
  cache: {
    enabled: true,
    dir: './cache',
    ttl: { stream: 21600, search: 300, home: 28800, artist: 3600 },
  },

  // YouTube Music locale
  language: 'hi',
  location: 'IN',

  // Source routing
  sourceOrder: 'best',  // default

  // Audio identification
  identify: {
    acoustidApiKey: process.env.ACOUSTID_KEY,
    songrecBin: '/usr/bin/songrec',
  },
})
```

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
interface Lyrics      { plain: string; synced: LyricLine[] | null }
interface LyricLine   { time: number; text: string; words?: LyricWord[] }
interface LyricWord   { time: number; text: string }
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
