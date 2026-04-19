# streamkit

A developer-facing SDK for YouTube Music. Clean API for search, autocomplete, stream resolution, browsing, and download. Built for single-user apps: CLI tools, bots, desktop apps, Discord bots.

```bash
npm install streamkit
# or
pnpm add streamkit
```

> **Requires** [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH for audio download fallback.

---

## Quick start

```ts
import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

const suggestions = await mk.autocomplete('never gonna')
// → ["never gonna give you up", "never gonna let you down", ...]

const results = await mk.search('never gonna give you up')
const song = results.songs[0]
console.log(`${song.title} by ${song.artist}`)

const stream = await mk.getStream(song.videoId)
console.log(stream.url)   // playable audio URL (~6h TTL)
console.log(stream.codec) // "opus"
```

---

## API

### `new MusicKit(config?)`

```ts
const mk = new MusicKit()                    // zero config
const mk = new MusicKit({ logLevel: 'silent' }) // custom config
const mk = await MusicKit.create()           // eager Innertube init (optional)
```

See [Configuration](#configuration) for all options.

---

### Search & Autocomplete

```ts
// Autocomplete
const suggestions: string[] = await mk.autocomplete('bohemian')

// Search — mixed results
const all = await mk.search('queen')
// all.songs, all.albums, all.artists, all.playlists

// Search — filtered by type (TypeScript infers the exact return type)
const songs:    Song[]    = await mk.search('bohemian rhapsody', { filter: 'songs' })
const albums:   Album[]   = await mk.search('queen', { filter: 'albums' })
const artists:  Artist[]  = await mk.search('rick astley', { filter: 'artists' })

// Using the enum (editor autocomplete)
import { SearchFilter } from 'musicstream-sdk'
const songs = await mk.search('queen', { filter: SearchFilter.Songs })
```

---

### Stream resolution

```ts
// Get a playable URL
const stream: StreamingData = await mk.getStream('fJ9rUzIMcZQ')
stream.url        // "https://rr5---.googlevideo.com/videoplayback?..."
stream.codec      // "opus" | "mp4a"
stream.bitrate    // 160000 (bps)
stream.expiresAt  // Unix timestamp
stream.loudnessDb // -7.2 (LUFS, optional)
stream.sizeBytes  // 3456789 (optional)

// Quality selection
const high = await mk.getStream('fJ9rUzIMcZQ', { quality: 'high' }) // default
const low  = await mk.getStream('fJ9rUzIMcZQ', { quality: 'low' })

// AudioTrack — metadata + stream in one object
const track: AudioTrack = await mk.getTrack('fJ9rUzIMcZQ')
track.title        // "Bohemian Rhapsody"
track.stream.url   // playable URL
```

---

### Browse

```ts
// Home feed
const home: Section[] = await mk.getHome()
// [{ title: "Quick picks", items: Song[] }, { title: "Trending", items: [...] }]

// Artist page
const artist: Artist = await mk.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')
artist.name     // "Queen"
artist.songs    // Song[]
artist.albums   // Album[]
artist.singles  // Album[]

// Album page
const album: Album = await mk.getAlbum('MPREb_4pL8gzRtw1v')
album.title   // "A Night at the Opera"
album.tracks  // Song[] — all tracks in order

// Auto-generated radio from a seed song
const radio: Song[] = await mk.getRadio('fJ9rUzIMcZQ')

// Related songs
const related: Song[] = await mk.getRelated('fJ9rUzIMcZQ')

// Charts
const charts: Section[] = await mk.getCharts({ country: 'US' })
const global: Section[] = await mk.getCharts()
```

---

### Download

Saves audio to disk. Uses yt-dlp under the hood (must be installed separately).

```ts
// Basic
await mk.download('fJ9rUzIMcZQ', { path: './music/' })
// → ./music/Bohemian Rhapsody (Queen).opus

// Format selection
await mk.download('fJ9rUzIMcZQ', { path: './music/', format: 'm4a' })

// Progress tracking
await mk.download('fJ9rUzIMcZQ', {
  path: './music/',
  onProgress: (percent) => process.stdout.write(`\r${percent}%`),
})

// Batch download from search
const songs = await mk.search('queen', { filter: 'songs' })
for (const song of songs) {
  await mk.download(song.videoId, { path: './queen/' })
}
```

---

### Events

Hook into MusicKit's internal lifecycle for logging, metrics, or UI feedback.

```ts
mk.on('beforeRequest', (req) => {
  console.log(`→ ${req.endpoint}`)
})

mk.on('afterRequest', (req, durationMs, status) => {
  console.log(`← ${req.endpoint} ${status} (${durationMs}ms)`)
})

mk.on('rateLimited', (endpoint, waitMs) => {
  console.log(`Rate limited on [${endpoint}] — waiting ${waitMs}ms`)
})

mk.on('cacheHit', (key, ttlRemaining) => {
  console.log(`Cache hit: ${key}`)
})

mk.on('cacheMiss', (key) => {
  console.log(`Cache miss: ${key}`)
})

mk.on('retry', (endpoint, attempt, reason) => {
  console.log(`Retrying ${endpoint} (attempt ${attempt}/3): ${reason}`)
})

mk.on('error', (err) => {
  console.error(err.message)
})

// Remove a listener
const handler = (key: string) => console.log(key)
mk.on('cacheHit', handler)
mk.off('cacheHit', handler)
```

---

### Error codes

```ts
import { MusicKitErrorCode } from 'musicstream-sdk'
import type { MusicKitError } from 'musicstream-sdk'

mk.on('error', (err: MusicKitError) => {
  if (err.code === MusicKitErrorCode.RateLimited)      console.warn('Rate limited')
  if (err.code === MusicKitErrorCode.VideoUnavailable) console.warn('Video removed')
  if (err.code === MusicKitErrorCode.CipherFailure)    console.error('Update musickit')
})
```

| Code | Meaning |
|---|---|
| `RateLimited` | 429 from YouTube — backing off |
| `Forbidden` | 403 — visitor ID refreshed and retried |
| `VideoUnavailable` | Video removed or doesn't exist |
| `VideoUnplayable` | Geo-restricted, age-gated, or premium |
| `CipherFailure` | YouTube changed stream cipher — update the package |
| `NetworkError` | No internet / request timeout |
| `ParseError` | YouTube changed API response shape |
| `DownloadError` | File write failed (permissions, disk space) |
| `Unknown` | Unexpected error |

---

## Configuration

All options are optional. MusicKit works out of the box with zero config.

```ts
const mk = new MusicKit({
  // Logging
  logLevel: 'info',           // "debug" | "info" | "warn" | "error" | "silent"

  // Rate limiting (requests per minute per endpoint)
  rateLimit: {
    search: 10,               // default
    browse: 20,               // default
    stream: 5,                // default
    autocomplete: 30,         // default
  },

  // Minimum gap between any two requests (ms)
  minRequestGap: 100,         // default

  // Retry behaviour
  maxRetries: 3,              // default
  backoffMax: 60_000,         // default — max backoff 60s

  // Session
  visitorId: 'CgtBQnlVMn...', // bring your own visitor ID
  userAgent: 'Mozilla/5.0 ...', // override User-Agent

  // Caching (SQLite)
  cache: {
    dir: './my_cache',        // default: OS temp dir
    enabled: true,            // default
    ttl: {
      stream: 21_600,         // 6 hours (default)
      search: 300,            // 5 minutes (default)
      home: 28_800,           // 8 hours (default)
      artist: 3_600,          // 1 hour (default)
    },
  },
})
```

---

## Data models

```ts
interface Song {
  type: 'song'
  videoId: string
  title: string
  artist: string
  album?: string
  duration: number        // seconds
  thumbnails: Thumbnail[]
}

interface Album {
  type: 'album'
  browseId: string
  title: string
  artist: string
  year?: string
  thumbnails: Thumbnail[]
  tracks: Song[]          // populated by getAlbum(), empty from search()
}

interface Artist {
  type: 'artist'
  channelId: string
  name: string
  subscribers?: string    // e.g. "10M"
  thumbnails: Thumbnail[]
  songs: Song[]           // populated by getArtist(), empty from search()
  albums: Album[]
  singles: Album[]
}

interface StreamingData {
  url: string
  codec: 'opus' | 'mp4a'
  bitrate: number         // bps
  expiresAt: number       // Unix timestamp
  loudnessDb?: number     // LUFS
  sizeBytes?: number
}

interface AudioTrack extends Song {
  stream: StreamingData
}
```

---

## Real-world patterns

### CLI music player

```ts
const mk = new MusicKit({ logLevel: 'silent' })
const songs = await mk.search(process.argv[2], { filter: 'songs' })
const stream = await mk.getStream(songs[0].videoId)
// execa('mpv', [stream.url])
```

### Discord bot

```ts
class MusicBot {
  private mk = new MusicKit({ cache: { ttl: { search: 900 } } })

  async play(query: string) {
    const [song] = await this.mk.search(query, { filter: 'songs' })
    return this.mk.getTrack(song.videoId)
  }
}
```

### Download manager

```ts
const mk = new MusicKit()
const songs = await mk.search('queen', { filter: 'songs' })
for (const song of songs) {
  await mk.download(song.videoId, { path: './music/', format: 'opus' })
}
```

---

## Features

### Search & Autocomplete

- [x] `mk.autocomplete(query)` — query suggestions as you type → `string[]`
- [x] `mk.search(query)` — mixed results → `{ songs, albums, artists, playlists }`
- [x] `mk.search(query, { filter: 'songs' })` → `Song[]`
- [x] `mk.search(query, { filter: 'albums' })` → `Album[]`
- [x] `mk.search(query, { filter: 'artists' })` → `Artist[]`
- [x] `mk.search(query, { filter: 'playlists' })` → `Playlist[]`

### Streaming

- [x] `mk.getStream(videoId)` — resolve playable audio URL → `StreamingData`
- [x] `mk.getStream(videoId, { quality: 'high' })` — high quality (default)
- [x] `mk.getStream(videoId, { quality: 'low' })` — low quality / bandwidth saving
- [x] `mk.getTrack(videoId)` — metadata + stream URL in one call → `AudioTrack`
- [x] Stream URL includes codec (`opus` or `mp4a`), bitrate, expiry timestamp
- [x] Loudness normalization value (`loudnessDb`) when available
- [x] File size in bytes (`sizeBytes`) when available

### Browse

- [x] `mk.getHome()` — home feed with sections (Quick Picks, Trending, etc.) → `Section[]`
- [x] `mk.getArtist(channelId)` — artist page with songs, albums, singles → `Artist`
- [x] `mk.getAlbum(browseId)` — album page with full track listing → `Album`
- [x] `mk.getRadio(videoId)` — auto-generated radio playlist from a seed song → `Song[]`
- [x] `mk.getRelated(videoId)` — related songs for a given track → `Song[]`
- [x] `mk.getCharts()` — global charts → `Section[]`
- [x] `mk.getCharts({ country: 'US' })` — country-specific charts

### Download

- [x] `mk.download(videoId, { path })` — save audio to disk (default: opus)
- [x] `mk.download(videoId, { path, format: 'opus' })` — Opus format
- [x] `mk.download(videoId, { path, format: 'm4a' })` — M4A / AAC format
- [x] `mk.download(videoId, { path, onProgress })` — progress callback `(percent: number) => void`
- [x] File named automatically: `<title> (<artist>).<format>`
- [x] Powered by yt-dlp under the hood (must be on PATH)

### Anti-Ban Layer (automatic — no config needed)

**Rate limiting**
- [x] Per-endpoint rate limits: autocomplete 30/min, browse 20/min, search 10/min, stream 5/min
- [x] 100ms minimum gap enforced between any two requests
- [x] Fully configurable via `rateLimit` config option

**Caching (SQLite — zero external deps)**
- [x] Stream URLs cached for 6 hours
- [x] Search results cached for 5 minutes
- [x] Home feed cached for 8 hours
- [x] Artist pages cached for 1 hour
- [x] Cache stored in OS temp dir by default (configurable)
- [x] Cache can be disabled entirely

**Retry engine**
- [x] Auto-retry on failure — 3 attempts by default
- [x] Exponential backoff between retries (max 60s)
- [x] `429 Too Many Requests` → waits 60s then retries
- [x] `403 Forbidden` → rotates visitor ID and retries

**Session management**
- [x] Visitor ID generated and cached automatically
- [x] Visitor ID refreshed every ~30 days
- [x] Bring your own visitor ID via config

### Events

- [x] `beforeRequest` — fires before every outgoing request `(req: MusicKitRequest) => void`
- [x] `afterRequest` — fires after every completed request `(req, durationMs, status) => void`
- [x] `rateLimited` — fires when a request is delayed by rate limiting `(endpoint, waitMs) => void`
- [x] `cacheHit` — fires when a cached result is returned `(key, ttlRemaining) => void`
- [x] `cacheMiss` — fires when no cache exists and a network call is made `(key) => void`
- [x] `visitorIdRefreshed` — fires when the visitor ID is rotated `(oldId, newId) => void`
- [x] `retry` — fires before each retry attempt `(endpoint, attempt, reason) => void`
- [x] `error` — fires when a request fails after all retries `(err: MusicKitError) => void`
- [x] `mk.off(event, handler)` — remove a specific listener

### TypeScript Support

- [x] Full types — all models, options, and events are typed
- [x] `SearchFilter` works as both a value (`SearchFilter.Songs`) and a type (`'songs'`)
- [x] `MusicKitErrorCode` typed error codes as a const enum
- [x] Search overloads — `search(q, { filter: 'songs' })` returns `Song[]` directly (no cast needed)
- [x] Ships with `.d.ts` declaration files — works in both ESM and CJS projects
- [x] Zero `any` — strict types throughout

---

## Requirements

- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on PATH (for download fallback when direct stream URLs fail)

## License

MIT
