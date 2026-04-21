# Server TODO — musicstream-sdk 0.3.0 sync

Legend: ✅ done  ❌ missing  🔧 needs fix  ⚠️ SDK-only (no server endpoint needed)

---

## 1. Package

| Task | Status |
|------|--------|
| Update musicstream-sdk 0.2.4 → 0.3.0 | ✅ |

---

## 2. Search & Discovery endpoints

| Endpoint | SDK method | Old | New (0.3.0) | Status |
|----------|-----------|-----|-------------|--------|
| `GET /search?q=&filter=&limit=` | `mk.search()` | had it (no limit) | adds `limit` param | 🔧 add `?limit=` |
| `GET /autocomplete?q=` | `mk.autocomplete()` | ✅ | no change | ✅ |

---

## 3. Stream & Track endpoints

| Endpoint | SDK method | Old | New (0.3.0) | Status |
|----------|-----------|-----|-------------|--------|
| `GET /stream/:videoId?quality=` | `mk.getStream()` | ✅ | no change | ✅ |
| `GET /track/:videoId` | `mk.getTrack()` | ✅ | no change | ✅ |
| `GET /metadata/:videoId` | `mk.getMetadata()` | ❌ | **NEW** | ❌ add |

---

## 4. Lyrics & Suggestions endpoints

| Endpoint | SDK method | Old | New (0.3.0) | Status |
|----------|-----------|-----|-------------|--------|
| `GET /lyrics/:videoId` | `mk.getLyrics()` | ❌ | **NEW** | ❌ add |
| `GET /suggestions/:videoId` | `mk.getSuggestions()` | ❌ | **NEW** | ❌ add |

> `getLyrics` returns `null` for YouTube IDs — JioSaavn only.
> `getSuggestions` works for any ID — uses YouTube's recommendation engine internally.

---

## 5. Browse endpoints

| Endpoint | SDK method | Old | New (0.3.0) | Status |
|----------|-----------|-----|-------------|--------|
| `GET /home?language=` | `mk.getHome()` | had it (no language) | adds `language` param | 🔧 add `?language=` |
| `GET /artist/:channelId` | `mk.getArtist()` | ✅ | no change | ✅ |
| `GET /album/:browseId` | `mk.getAlbum()` | ✅ | no change | ✅ |
| `GET /playlist/:playlistId` | `mk.getPlaylist()` | ❌ | **NEW** | ❌ add |
| `GET /radio/:videoId` | `mk.getRadio()` | ✅ | no change | ✅ |
| `GET /related/:videoId` | `mk.getRelated()` | ✅ | no change | ✅ |
| `GET /charts?country=` | `mk.getCharts()` | ✅ | no change | ✅ |

---

## 6. Download endpoint

| Endpoint | Issue | Status |
|----------|-------|--------|
| `POST /download` | SDK `DownloadFormat = 'opus' \| 'm4a'` only — README mentions `mp3` but type doesn't include it. Keep `opus \| m4a`, fix error message to match | 🔧 |
| `POST /download` | Add `onProgress` support (optional — streams progress back as SSE or ignores it) | ❌ optional |

---

## 7. Docs endpoint (`GET /docs`)

| Issue | Status |
|-------|--------|
| Add new endpoints: `/metadata`, `/lyrics`, `/suggestions`, `/playlist` | ❌ |
| Fix `Section.items` type: `(Song \| Album \| Artist)[]` → `(Song \| Album \| Playlist)[]` | ❌ |
| Add `Playlist` model | ❌ |
| Add `language` to `/home` params | ❌ |
| Add `limit` to `/search` params | ❌ |
| Fix download `format` description: `opus \| mp3 \| m4a` → `opus \| m4a` | ❌ |

---

## 8. Build

| Task | Status |
|------|--------|
| `pnpm build` passes with zero errors | ❌ |

---

## 9. SDK-only features (no server endpoint needed)

| Feature | Notes |
|---------|-------|
| `mk.registerSource(source)` | Plugin system — server doesn't expose this |
| `mk.sources` | Read the source pipeline — internal only |
| `mk.on/off(event, handler)` | Events: `beforeRequest`, `afterRequest`, `cacheHit`, `cacheMiss`, `rateLimited`, `retry`, `error`, `visitorIdRefreshed` (new in 0.3.0) |
| `getBestThumbnail(thumbnails, size)` | Client utility |
| `isStreamExpired(stream)` | Client utility |
| `MusicKitConfig` options | `logLevel`, `rateLimit`, `minRequestGap`, `backoffMax`, `maxRetries`, `visitorId`, `userAgent`, `cache` — configured in `music.service.ts` |

---

## 10. URL resolution (automatic — no server changes needed)

All methods accept platform URLs. The SDK resolves them automatically:

| Input | Resolves to |
|-------|-------------|
| `jiosaavn.com/song/slug/ID` | `jio:ID` |
| `jiosaavn.com/album/slug/ID` | `jio:ID` |
| `jiosaavn.com/artist/slug/ID` | `jio:ID` |
| `youtube.com/watch?v=ID` | `ID` |
| `youtu.be/ID` | `ID` |
| `music.youtube.com/watch?v=ID` | `ID` |
| `music.youtube.com/browse/ID` | `ID` |
| `music.youtube.com/playlist?list=ID` | `ID` |
| `music.youtube.com/search?q=query` | decoded query string |
