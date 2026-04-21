# JioSaavn API — Endpoint Reference

All calls hit `https://www.jiosaavn.com/api.php` with common params:
`_format=json&_marker=0&api_version=4&ctx=web6dot0`

---

## Search

| Endpoint | `__call` | Key Params | Returns |
|---|---|---|---|
| Search all types | `autocomplete.get` | `query` | songs + albums + artists + playlists in one shot |
| Search songs | `search.getResults` | `q`, `p` (page), `n` (limit) | `{ total, start, results: Song[] }` |
| Search albums | `search.getAlbumResults` | `q`, `p`, `n` | `{ total, start, results: Album[] }` |
| Search artists | `search.getArtistResults` | `q`, `p`, `n` | `{ total, start, results: Artist[] }` |
| Search playlists | `search.getPlaylistResults` | `q`, `p`, `n` | `{ total, start, results: Playlist[] }` |

---

## Songs

| Endpoint | `__call` | Key Params | Returns |
|---|---|---|---|
| Get song by ID(s) | `song.getDetails` | `pids` (comma-separated IDs) | `{ songs: Song[] }` |
| Get song by link | `webapi.get` | `token` (extracted from URL), `type=song` | `Song` |
| Get song suggestions | `webradio.getSong` | `stationid`, `k` (limit) | `Song[]` — needs station created first |
| Create radio station | `webradio.createEntityStation` | `entity_id`, `entity_type=queue` | `{ stationid }` — prerequisite for suggestions |
| Get lyrics | `lyrics.getLyrics` | `lyrics_id` | Lyrics text |

---

## Albums

| Endpoint | `__call` | Key Params | Returns |
|---|---|---|---|
| Get album by ID | `content.getAlbumDetails` | `albumid` | Full album with all tracks + metadata |
| Get album by link | `webapi.get` | `token`, `type=album` | Same as above |

---

## Artists

| Endpoint | `__call` | Key Params | Returns |
|---|---|---|---|
| Get artist page | `artist.getArtistPageDetails` | `artistId`, `n_song`, `n_album`, `page`, `sort_order`, `category` | Full artist with topSongs, topAlbums, singles, similarArtists |
| Get artist by link | `webapi.get` | `token`, `type=artist` | Same as above |
| Get more artist songs | `artist.getArtistMoreSong` | `artistId`, `page`, `category`, `sort_order` | Paginated `{ songs: Song[] }` |
| Get more artist albums | `artist.getArtistMoreAlbum` | `artistId`, `page`, `category`, `sort_order` | Paginated `{ albums: Album[] }` |

---

## Playlists

| Endpoint | `__call` | Key Params | Returns |
|---|---|---|---|
| Get playlist by ID | `playlist.getDetails` | `playlistid`, `p` (page), `n` (limit) | Full playlist with paginated songs |
| Get playlist by link | `webapi.get` | `token`, `type=playlist` | Same as above |

---

## Browse / Home

| Endpoint | `__call` | Key Params | Returns |
|---|---|---|---|
| Browse modules (home feed) | `content.getBrowseModules` | `language` | Trending, new releases, charts per language |
| Trending | `content.getTrending` | `entity_type`, `entity_language` | Trending songs/albums |

---

## Song Response Shape (key fields)

```
id                string   — JioSaavn song ID (use as jio:{id})
title             string   — song name
more_info
  duration        string   — seconds as string, parse to int
  encrypted_media_url  string  — DES-ECB encrypted, key="38346591"
  artistMap
    primary_artists  Artist[]
    featured_artists Artist[]
  album           string   — album name
image             string   — CDN image URL (150x150), swap to get 50/500
```

---

## Useful for musicstream SDK

### Implemented ✅  (11 / 16 total endpoints)
- `search.getResults` — song search (filter: 'songs')
- `search.getAlbumResults` — album search (filter: 'albums')
- `search.getArtistResults` — artist search (filter: 'artists')
- `search.getPlaylistResults` — playlist search (filter: 'playlists')
- `autocomplete.get` — no-filter search, all types in one call
- `song.getDetails` — getStream + getMetadata
- `content.getAlbumDetails` — getAlbum() via JioSaavn (richer metadata for Indian music)
- `artist.getArtistPageDetails` — getArtist() via JioSaavn
- `playlist.getDetails` — getPlaylist() via JioSaavn
- `webradio.createEntityStation` + `webradio.getSong` — getRadio() via JioSaavn (2 calls)
- `content.getBrowseModules` — getHome() via JioSaavn (Bollywood/regional home feed)

### Not yet implemented — high value 💡  (0 endpoints)
All high-value endpoints are now implemented.

### Probably not needed ❌  (5 endpoints)
- `lyrics.getLyrics` — out of scope for an audio SDK
- `webapi.get` (by link) — Phase 3 handles link resolution separately
- `artist.getArtistMoreSong` — pagination edge case, low priority
- `artist.getArtistMoreAlbum` — pagination edge case, low priority
- `content.getTrending` — covered by getHome() sections already
