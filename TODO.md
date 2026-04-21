# musicstream — Roadmap

## Current State

Two-source SDK: JioSaavn (primary) + YouTube Music (fallback).
Anti-ban layer: rate limiter, retry engine, SQLite cache, session manager.
Stream resolution: JioSaavn DES-ECB decrypt, YouTube cipher decoding, yt-dlp fallback.

Public API: `search` · `autocomplete` · `getStream` · `getTrack` · `getMetadata` · `getHome` ·
`getArtist` · `getAlbum` · `getPlaylist` · `getRadio` · `getRelated` · `getSuggestions` ·
`getLyrics` · `getCharts` · `download`

Utilities exported: `getBestThumbnail` · `isStreamExpired`

---

## ✅ Phase 1 — Multi-Source Architecture — DONE

- [x] `AudioSource` interface with `canHandle`, `search`, `getStream`, `getMetadata`
- [x] `YouTubeMusicSource` extracted into plugin
- [x] `MusicKit` iterates registered sources — first match wins
- [x] Zero breaking changes to existing public API

---

## ✅ Phase 2 — JioSaavn Source (Primary Stream Source) — DONE

- [x] `JioSaavnSource` + `DefaultJioSaavnClient` — direct `jiosaavn.com/api.php` calls
- [x] DES-ECB stream URL decryption (node-forge, key `38346591`)
- [x] `jio:` prefixed IDs for all JioSaavn entities
- [x] All 4 search filters (songs / albums / artists / playlists)
- [x] No-filter search via `autocomplete.get` — all types in one call
- [x] Pipeline order: JioSaavn first → YouTube fallback → throw

---

## ✅ Phase 2.5 — JioSaavn Browse Endpoints — DONE

- [x] `getAlbum` · `getArtist` · `getPlaylist` · `getRadio` · `getHome` on JioSaavnSource
- [x] `AudioSource` interface extended with optional browse methods
- [x] `Playlist` model extended with `songs?: Song[]`

---

## ✅ Phase 3 — Platform Link Resolution — DONE

- [x] JioSaavn URL resolver (`jiosaavn.com/song/...` → `jio:ID`)
- [x] YouTube URL resolver (`youtube.com/watch?v=ID`, `youtu.be/ID` → bare ID)
- [x] YouTube Music URL resolver (`music.youtube.com/watch`, `/browse`, `/playlist`, `/search`)
- [x] `resolveInput(url)` — single entry point for all URL normalisation
- [x] All public MusicKit methods call `resolveInput` before routing
- [ ] Spotify metadata source — deferred (requires user keys, not core)
- [ ] Apple Music metadata source — deferred (requires user keys, not core)

---

## ✅ Phase 5 — Core UX Improvements — DONE

### Thumbnails
- [x] Fix JioSaavn thumbnail dimensions — parse `150x150` pattern from URL
- [x] `getBestThumbnail(thumbnails, targetSize)` — exported utility

### Lyrics
- [x] `getLyrics(id)` — JioSaavn `lyrics.getLyrics` endpoint, `null` for YouTube

### Metadata & Track
- [x] `getMetadata(id)` — public API, routes `jio:` to JioSaavn, YouTube to DiscoveryClient
- [x] `getTrack()` — fixed for `jio:` IDs (was YouTube-only, now routes correctly)

### Stream
- [x] `isStreamExpired(stream)` — exported utility, 5-minute safety buffer
- [x] Auto-refresh — JioSaavn streams now cached with expiry check

### Search
- [x] `search(query, { filter, limit })` — limit option flows to all sources
- [x] Autocomplete routing — `jio:` inputs return `[]`, URLs resolved before lookup

### Suggestions (up next)
- [x] `getSuggestions(id)` — YouTube-first: looks up YouTube ID via metadata search,
      uses `getRelated` for globally-aware suggestions; falls back to JioSaavn radio

### Browse
- [x] YouTube playlist support in `getPlaylist()` — non-`jio:` IDs route to DiscoveryClient
- [x] `getHome({ language })` — JioSaavn language param exposed on public API

---

## Future Work

### Optional Platform Enrichment (Phase 4)

When users supply their own API keys, enrich metadata from Spotify or Apple Music.
Core streaming (JioSaavn + YouTube) works without any keys.

```ts
const mk = new MusicKit({
  spotify: { clientId: '...', clientSecret: '...' },
  appleMusic: { developerToken: '...' },
})
```

- [ ] Spotify metadata source — extract title/artist, feed into stream pipeline
- [ ] Apple Music metadata source — same

### Minor Polish

- [ ] Artist top tracks pagination — `getArtist` hardcoded at `n_song=10, n_album=10`
- [ ] JioSaavn playlist pagination — `getPlaylist` hardcoded at page 0, limit 20

---

## Cost

| Component | Cost |
|---|---|
| JioSaavn API + CDN streams (up to 320kbps) | Free |
| YouTube Music (InnerTube) | Free |
| Spotify metadata API | Free (free dev account) |
| Apple Music metadata API | Free (free dev account) |

Everything is free. The optional Spotify/Apple Music integrations only need a free developer account.
