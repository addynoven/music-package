# musicstream-sdk

Node.js SDK for music search, streaming, browse, lyrics, download, and playback queue.
Unified API across JioSaavn and YouTube Music.

```bash
npm install musicstream-sdk
# or
pnpm add musicstream-sdk
```

> **Requires** [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH for stream resolution and download.

---

## Production setup

For production use (bots, servers, high-traffic apps) configure both credentials to avoid YouTube rate limits:

```ts
const mk = new MusicKit({
  youtubeApiKey: process.env.YT_API_KEY,      // YouTube Data API v3 — for search
  cookiesPath:   process.env.COOKIES_PATH,    // yt-dlp cookies.txt — for streams
})
```

| Credential | What it does | How to get it |
|---|---|---|
| `youtubeApiKey` | Uses YouTube Data API v3 for search (~100 searches/day free, never rate-limited at normal usage) | [Google Cloud Console](https://console.cloud.google.com) → enable YouTube Data API v3 → create API key |
| `cookiesPath` | Passes a logged-in session to yt-dlp — dramatically higher stream rate limits | Export from browser via [cookies.txt extension](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) or `yt-dlp --cookies-from-browser chrome --cookies cookies.txt --skip-download "https://youtube.com"` |

If neither is set, the SDK logs a warning and falls back to anonymous InnerTube + yt-dlp (fine for personal use, will hit 429 under load).

---

## Quick start

```ts
import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

// Search
const songs = await mk.search('tum hi ho', { filter: 'songs' })

// Stream — feed the URL to any audio player
const stream = await mk.getStream(songs[0].videoId)
console.log(stream.url)    // https://...
console.log(stream.codec)  // "opus" or "mp4a"
console.log(stream.bitrate) // 320000 (bps)

// Lyrics (synced + plain)
const lyrics = await mk.getLyrics(songs[0].videoId)
console.log(lyrics?.plain)
console.log(lyrics?.synced)   // LyricLine[] | null

// What to play next
const upNext = await mk.getSuggestions(songs[0].videoId)
```

---

## How it works

Two sources, one API. JioSaavn is tried first (better for Indian music, streams up to
320kbps). YouTube Music is the fallback. You never interact with either source directly —
IDs are opaque tokens you pass back to other methods.

```
Search / Browse / Lyrics    →  JioSaavn  (primary)
                             →  YouTube Music  (fallback)

Stream resolution            →  JioSaavn DES-ECB decrypt
                             →  YouTube InnerTube cipher decode
                             →  yt-dlp  (last resort)

getSuggestions               →  YouTube recommendation engine
                               (globally-aware, works for any language/genre)
                             →  Source-native radio  (fallback)
```

Platform URLs work anywhere you'd pass an ID — the SDK resolves them automatically:

```ts
await mk.getStream('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
await mk.getStream('https://www.youtube.com/watch?v=fJ9rUzIMcZQ')
await mk.getStream('https://music.youtube.com/watch?v=fJ9rUzIMcZQ')
await mk.search('https://music.youtube.com/search?q=queen')

// Spotify track URLs — resolved via HTML scrape to a search query
import { resolveSpotifyUrl } from 'musicstream-sdk'
const query = await resolveSpotifyUrl('https://open.spotify.com/track/...')
// → "Song Title Artist Name"
if (query) {
  const songs = await mk.search(query, { filter: 'songs' })
}
```

---

## API Reference

### Search & Autocomplete

```ts
// Autocomplete
const hints: string[] = await mk.autocomplete('bohemian')

// All types at once
const all = await mk.search('queen')
// all.songs[] · all.albums[] · all.artists[] · all.playlists[]

// Filtered (TypeScript infers the exact return type)
const songs     = await mk.search('bohemian rhapsody', { filter: 'songs' })
const albums    = await mk.search('a night at the opera', { filter: 'albums' })
const artists   = await mk.search('queen', { filter: 'artists' })
const playlists = await mk.search('rock classics', { filter: 'playlists' })

// Limit results
const top5 = await mk.search('shakira', { filter: 'songs', limit: 5 })

// Using the SearchFilter enum
import { SearchFilter } from 'musicstream-sdk'
await mk.search('queen', { filter: SearchFilter.Songs })
```

---

### Streaming

```ts
// Get a playable URL
const stream = await mk.getStream(songId)
// stream.url        — feed to mpv / ffplay / WebAudio / discord.js VoiceConnection / etc.
// stream.codec      — "opus" | "mp4a"
// stream.bitrate    — bits per second (e.g. 320000)
// stream.expiresAt  — Unix timestamp (~6h from now)
// stream.loudnessDb — LUFS for volume normalisation (optional)
// stream.sizeBytes  — file size (optional)

// Quality selection
const hq = await mk.getStream(songId, { quality: 'high' })  // default
const lq = await mk.getStream(songId, { quality: 'low' })   // smaller, faster

// Check expiry before reusing a cached URL
import { isStreamExpired } from 'musicstream-sdk'
if (isStreamExpired(cachedStream)) {
  const fresh = await mk.getStream(songId)
}

// Metadata + stream in one call
const track = await mk.getTrack(songId)
// track inherits all Song fields plus track.stream: StreamingData

// Raw audio stream (yt-dlp stdout piped directly — no ffmpeg)
const readable = await mk.streamAudio(videoId)
readable.pipe(someWritable)

// Raw PCM stream — 48 kHz, 16-bit, stereo, little-endian
// Fast path: resolves the stream URL and feeds it to ffmpeg directly (~200ms).
// Falls back to yt-dlp | ffmpeg if URL resolution fails.
const pcm = await mk.streamPCM(videoId)
pcm.pipe(discordVoiceConnection)   // works directly with discord.js
```

---

### Metadata

```ts
// Song info without fetching a stream URL
const song = await mk.getMetadata(songId)
// song.title · song.artist · song.album · song.duration · song.thumbnails

// Best thumbnail for your display size
import { getBestThumbnail } from 'musicstream-sdk'
const thumb = getBestThumbnail(song.thumbnails, 300)  // closest to 300px wide
console.log(thumb?.url)
```

---

### Lyrics

Returns `{ plain, synced }` — never just a string. `synced` is `null` when the source
only has plain text.

```ts
const lyrics = await mk.getLyrics(songId)  // Lyrics | null

if (lyrics) {
  console.log(lyrics.plain)   // full plain text

  if (lyrics.synced) {
    // LyricLine[] — sorted by time (seconds)
    for (const line of lyrics.synced) {
      console.log(line.time, line.text)
      // line.words — LyricWord[] with per-word timestamps (enhanced LRC only)
    }
  }
}
```

**LRC utilities** — parse, manipulate, and render synced lyrics:

```ts
import {
  parseLrc,
  getActiveLine,
  getActiveLineIndex,
  formatTimestamp,
  offsetLrc,
  serializeLrc,
} from 'musicstream-sdk'

const lines = parseLrc(rawLrcString)          // LyricLine[]
const active = getActiveLine(lines, 42.5)     // LyricLine at t=42.5s
const idx = getActiveLineIndex(lines, 42.5)   // number index
const ts = formatTimestamp(42.5)              // "[00:42.50]"
const shifted = offsetLrc(lines, 1.0)         // shift all lines by +1s
const lrcText = serializeLrc(lines)           // back to .lrc string
```

---

### Suggestions (up next)

```ts
// Globally-aware "up next" — YouTube's recommendation engine under the hood.
// Works with any song ID regardless of which source it came from.
const upNext = await mk.getSuggestions(songId)  // Song[]

// Falls back to source-native radio if YouTube lookup fails.
```

---

### Browse

```ts
// Home feed — smart language routing:
//   Indian language  → JioSaavn  (trending songs/albums/playlists, new releases)
//   Other language   → YouTube Music  (uses session locale from MusicKit.create)
//   No language      → JioSaavn  (generic browse modules)

const home        = await mk.getHome()
const hindiHome   = await mk.getHome({ language: 'hindi' })   // → JioSaavn
const tamilHome   = await mk.getHome({ language: 'tamil' })   // → JioSaavn

// For non-Indian languages, set locale at create time and pass the same language:
const mkJP = await MusicKit.create({ language: 'ja', location: 'JP' })
const jpHome = await mkJP.getHome({ language: 'ja' })          // → YouTube Music

for (const section of home) {
  console.log(section.title)   // "Trending Songs", "New Releases", "Featured Playlists", etc.
  console.log(section.items)   // (Song | Album | Playlist)[]
}

// Featured playlists — JioSaavn curated, Indian languages only
const playlists      = await mk.getFeaturedPlaylists()
const tamilPlaylists = await mk.getFeaturedPlaylists({ language: 'tamil' })
// Returns [] silently for non-Indian languages

// Check the routing list at runtime
import { JIOSAAVN_LANGUAGES } from 'musicstream-sdk'
JIOSAAVN_LANGUAGES.has('hindi')  // true  → JioSaavn
JIOSAAVN_LANGUAGES.has('ja')     // false → YouTube Music

// Artist page
const artist = await mk.getArtist(channelId)
// artist.name · artist.subscribers · artist.songs · artist.albums · artist.singles · artist.thumbnails

// Album page
const album = await mk.getAlbum(browseId)
// album.title · album.artist · album.year · album.tracks (Song[])

// Playlist
const playlist = await mk.getPlaylist(playlistId)
// Works with JioSaavn playlist IDs and YouTube playlist IDs (PLxxx)
// playlist.title · playlist.songs · playlist.songCount

// Radio — seed-based station (~20 tracks that flow together)
const radio = await mk.getRadio(songId)

// Related — "you might also like" (YouTube video IDs)
const related = await mk.getRelated(youtubeVideoId)

// Charts
const global = await mk.getCharts()
const us     = await mk.getCharts({ country: 'US' })

// Mood / genre categories (YouTube Music)
const categories = await mk.getMoodCategories()
// [{ title: 'Feeling Happy', params: '...' }, ...]

const sections = await mk.getMoodPlaylists(categories[0].params)
// Section[] — playlists for that mood
```

---

### Download

```ts
// Requires yt-dlp on PATH
await mk.download(youtubeVideoId, {
  path: './downloads',
  format: 'opus',     // 'opus' | 'm4a' (default: 'opus')
  onProgress: (p) => process.stdout.write(`\r${p.percent.toFixed(0)}%`),
})
// File saved as: <title> (<artist>).opus
```

---

### Queue

A pure, in-memory playback queue. No network calls — bring your own `Song` objects.

```ts
import { Queue } from 'musicstream-sdk'
import type { RepeatMode } from 'musicstream-sdk'

const queue = new Queue<Song>()

// Add tracks
queue.add(song1)
queue.add(song2)
queue.playNext(urgentSong)   // inserts at front of upcoming list

// Playback
const current = queue.next()      // advances and returns next Song | null
const prev    = queue.previous()  // goes back one in history

// Inspect
queue.current             // currently playing Song | null
queue.upcoming            // Song[] not yet played
queue.history             // Song[] already played
queue.size                // total tracks remaining
queue.isEmpty             // boolean

// Repeat
queue.repeat = 'off'      // default — play through and stop
queue.repeat = 'one'      // repeat current track forever
queue.repeat = 'all'      // loop the whole queue

// Shuffle (Fisher-Yates in-place, preserves current + history)
queue.shuffle()

// Reorder
queue.move(2, 0)          // move index 2 to index 0 (front of upcoming)
queue.skipTo(3)           // discard everything before index 3

// Remove / clear
queue.remove(1)           // remove upcoming[1]
queue.clear()             // wipe everything including current and history
```

---

### Podcast

Fetch and parse any podcast RSS feed. No API key or account required.

```ts
// Via MusicKit
const podcast = await mk.getPodcast('https://feeds.simplecast.com/...')

// Or directly
import { PodcastClient } from 'musicstream-sdk'
const client = new PodcastClient()
const podcast = await client.getFeed('https://...')

podcast.title        // "My Podcast"
podcast.author       // "John Doe"
podcast.thumbnails   // Thumbnail[]
podcast.episodes     // PodcastEpisode[]

const ep = podcast.episodes[0]
ep.title             // "Episode 42"
ep.url               // direct audio URL — feed to getStream or play directly
ep.duration          // seconds
ep.publishedAt       // ISO 8601 string
ep.season            // number | undefined
ep.episode           // number | undefined
ep.explicit          // boolean
ep.thumbnails        // episode-level art, falls back to feed art
```

---

### Audio Identification

Identify a song from an audio file using [AcoustID](https://acoustid.org) fingerprinting
and optionally [SongRec](https://github.com/marin-m/SongRec) (Shazam-backed).
Requires a free AcoustID API key and `fpcalc` on your PATH.

```ts
const mk = new MusicKit({
  identify: {
    acoustidApiKey: process.env.ACOUSTID_KEY,
    songrecBin: '/usr/bin/songrec',   // optional — adds Shazam recognition
  },
})

const song = await mk.identify('./unknown-track.mp3')
// → Song | null
// SongRec is tried first (faster), then AcoustID fingerprint + lookup.
// On match, searches YouTube Music to return a full Song with videoId.
```

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
```

---

## Configuration

All options are optional. MusicKit works out of the box with zero config.

```ts
const mk = new MusicKit({
  logLevel: 'warn',           // 'debug' | 'info' | 'warn' | 'error' | 'silent'

  // Rate limits (requests per minute per endpoint)
  rateLimit: {
    search:       10,
    browse:       20,
    stream:        5,
    autocomplete: 30,
  },
  minRequestGap: 100,         // ms minimum between any two requests

  // Retry
  maxRetries:  3,
  backoffBase: 1000,          // ms
  backoffMax:  30000,         // ms

  // Production credentials
  youtubeApiKey: process.env.YT_API_KEY,    // YouTube Data API v3 for search
  cookiesPath: process.env.COOKIES_PATH,    // path to cookies.txt for yt-dlp streams

  // SQLite cache
  cache: {
    enabled: true,
    dir: './cache',           // default: OS temp dir
    ttl: {
      stream: 21600,          // 6h (default)
      search:   300,          // 5min (default)
      home:   28800,          // 8h (default)
      artist:  3600,          // 1h (default)
    },
  },

  // Session
  visitorId: 'CgtBQnlV...',  // bring your own
  userAgent: 'Mozilla/5.0 ...',

  // YouTube Music locale
  language: 'hi',             // BCP-47 language code
  location: 'IN',             // ISO 3166-1 alpha-2 country code

  // Audio identification
  identify: {
    acoustidApiKey: process.env.ACOUSTID_KEY,
    songrecBin: '/usr/bin/songrec',
  },
})
```

---

## Custom sources (plugin system)

Implement `AudioSource` to add any platform without touching the core:

```ts
import type { AudioSource, Song, StreamingData, SearchResults } from 'musicstream-sdk'

class MySource implements AudioSource {
  readonly name = 'my-source'

  canHandle(query: string): boolean {
    return query.startsWith('mysrc:')
  }

  async search(query: string, options = {}): Promise<SearchResults> { /* ... */ }
  async getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData> { /* ... */ }
  async getMetadata(id: string): Promise<Song> { /* ... */ }

  // Optional browse methods
  async getAlbum?(id: string): Promise<Album> { /* ... */ }
  async getArtist?(id: string): Promise<Artist> { /* ... */ }
  async getPlaylist?(id: string): Promise<Playlist> { /* ... */ }
  async getRadio?(id: string): Promise<Song[]> { /* ... */ }
  async getHome?(language?: string): Promise<Section[]> { /* ... */ }
}

const mk = new MusicKit()
mk.registerSource(new MySource())
// Sources are tried in registration order — first canHandle() wins.
// Registered sources take priority over the built-in JioSaavn + YouTube pipeline.
```

---

## Exported utilities

```ts
import {
  getBestThumbnail,
  isStreamExpired,
  resolveInput,
  resolveSpotifyUrl,
  SearchFilter,
  MusicKitErrorCode,
  parseLrc,
  getActiveLine,
  getActiveLineIndex,
  formatTimestamp,
  offsetLrc,
  serializeLrc,
} from 'musicstream-sdk'

getBestThumbnail(song.thumbnails, 300)        // → Thumbnail | null — closest to 300px
isStreamExpired(stream)                       // → boolean — true within 5min of expiry
resolveInput('https://youtube.com/watch?v=X') // → videoId string
resolveSpotifyUrl('https://open.spotify.com/track/...') // → "Title Artist" | null

import { version } from 'musicstream-sdk'
console.log(version)   // e.g. "2.0.0" — the package version at runtime

// LRC
parseLrc(rawLrc)                 // → LyricLine[]
getActiveLine(lines, currentSec) // → LyricLine | null
getActiveLineIndex(lines, sec)   // → number (-1 if before first line)
formatTimestamp(42.5)            // → "[00:42.50]"
offsetLrc(lines, 1.0)            // → new LyricLine[] shifted by +1s
serializeLrc(lines)              // → .lrc string

SearchFilter.Songs      // 'songs'
SearchFilter.Albums     // 'albums'
SearchFilter.Artists    // 'artists'
SearchFilter.Playlists  // 'playlists'
```

---

## Validation (Zod)

Every core model has a Zod schema and a `safeParse` helper for validating unknown data at
runtime — useful when consuming external APIs or user input alongside this SDK.

```ts
import {
  ThumbnailSchema,
  SongSchema,
  AlbumSchema,
  ArtistSchema,
  PlaylistSchema,
  safeParseSong,
  safeParseAlbum,
  safeParseArtist,
  safeParsePlaylist,
} from 'musicstream-sdk'

// Throws ZodError if invalid
const song = SongSchema.parse(unknownData)

// Returns Song | null — never throws
const song = safeParseSong(unknownData)
const album = safeParseAlbum(unknownData)
const artist = safeParseArtist(unknownData)
const playlist = safeParsePlaylist(unknownData)
```

---

## Data models

```ts
interface Song {
  type: 'song'
  videoId: string       // opaque — pass back to getStream, getLyrics, getSuggestions, etc.
  title: string
  artist: string
  album?: string
  duration: number      // seconds
  thumbnails: Thumbnail[]
}

interface Album {
  type: 'album'
  browseId: string
  title: string
  artist: string
  year?: string
  thumbnails: Thumbnail[]
  tracks: Song[]        // populated by getAlbum(); empty from search()
}

interface Artist {
  type: 'artist'
  channelId: string
  name: string
  subscribers?: string  // e.g. "10M"
  thumbnails: Thumbnail[]
  songs: Song[]         // populated by getArtist(); empty from search()
  albums: Album[]
  singles: Album[]
}

interface Playlist {
  type: 'playlist'
  playlistId: string
  title: string
  thumbnails: Thumbnail[]
  songs?: Song[]
  songCount?: number
}

interface StreamingData {
  url: string
  codec: 'opus' | 'mp4a'
  bitrate: number       // bps
  expiresAt: number     // Unix timestamp
  loudnessDb?: number   // LUFS
  sizeBytes?: number
}

interface AudioTrack extends Song {
  stream: StreamingData
}

interface Thumbnail {
  url: string
  width: number
  height: number
}

interface Section {
  title: string
  items: (Song | Album | Playlist)[]
}

interface Lyrics {
  plain: string
  synced: LyricLine[] | null   // null when source only has plain text
}

interface LyricLine {
  time: number    // seconds (e.g. 17.73)
  text: string
  words?: LyricWord[]   // present only with enhanced LRC word-level timestamps
}

interface LyricWord {
  time: number
  text: string
}

interface PodcastEpisode {
  type: 'episode'
  guid: string
  title: string
  description: string
  url: string         // direct audio URL
  mimeType: string
  duration: number    // seconds
  publishedAt: string // ISO 8601
  thumbnails: Thumbnail[]
  season?: number
  episode?: number
  explicit: boolean
}

interface Podcast {
  type: 'podcast'
  feedUrl: string
  title: string
  description: string
  author: string
  language: string
  link: string
  thumbnails: Thumbnail[]
  episodes: PodcastEpisode[]
}
```

---

## Error handling

All SDK errors extend `MusicKitBaseError` and carry a `code` string for programmatic
handling. Catch by class or by code:

```ts
import {
  MusicKitBaseError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  StreamError,
  HttpError,
  NonRetryableError,
  MusicKitErrorCode,
} from 'musicstream-sdk'

try {
  await mk.getStream(id)
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log('retry after', err.retryAfterMs, 'ms')
  } else if (err instanceof NetworkError) {
    console.log('http status', err.statusCode, 'cause', err.cause)
  } else if (err instanceof NotFoundError) {
    console.log('not found', err.resourceId)
  } else if (err instanceof StreamError) {
    console.log('stream failed for', err.videoId)
  } else if (err instanceof MusicKitBaseError) {
    console.log('sdk error', err.code)  // MusicKitErrorCode string
  }
}

// Inside a custom RetryEngine / source — stop retrying immediately:
throw new NonRetryableError('bad input, do not retry')

// HttpError — low-level HTTP status + body, used internally, re-exported for custom sources
throw new HttpError(404, 'Not Found')
```

| Class | Code | When thrown |
|---|---|---|
| `NotFoundError` | `NOT_FOUND` | Resource doesn't exist |
| `RateLimitError` | `RATE_LIMITED` | 429 from any source |
| `NetworkError` | `NETWORK_ERROR` | HTTP failure or fetch error |
| `ValidationError` | `VALIDATION_ERROR` | Bad input / missing config |
| `StreamError` | `STREAM_ERROR` | Stream URL resolution failed |
| `HttpError` | — | Raw HTTP error (internal) |
| `NonRetryableError` | — | Forces retry engine to stop immediately |

---

## Stability notice

This SDK uses **unofficial APIs** — JioSaavn's internal `api.php` and YouTube's InnerTube
protocol. Neither has a published SLA. Both can change without notice.

What this means in practice:

- **Stream cipher (YouTube)** — can break when YouTube rotates its player JS. Usually
  fixed in [youtubei.js](https://github.com/LuanRT/YouTube.js) within a few days. Update
  the package to get the fix.
- **JioSaavn endpoints** — have been stable for years but are undocumented. Outages are
  possible.
- **Don't use this** for infrastructure where an hour of downtime is unacceptable.
- **Do use this** for Discord bots, CLI tools, desktop apps, and personal projects.

---

## Requirements

- Node.js 22+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on PATH *(required for stream resolution and `download()`)*
- `fpcalc` on PATH *(required for `identify()` only)*

## License

MIT
