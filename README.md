# musicstream-sdk

Node.js SDK for music search, streaming, browse, lyrics, and download.
Unified API across JioSaavn and YouTube Music — **no API keys required**.

```bash
npm install musicstream-sdk
# or
pnpm add musicstream-sdk
```

> **Requires** [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH for the download fallback.

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

// Lyrics
const lyrics = await mk.getLyrics(songs[0].videoId)

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
const songs    = await mk.search('bohemian rhapsody', { filter: 'songs' })
const albums   = await mk.search('a night at the opera', { filter: 'albums' })
const artists  = await mk.search('queen', { filter: 'artists' })
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

```ts
const lyrics = await mk.getLyrics(songId)  // string | null
// null for YouTube IDs — lyrics API is JioSaavn only.
// Works with platform URLs too:
await mk.getLyrics('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
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
// Home feed — curated sections
const home = await mk.getHome()
const hindiHome = await mk.getHome({ language: 'hindi' })
// Language filtering uses JioSaavn trending + new releases endpoints.
// Supported values: 'hindi', 'english', 'punjabi', 'tamil', 'telugu', etc.

for (const section of home) {
  console.log(section.title)   // "Trending Songs", "New Releases", "Featured Playlists", etc.
  console.log(section.items)   // (Song | Album | Playlist)[]
}

// Featured playlists — curated playlists for a language
const playlists = await mk.getFeaturedPlaylists()
const tamilPlaylists = await mk.getFeaturedPlaylists({ language: 'tamil' })

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
// Note: country option is currently a no-op — youtubei.js getExplore()
// does not support country filtering.
```

---

### Download

```ts
// Requires yt-dlp on PATH
await mk.download(youtubeVideoId, {
  path: './downloads',
  format: 'opus',             // 'opus' | 'mp3' | 'm4a' (default: 'opus')
  quality: 'high',
  onProgress: (pct) => process.stdout.write(`\r${pct.toFixed(0)}%`),
})
// File saved as: <title> (<artist>).opus
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

  // YouTube Music locale (sets hl/gl on the Innertube session)
  language: 'hi',             // BCP-47 language code — affects YT Music search/home language
  location: 'IN',             // ISO 3166-1 alpha-2 country code — affects YT Music charts/charts
  // Note: JioSaavn language is passed per-call (getHome/getFeaturedPlaylists options),
  // not here. Use language/location for YouTube Music locale only.
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
  async getLyrics?(id: string): Promise<string | null> { /* ... */ }
}

const mk = new MusicKit()
mk.registerSource(new MySource())
// Sources are tried in registration order — first canHandle() wins.
// Registered sources take priority over the built-in JioSaavn + YouTube pipeline.
```

---

## Exported utilities

```ts
import { getBestThumbnail, isStreamExpired, SearchFilter, MusicKitErrorCode } from 'musicstream-sdk'

getBestThumbnail(song.thumbnails, 300)  // → Thumbnail | null — closest to 300px
isStreamExpired(stream)                 // → boolean — true within 5min of expiry

SearchFilter.Songs      // 'songs'
SearchFilter.Albums     // 'albums'
SearchFilter.Artists    // 'artists'
SearchFilter.Playlists  // 'playlists'
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
```

---

## Examples

Runnable examples for every feature are in [`examples/`](./examples/):

| File | Covers |
|------|--------|
| [`01-quickstart.ts`](./examples/01-quickstart.ts) | Search + stream in 10 lines |
| [`02-search.ts`](./examples/02-search.ts) | All filters, limit, URL inputs |
| [`03-stream.ts`](./examples/03-stream.ts) | getStream, getTrack, getMetadata, isStreamExpired |
| [`04-browse.ts`](./examples/04-browse.ts) | Home, artist, album, playlist, radio, charts |
| [`05-download.ts`](./examples/05-download.ts) | Audio download with progress |
| [`06-configuration.ts`](./examples/06-configuration.ts) | All config options |
| [`07-events.ts`](./examples/07-events.ts) | Event system |
| [`08-types-reference.ts`](./examples/08-types-reference.ts) | All types with annotations |
| [`09-real-world.ts`](./examples/09-real-world.ts) | CLI player, Discord bot, player UI, infinite queue |
| [`10-autocomplete.ts`](./examples/10-autocomplete.ts) | Autocomplete |
| [`11-advanced-search.ts`](./examples/11-advanced-search.ts) | Pagination, limits, URL inputs |
| [`12-related-and-radio.ts`](./examples/12-related-and-radio.ts) | getSuggestions, getRadio, getRelated |
| [`13-custom-source.ts`](./examples/13-custom-source.ts) | Writing a custom AudioSource plugin |
| [`14-lyrics.ts`](./examples/14-lyrics.ts) | getLyrics, lyrics + metadata together |

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

- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on PATH *(only needed for `download()`)*

## License

MIT
