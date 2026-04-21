# API Reference

Quick-lookup for every public method on `MusicKit`.
For runnable examples see [`../examples/`](../examples/).

---

## Construction

```ts
const mk = new MusicKit(config?: MusicKitConfig)
const mk = await MusicKit.create(config?: MusicKitConfig)  // eagerly inits InnerTube
```

---

## Methods

### `autocomplete(query)`
```ts
mk.autocomplete(query: string): Promise<string[]>
```
Returns search suggestions. Returns `[]` for `jio:` IDs and non-text inputs.

---

### `search(query, options?)`
```ts
mk.search(query: string, options?: { filter?: SearchFilter; limit?: number })

// Typed overloads
mk.search(query, { filter: 'songs' })     → Promise<Song[]>
mk.search(query, { filter: 'albums' })    → Promise<Album[]>
mk.search(query, { filter: 'artists' })   → Promise<Artist[]>
mk.search(query, { filter: 'playlists' }) → Promise<Playlist[]>
mk.search(query)                          → Promise<SearchResults>
```
Platform URLs are resolved before routing. Results cached (5min default).

---

### `getStream(id, options?)`
```ts
mk.getStream(id: string, options?: { quality?: 'high' | 'low' }): Promise<StreamingData>
```
Resolves a playable audio URL. Cached (~6h). JioSaavn streams re-fetched automatically
when expired. Accepts any song ID or platform URL.

---

### `getTrack(id)`
```ts
mk.getTrack(id: string): Promise<AudioTrack>
```
Metadata + stream URL in one call. Works with any song ID (JioSaavn or YouTube).

---

### `getMetadata(id)`
```ts
mk.getMetadata(id: string): Promise<Song>
```
Song metadata without a stream URL. Routes `jio:` IDs to JioSaavn, YouTube IDs to
DiscoveryClient.

---

### `getLyrics(id)`
```ts
mk.getLyrics(id: string): Promise<string | null>
```
Lyrics text for a song. Returns `null` for YouTube IDs (no lyrics API).
Accepts `jio:` IDs and JioSaavn platform URLs.

---

### `getSuggestions(id)`
```ts
mk.getSuggestions(id: string): Promise<Song[]>
```
"Up next" recommendations. For any ID, looks up the YouTube equivalent via metadata
search and uses YouTube's recommendation engine. Falls back to source-native radio if
YouTube lookup fails. Returns globally-accurate suggestions regardless of source.

---

### `getHome(options?)`
```ts
mk.getHome(options?: { language?: string }): Promise<Section[]>
```
Curated home feed sections. `language` is accepted but currently has no effect —
JioSaavn's `getBrowseModules` endpoint returns the same content regardless of the
value passed. The option is kept for future compatibility.

---

### `getArtist(id)`
```ts
mk.getArtist(id: string): Promise<Artist>
```
Artist page with top songs, albums, and singles. Routes `jio:` IDs to JioSaavn,
others to YouTube Music.

---

### `getAlbum(id)`
```ts
mk.getAlbum(id: string): Promise<Album>
```
Album with full track list. Routes `jio:` IDs to JioSaavn, others to YouTube Music.

---

### `getPlaylist(id)`
```ts
mk.getPlaylist(id: string): Promise<Playlist>
```
Playlist with tracks. Works with JioSaavn playlist IDs (`jio:xxx`) and YouTube
playlist IDs (`PLxxx`).

---

### `getRadio(id)`
```ts
mk.getRadio(id: string): Promise<Song[]>
```
~20 songs in a station seeded from the given song. Routes `jio:` IDs to JioSaavn
entity station, YouTube IDs to YouTube's `getUpNext`.

---

### `getRelated(id)`
```ts
mk.getRelated(id: string): Promise<Song[]>
```
Editorial "you might also like". Routes through DiscoveryClient (YouTube).

---

### `getCharts(options?)`
```ts
mk.getCharts(options?: { country?: string }): Promise<Section[]>
```
Global charts via YouTube Music. `country` is accepted but currently has no effect —
the underlying `getExplore()` in youtubei.js does not support country filtering.
The option is kept for future compatibility.

---

### `download(id, options)`
```ts
mk.download(id: string, options: DownloadOptions): Promise<void>

interface DownloadOptions {
  path: string                        // output directory
  format?: 'opus' | 'mp3' | 'm4a'    // default: 'opus'
  quality?: 'high' | 'low'
  onProgress?: (percent: number) => void
}
```
Downloads audio to disk. Requires `yt-dlp` on PATH. Requires a YouTube video ID
(not `jio:` IDs — download uses yt-dlp which is YouTube-only).

---

### `registerSource(source)`
```ts
mk.registerSource(source: AudioSource): void
```
Register a custom audio source. Registered sources take priority over built-ins.
First `canHandle()` match wins.

---

### `on(event, handler)` / `off(event, handler)`
```ts
mk.on(event: MusicKitEvent, handler: Function): void
mk.off(event: MusicKitEvent, handler: Function): void
```

| Event | Handler signature |
|-------|-------------------|
| `beforeRequest` | `(req: MusicKitRequest) => void` |
| `afterRequest` | `(req, durationMs: number, status: number) => void` |
| `cacheHit` | `(key: string, ttl: number) => void` |
| `cacheMiss` | `(key: string) => void` |
| `rateLimited` | `(endpoint: string, waitMs: number) => void` |
| `retry` | `(endpoint: string, attempt: number, reason: string) => void` |
| `error` | `(err: MusicKitError) => void` |

---

## Exported utilities

### `getBestThumbnail(thumbnails, targetSize)`
```ts
getBestThumbnail(thumbnails: Thumbnail[], targetSize: number): Thumbnail | null
```
Returns the thumbnail whose `width` is closest to `targetSize`.
Falls back to the first thumbnail when all widths are 0.
Returns `null` for an empty array.

---

### `isStreamExpired(stream)`
```ts
isStreamExpired(stream: StreamingData): boolean
```
Returns `true` when `stream.expiresAt` is within 5 minutes of the current time.
Use before reusing a cached stream URL.

---

## URL resolution

All methods that accept an ID also accept a platform URL. Resolution is automatic.

| Input | Resolved to |
|-------|-------------|
| `jiosaavn.com/song/slug/ID` | `jio:ID` |
| `jiosaavn.com/album/slug/ID` | `jio:ID` |
| `jiosaavn.com/artist/slug/ID` | `jio:ID` |
| `jiosaavn.com/featured/slug/ID` | `jio:ID` |
| `youtube.com/watch?v=ID` | `ID` |
| `youtu.be/ID` | `ID` |
| `music.youtube.com/watch?v=ID` | `ID` |
| `music.youtube.com/browse/ID` | `ID` |
| `music.youtube.com/playlist?list=ID` | `ID` |
| `music.youtube.com/search?q=query` | `query` (decoded) |
| Anything else | returned as-is |

---

## AudioSource interface

```ts
interface AudioSource {
  readonly name: string
  canHandle(query: string): boolean
  search(query: string, options?: { filter?: SearchFilter; limit?: number }):
    Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]>
  getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData>
  getMetadata(id: string): Promise<Song>

  // Optional browse methods
  getAlbum?(id: string): Promise<Album>
  getArtist?(id: string): Promise<Artist>
  getPlaylist?(id: string): Promise<Playlist>
  getRadio?(id: string): Promise<Song[]>
  getHome?(language?: string): Promise<Section[]>
  getLyrics?(id: string): Promise<string | null>
}
```
