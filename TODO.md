# musicstream — Roadmap

## Current State
- YouTube Music only (InnerTube API)
- Anti-ban layer: rate limiter, retry engine, SQLite cache, session manager
- Stream resolution: cipher decoding, yt-dlp fallback
- Public API: search, autocomplete, stream, track, home, artist, album, radio, related, charts, download

---

## ✅ Phase 1 — Multi-Source Architecture (Plugin System) — DONE

Refactor `MusicKit` to support pluggable audio sources, like Lavaplayer's source manager pattern.
First match wins, sources tried in order.

- [x] Define `AudioSource` interface
  - `canHandle(query: string): boolean`
  - `search(query: string, options?): Promise<SearchResults | Song[]>`
  - `getStream(id: string, quality): Promise<StreamingData>`
  - `getMetadata(id: string): Promise<Song>`
- [x] Extract current YouTube Music logic into `YouTubeMusicSource` plugin (`src/sources/youtube-music.ts`)
- [x] `MusicKit` iterates registered sources in order — first match wins (`registerSource` + `sourceFor`)
- [x] Keep existing public API unchanged — zero breaking changes
- [x] 175 tests passing (174 pass, 1 pre-existing skip)

---

## ✅ Phase 2 — JioSaavn Source (Primary Stream Source) — DONE

Add JioSaavn as the **first** source in the pipeline. YouTube becomes fallback only.

- [x] Implement `JioSaavnSource` (`src/sources/jiosaavn/`)
  - Hits `jiosaavn.com/api.php` directly (no dependency on jiosaavn-api project)
  - `DefaultJioSaavnClient` — ~20-line fetch wrapper with common params
  - DES-ECB decrypt via `node-forge` (key=`38346591`) — same as jiosaavn-api
  - Search songs by query → maps to unified `Song` model with `jio:` prefixed videoIds
  - Get stream URL up to 320kbps
  - `supportedFilters: ['songs']` — playlist/album/artist searches fall through to YouTube
- [x] Stream pipeline order (auto-registered in `ensureClients()`):
  ```
  1. JioSaavn  → canHandle plain text + jio: IDs (not YouTube URLs/IDs)
  2. YouTube   → catch-all fallback, anti-ban layer activates here
  3. NotFound  → throw
  ```
- [x] Plain text search goes to JioSaavn first
- [x] Playlist/album/artist filter searches skip JioSaavn (via `supportedFilters`), route to YouTube
- [x] All 4 search filter types implemented (songs/albums/artists/playlists — each uses its own JioSaavn endpoint)
- [x] No-filter search uses `autocomplete.get` — returns all types in one call
- [x] `supportedFilters` field removed — JioSaavn handles everything YouTube does for search
- [x] 229 unit tests + 42 live integration tests all passing

---

## ✅ Phase 2.5 — JioSaavn Browse Endpoints — DONE

Add the 5 remaining high-value JioSaavn browse endpoints to the source + SDK public API.

- [x] `content.getAlbumDetails` → `getAlbum('jio:xxx')` routes to JioSaavn; non-jio: IDs fall back to YouTube
- [x] `artist.getArtistPageDetails` → `getArtist('jio:xxx')` routes to JioSaavn; non-jio: IDs fall back to YouTube
- [x] `playlist.getDetails` → new `getPlaylist('jio:xxx')` on MusicKit (no YouTube playlist support yet)
- [x] `webradio.createEntityStation` + `webradio.getSong` → `getRadio('jio:xxx')` routes to JioSaavn; non-jio: IDs fall back to YouTube
- [x] `content.getBrowseModules` → `getHome()` prefers first source with `getHome` (JioSaavn for Bollywood/Indian feed)
- [x] `AudioSource` interface extended with optional browse methods: `getAlbum?`, `getArtist?`, `getPlaylist?`, `getRadio?`, `getHome?`
- [x] `Playlist` model extended with `songs?: Song[]`
- [x] 260 unit tests passing (259 pass, 1 pre-existing skip)

---

## Phase 3 — Metadata Layer (Platform Link Resolution)

When a user passes a platform link, extract metadata then feed into stream pipeline.

- [ ] Spotify metadata source (optional — requires user-provided keys)
  - `clientId` + `clientSecret` in `MusicKit` config
  - Client credentials flow (no user login needed)
  - Extract title + artist → search stream pipeline
  - If no keys provided → skip silently
- [ ] Apple Music metadata source (optional — requires user-provided keys)
  - `developerToken` in `MusicKit` config
  - Extract title + artist → search stream pipeline
  - If no keys provided → skip silently
- [ ] JioSaavn link resolver (`jiosaavn.com/...` URLs)
- [ ] Input detection — identify what kind of input was given:
  ```
  spotify.com/track/...   → Spotify metadata → stream pipeline
  music.apple.com/...     → Apple Music metadata → stream pipeline
  jiosaavn.com/...        → JioSaavn directly
  youtube.com/...         → YouTube directly
  plain text              → stream pipeline (JioSaavn first, YouTube fallback)
  ```

---

## Phase 4 — Metadata Fallback Chain

If primary metadata source doesn't find the song, try the next one.

- [ ] Metadata resolution order:
  ```
  1. JioSaavn   (best for Indian/Bollywood)
  2. Spotify    (best structured metadata globally, if keys provided)
  3. Apple Music (if keys provided)
  4. YouTube Music (last resort, metadata isn't great)
  ```
- [ ] Unified `Song` model regardless of which source provided metadata

---

## Credentials Design

- JioSaavn → zero config, always works
- YouTube Music → zero config, always works
- Spotify → optional, user brings their own keys (free to get)
- Apple Music → optional, user brings their own keys (free dev account)

```ts
const mk = new MusicKit({
  spotify: {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
  },
  appleMusic: {
    developerToken: 'your-token',
  },
})
```

**Never put developer tokens in the npm package.**
SDK users register their own free apps on each platform.

---

## Cost

| Component | Cost |
|---|---|
| JioSaavn API + CDN | Free |
| YouTube Music (InnerTube) | Free |
| Spotify metadata API | Free |
| Apple Music metadata API | Free |
| JioSaavn streams (up to 320kbps) | Free |
| YouTube streams | Free |

Everything is free. Forever.
