# Music Sourcing Pipeline — How Harmony Music Gets & Plays Audio

This document explains the entire music sourcing pipeline: how Harmony Music
discovers, resolves, streams, caches, and downloads music.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [YouTube InnerTube API (Discovery Layer)](#2-youtube-innertube-api-discovery-layer)
3. [Search & Browse](#3-search--browse)
4. [Stream URL Resolution](#4-stream-url-resolution)
5. [URL Resolution Priority (checkNGetUrl)](#5-url-resolution-priority-checkngeturl)
6. [Audio Playback](#6-audio-playback)
7. [Caching Strategy](#7-caching-strategy)
8. [Downloading](#8-downloading)
9. [Piped Integration](#9-piped-integration)
10. [Data Models](#10-data-models)
11. [Key Files Reference](#11-key-files-reference)

---

## 1. High-Level Overview

```
User action (search / browse / tap song)
        │
        ▼
┌─────────────────────────┐
│  YouTube InnerTube API   │  ← Discovery: search, browse, home, charts
│  (music_service.dart)    │     Uses WEB_REMIX client via Dio HTTP
└───────────┬─────────────┘
            │ Returns song metadata (videoId, title, artist, thumbnail)
            ▼
┌─────────────────────────┐
│  Stream URL Resolution   │  ← Converts videoId → playable audio URL
│  (stream_service.dart)   │     Uses youtube_explode_dart library
└───────────┬─────────────┘
            │ Returns Audio objects with direct stream URLs
            ▼
┌─────────────────────────┐
│  Audio Playback          │  ← Plays the resolved URL
│  (audio_handler.dart)    │     Uses just_audio + audio_service
└───────────┬─────────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
  Streaming    Cache-as-you-play
  (direct)     (LockCachingAudioSource)
```

Two separate systems handle two separate concerns:
- **InnerTube API** → metadata, search, browsing (what songs exist)
- **youtube_explode_dart** → stream extraction (how to actually play them)

---

## 2. YouTube InnerTube API (Discovery Layer)

**File:** `lib/services/music_service.dart`

The app talks to YouTube Music's **InnerTube API** — the same internal API that
the YouTube Music web app uses. This is NOT the official YouTube Data API v3.

### Configuration

```
Domain:    https://music.youtube.com/
Base URL:  https://music.youtube.com/youtubei/v1/
API Key:   AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30  (public, embedded in YT web client)
```

**File:** `lib/services/constant.dart`

### Client Identity

Every request includes a client context pretending to be the YouTube Music
web app:

```dart
{
  "context": {
    "client": {
      "clientName": "WEB_REMIX",           // YouTube Music web client
      "clientVersion": "1.YYYYMMDD.01.00"  // dynamically generated
    }
  }
}
```

### Request Headers

```
user-agent:       Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
content-type:     application/json
content-encoding: gzip
origin:           https://music.youtube.com/
cookie:           CONSENT=YES+1
X-Goog-Visitor-Id: <generated or cached>
```

### Visitor ID

YouTube requires a visitor ID for personalized results. The app:

1. Checks Hive `AppPrefs` box for a cached visitor ID
2. If missing/expired (30-day TTL), fetches `https://music.youtube.com/`
3. Parses the HTML with regex: `ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;`
4. Extracts `VISITOR_DATA` from the ytcfg JSON
5. Falls back to a hardcoded ID if all else fails

### InnerTube Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `browse` | Home feed, artist pages, album pages, charts, playlists |
| `search` | Search for songs, albums, artists, playlists |
| `next` | "Watch next" / related songs, radio queues |
| `player` | Player info (used indirectly via youtube_explode) |
| `music/get_search_suggestions` | Live search suggestions |

All requests go through `_sendRequest()` which POSTs to:
```
https://music.youtube.com/youtubei/v1/{endpoint}?prettyPrint=false&alt=json&key=...
```

---

## 3. Search & Browse

### Search Flow

```
User types query
    │
    ▼
getSearchSuggestion(query)  →  /music/get_search_suggestions
    │                           Returns live autocomplete suggestions
    ▼
User submits search
    │
    ▼
search(query, filter)  →  /search
    │                      filter = songs|videos|albums|artists|playlists|...
    ▼
parseSearchResults()   →  Converts nested JSON into MediaItem/Album/Artist objects
```

### Browse Flow (Home, Artist, Album, Playlist)

```
getHome()       →  browseId: "FEmusic_home"      →  Home feed sections
getArtist()     →  browseId: channelId            →  Artist page
getAlbum()      →  browseId: albumId              →  Album tracks
getPlaylist()   →  browseId: playlistId           →  Playlist tracks
getCharts()     →  browseId: "FEmusic_charts"     →  Trending charts
```

All browse calls use the `/browse` endpoint with different `browseId` values.

### Response Parsing

**File:** `lib/services/nav_parser.dart`

YouTube's API returns deeply nested JSON. The app navigates it using path
constants and a `nav()` helper function:

```dart
// Example path constants:
const single_column_tab = ['contents', 'singleColumnBrowseResultsRenderer',
                           'tabs', 0, 'tabRenderer', 'content'];
const section_list = ['sectionListRenderer', 'contents'];
const navigation_browse = ['navigationEndpoint', 'browseEndpoint'];
```

Key parsing functions:
- `parseSong()` — Single song from any renderer
- `parseAlbum()` — Album with metadata
- `parseArtist()` — Artist info
- `parsePlaylist()` — Playlist with song count
- `parseMixedContent()` — Home screen carousels (mixed types)
- `parseSongRuns()` — Extract artist/album from subtitle "runs"
- `parseWatchPlaylist()` — Queue/radio items

### Pagination (Continuations)

**File:** `lib/services/continuations.dart`

YouTube paginates results using continuation tokens. When a response has more
items, it includes a `continuations` array with a token. The app:

1. Extracts the `ctoken` from the response
2. Appends `&ctoken=X&continuation=X` to the next request
3. Parses `continuationContents` from the follow-up response
4. Repeats until the limit is reached or no more tokens exist

---

## 4. Stream URL Resolution

**File:** `lib/services/stream_service.dart`

This is the critical step: converting a YouTube video ID into a **playable
audio stream URL**.

### How It Works

```dart
// The core call:
final yt = YoutubeExplode();
final manifest = await yt.videos.streamsClient.getManifest(videoId);
final audioStreams = manifest.audioOnly;
```

The app uses `youtube_explode_dart` (a Dart port of YoutubeExplode) which:

1. Fetches the video's player page
2. Extracts the adaptive stream manifest
3. Deciphers signature-protected URLs (handles YouTube's obfuscation)
4. Returns a list of available audio-only streams

### Audio Format Selection (itags)

Each audio stream has an `itag` (format identifier):

| itag | Codec | Quality | Typical Bitrate |
|------|-------|---------|-----------------|
| 251  | Opus  | High    | ~160 kbps       |
| 250  | Opus  | Medium  | ~70 kbps        |
| 249  | Opus  | Low     | ~50 kbps        |
| 140  | MP4A  | High    | ~128 kbps       |
| 139  | MP4A  | Low     | ~48 kbps        |

### Quality Getters on StreamProvider

```dart
highestQualityAudio     → itag 251 or 140  (best available)
highestBitrateOpusAudio → itag 251 or 250  (best Opus)
highestBitrateMp4aAudio → itag 140 or 139  (best MP4A)
lowQualityAudio         → itag 249 or 139  (lowest available)
```

### What Gets Cached

The `StreamProvider` produces an `hmStreamingData` map with:
```json
{
  "playable": true,
  "statusMSG": "OK",
  "lowQualityAudio":  { "itag": 249, "url": "...", "bitrate": ..., ... },
  "highQualityAudio": { "itag": 251, "url": "...", "bitrate": ..., ... }
}
```

This is stored in Hive's `SongsUrlCache` box (keyed by videoId).

### Error Cases

| Exception | Meaning |
|-----------|---------|
| `VideoUnavailableException` | Video doesn't exist or was removed |
| `VideoUnplayableException` | Geo-restricted, age-gated, etc. |
| `VideoRequiresPurchaseException` | Premium/paid content |
| `SocketException` | No network connection |

---

## 5. URL Resolution Priority (checkNGetUrl)

**File:** `lib/services/audio_handler.dart` (line ~776)

When the app needs to play a song, `checkNGetUrl(songId)` resolves the URL
using a **priority cascade**:

```
1. SongsCache box (previously streamed & cached to disk)
   │  → Uses local file: file://<cacheDir>/cachedSongs/<songId>.mp3
   │
   ▼ (miss)
2. SongDownloads box (user explicitly downloaded this song)
   │  → Uses the downloaded file path
   │  → If file missing from disk, falls through to online
   │
   ▼ (miss)
3. SongsUrlCache box (cached stream URL from previous play)
   │  → Checks if URL is expired (YouTube URLs expire ~6 hours)
   │  → If valid, reuses the cached URL
   │
   ▼ (miss or expired)
4. Fresh fetch via StreamProvider.fetch(songId)
   │  → Runs in a separate Isolate for performance
   │  → Caches the result in SongsUrlCache
   │
   ▼
Return HMStreamingData with resolved audio URL
```

### URL Expiration Check

YouTube stream URLs contain an `expire` parameter (Unix timestamp). The app
checks this before reusing cached URLs:

```dart
isExpired(url: cachedUrl)  // parses the expire param from the URL
```

---

## 6. Audio Playback

**File:** `lib/services/audio_handler.dart`

### Libraries

- **`just_audio`** (v0.9.46) — The actual audio player engine
- **`audio_service`** (v0.18.17) — Background playback, notification controls,
  lock screen controls, Android Auto, MPRIS (Linux)
- **`just_audio_media_kit`** — Media playback support for Windows/Linux

### Player Configuration

```dart
AudioPlayer(
  audioLoadConfiguration: AudioLoadConfiguration(
    androidLoadControl: AndroidLoadControl(
      minBufferDuration: Duration(seconds: 50),
      maxBufferDuration: Duration(seconds: 120),
      bufferForPlaybackDuration: Duration(milliseconds: 50),
      bufferForPlaybackAfterRebufferDuration: Duration(seconds: 2),
    )
  )
)
```

### Two Playback Modes

**1. Direct streaming (default):**
```dart
AudioSource.uri(Uri.parse(streamUrl))
```
Streams audio directly from YouTube's servers. No local storage.

**2. Cache-as-you-play (when caching enabled in settings):**
```dart
LockCachingAudioSource(
  Uri.parse(url),
  cacheFile: File("$cacheDir/cachedSongs/$songId.mp3"),
)
```
Streams AND saves to disk simultaneously. Next play uses the local file.

### Queue Management

- `ConcatenatingAudioSource` — just_audio's playlist type
- Shuffle maintains a separate `shuffledQueue` list of song IDs
- Loop modes: Off / Single song / Entire queue
- Session persistence: queue, position, and index saved to Hive on pause/close

### Audio Features

- **Skip silence** — `_player.setSkipSilenceEnabled(true/false)`
- **Loudness normalization** — LUFS-based volume adjustment (Android only)
- **Equalizer** — System equalizer integration
- **Quality toggle** — `streamingQuality` setting (0=low, 1=high) selects
  which `Audio` object from `HMStreamingData` to use

---

## 7. Caching Strategy

### Hive Database Boxes

| Box | Key | Stores | TTL |
|-----|-----|--------|-----|
| `SongsUrlCache` | videoId | `HMStreamingData` JSON (stream URLs) | ~6 hours (YouTube URL expiry) |
| `SongsCache` | videoId | Song metadata + stream info (for cached-to-disk songs) | Until cache cleared |
| `SongDownloads` | videoId | Song metadata + local file path | Permanent |
| `homeScreenData` | various | Home screen sections | 8 hours |
| `AppPrefs` | various | Settings, visitor ID, language | Varies |
| `searchQuery` | index | Recent search queries | Manual clear |
| `prevSessionData` | queue/position | Last playback session for restore | Until next session |

### Cache Flow

```
Song played for first time
    │
    ├─ Stream URL cached in SongsUrlCache (reusable for ~6 hours)
    │
    └─ If cache-as-you-play enabled:
         └─ Audio file saved to <tempDir>/cachedSongs/<videoId>.mp3
            └─ Metadata saved in SongsCache box
               └─ Next play → instant local playback (no network)
```

---

## 8. Downloading

**File:** `lib/services/downloader.dart`

### Download Flow

```
User taps download
    │
    ▼
Check storage permissions & download directory
    │
    ▼
Add to songQueue (or playlistQueue for bulk)
    │
    ▼
triggerDownloadingJob()  ← processes queue sequentially
    │
    ▼
For each song:
    │
    ├─ Skip if already in SongDownloads box
    │
    ├─ StreamProvider.fetch(songId)  ← get fresh stream URL
    │
    ├─ Select format based on user preference:
    │     "opus" → highestBitrateOpusAudio (itag 251/250)
    │     "m4a"  → highestBitrateMp4aAudio (itag 140/139)
    │
    ├─ Dio.download(url, filePath)  ← stream to file with progress
    │
    ├─ Write audio tags (title, artist, album, cover art) via audiotags
    │
    └─ Save to SongDownloads Hive box
```

### File Naming

```
<downloadDir>/<title> (<artist>).<opus|m4a>
```
Invalid filesystem characters are stripped via regex.

### Playlist Download

- Downloads all songs sequentially
- Tracks per-song and per-playlist progress via GetX observables
- Can be cancelled mid-download (removes from queue)

---

## 9. Piped Integration

**File:** `lib/services/piped_service.dart`

[Piped](https://github.com/TeamPiped/Piped) is a privacy-friendly YouTube
frontend. Harmony Music integrates with it for **playlist management only**
(not for stream resolution).

### What Piped Is Used For

- Login to a Piped instance (username/password → auth token)
- Fetch user's Piped playlists
- Create / rename / delete playlists
- Add / remove songs from playlists
- Fetch public playlist contents

### What Piped Is NOT Used For

- Stream URL resolution (always uses youtube_explode_dart)
- Search (always uses InnerTube API)
- Browsing (always uses InnerTube API)

### Piped Configuration

Stored in Hive `AppPrefs`:
```dart
{
  "isLoggedIn": bool,
  "token": "auth-token-string",
  "instApiUrl": "https://pipedapi.example.com"
}
```

Instance discovery uses: `https://piped-instances.kavin.rocks`

---

## 10. Data Models

### MediaItem (Song)

**File:** `lib/models/media_Item_builder.dart`

Built on top of `audio_service`'s `MediaItem`:

```dart
MediaItem(
  id: "dQw4w9WgXcQ",              // YouTube video ID
  title: "Never Gonna Give You Up",
  album: "Whenever You Need Somebody",
  artist: "Rick Astley",
  duration: Duration(minutes: 3, seconds: 33),
  artUri: Uri.parse("https://...thumbnail..."),
  extras: {
    'url': "https://...stream-url...",
    'length': "3:33",
    'album': {'id': 'browseId', 'name': 'Album Name'},
    'artists': [{'name': 'Artist', 'id': 'channelId'}],
    'date': timestamp,
    'trackDetails': "1/12",
    'year': "1987"
  }
)
```

### HMStreamingData

**File:** `lib/models/hm_streaming_data.dart`

Wraps the resolved stream info:

```dart
HMStreamingData(
  playable: true,
  statusMSG: "OK",
  lowQualityAudio: Audio(...),   // itag 249 or 139
  highQualityAudio: Audio(...),  // itag 251 or 140
  qualityIndex: 1,               // 0=low, 1=high
)

// The getter used by the player:
Audio? get audio => qualityIndex == 0 ? lowQualityAudio : highQualityAudio;
```

### Audio

**File:** `lib/services/stream_service.dart`

```dart
Audio(
  itag: 251,
  audioCodec: Codec.opus,
  bitrate: 160000,
  duration: 213000,        // milliseconds
  loudnessDb: -7.2,        // LUFS
  url: "https://...",      // direct stream URL
  size: 3456789,           // total bytes
)
```

### Album / Artist / Playlist

**Files:** `lib/models/album.dart`, `lib/models/artist.dart`, `lib/models/playlist.dart`

Standard data classes with `browseId` (YouTube's internal ID for browse
navigation), title, thumbnail URL, and type-specific fields (year, subscribers,
song count, etc.).

---

## 11. Key Files Reference

| File | Purpose |
|------|---------|
| `lib/services/constant.dart` | API domain, base URL, API key, user agent |
| `lib/services/music_service.dart` | InnerTube API client (search, browse, home, charts) |
| `lib/services/stream_service.dart` | Stream URL resolution via youtube_explode_dart |
| `lib/services/audio_handler.dart` | Audio playback, queue management, URL caching logic |
| `lib/services/nav_parser.dart` | JSON response parsing helpers and path constants |
| `lib/services/continuations.dart` | Pagination/continuation token handling |
| `lib/services/piped_service.dart` | Piped instance integration (playlists only) |
| `lib/services/downloader.dart` | Song/playlist download manager |
| `lib/services/background_task.dart` | Background stream fetching (Isolate) |
| `lib/models/hm_streaming_data.dart` | Stream data wrapper model |
| `lib/models/media_Item_builder.dart` | Song/MediaItem builder |
| `lib/models/album.dart` | Album model |
| `lib/models/artist.dart` | Artist model |
| `lib/models/playlist.dart` | Playlist model |

---

## Summary

The app has a clean two-layer architecture for music sourcing:

1. **Discovery** (InnerTube API via `music_service.dart`) — finds songs,
   returns metadata with video IDs
2. **Resolution** (youtube_explode_dart via `stream_service.dart`) — turns
   video IDs into playable audio URLs

Everything else — caching, downloading, playback — builds on top of these
two layers. Piped is a supplementary integration for playlist sync, not a
core music source.
