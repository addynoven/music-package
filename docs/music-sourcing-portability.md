# Music Sourcing Portability — Cross-Language & Cross-Platform Guide

The music sourcing pipeline used by Harmony Music is **not tied to Dart or
Flutter**. Every layer is built on language-agnostic protocols (HTTP + JSON)
and well-understood reverse-engineering techniques that the open-source
community has implemented across virtually every language.

This document maps what Harmony Music does to equivalent tools in other
ecosystems, so you can rebuild the same pipeline anywhere.

---

## Table of Contents

1. [Why It's Portable](#1-why-its-portable)
2. [Layer 1: Discovery (InnerTube API)](#2-layer-1-discovery-innertube-api)
3. [Layer 2: Stream URL Resolution](#3-layer-2-stream-url-resolution)
4. [Layer 3: Audio Playback](#4-layer-3-audio-playback)
5. [Layer 4: Caching & Storage](#5-layer-4-caching--storage)
6. [Layer 5: Piped (Privacy Frontend)](#6-layer-5-piped-privacy-frontend)
7. [Full Stack Examples](#7-full-stack-examples)
8. [The Fragile Part: What Can Break](#8-the-fragile-part-what-can-break)
9. [Community Projects Worth Studying](#9-community-projects-worth-studying)

---

## 1. Why It's Portable

The entire pipeline boils down to:

1. **Send HTTP requests** to YouTube's internal API → get song metadata
2. **Extract audio stream URLs** from YouTube's player page → get playable links
3. **Play or download** the audio from those URLs

None of these steps require Dart, Flutter, or any specific runtime. They
require an HTTP client, a JSON parser, and knowledge of YouTube's internal
protocols — all of which the open-source community has documented and
implemented in every major language.

---

## 2. Layer 1: Discovery (InnerTube API)

**What Harmony Music does:** POSTs JSON to `https://music.youtube.com/youtubei/v1/`
with a `WEB_REMIX` client context to search, browse, and fetch content.

**What you need in any language:** An HTTP client that can send POST requests
with custom headers and JSON bodies.

### Existing Libraries

| Language | Library | Notes |
|----------|---------|-------|
| **Python** | [ytmusicapi](https://github.com/sigma67/ytmusicapi) | The gold standard. Harmony Music's `music_service.dart` is heavily based on this. Excellent docs. |
| **JavaScript** | [node-ytmusic-api](https://github.com/zS1L3NT/ts-npm-ytmusic-api) | TypeScript YouTube Music API wrapper |
| **JavaScript** | [ytmusic](https://github.com/nickp10/youtube-music-ts-api) | Another TS implementation |
| **Go** | [ytmusic](https://github.com/raitonoberu/ytmusic) | Go wrapper for YouTube Music API |
| **Rust** | [ytmusicapi-rs](https://github.com/nick42d/youtui) | Part of the youtui TUI project |

### Or Just Do It Yourself

The InnerTube API is just HTTP. Here's the pattern in any language:

```
POST https://music.youtube.com/youtubei/v1/search?prettyPrint=false&alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30

Headers:
  User-Agent: Mozilla/5.0 ...
  Content-Type: application/json
  Origin: https://music.youtube.com/
  Cookie: CONSENT=YES+1
  X-Goog-Visitor-Id: <your visitor id>

Body:
{
  "context": {
    "client": {
      "clientName": "WEB_REMIX",
      "clientVersion": "1.20260409.01.00"
    }
  },
  "query": "your search query"
}
```

That's it. Any language with `curl`, `requests`, `fetch`, or `http.Client`
can do this.

---

## 3. Layer 2: Stream URL Resolution

**What Harmony Music does:** Uses `youtube_explode_dart` to extract audio-only
stream URLs from a YouTube video ID.

**What you need:** A library that can fetch YouTube's player page, extract the
adaptive stream manifest, and decipher signature-protected URLs.

### The Big Players

| Language | Library | Maintenance | Notes |
|----------|---------|-------------|-------|
| **Python** | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Very active, fast updates | The king. Supports 1000+ sites. Best maintained against YouTube changes. |
| **Python** | [pytube](https://github.com/pytube/pytube) | Moderate | Lighter weight, YouTube-only |
| **JavaScript** | [ytdl-core](https://github.com/fent/node-ytdl-core) | Community forks active | The Node.js standard. Use `@distube/ytdl-core` fork for latest fixes. |
| **JavaScript** | [cobalt](https://github.com/imputnet/cobalt) | Very active | Full-featured media downloader with API |
| **.NET / C#** | [YoutubeExplode](https://github.com/Tyrrrz/YoutubeExplode) | Active | The original that `youtube_explode_dart` was ported from |
| **Dart** | [youtube_explode_dart](https://github.com/Hexer10/youtube_explode_dart) | Moderate | Port of YoutubeExplode, used by Harmony Music |
| **Go** | [youtube](https://github.com/kkdai/youtube) | Active | Clean Go implementation |
| **Rust** | [rusty_ytdl](https://github.com/Mithronn/rusty_ytdl) | Active | Rust port inspired by ytdl-core |
| **Ruby** | [yt-dlp wrapper](https://github.com/many gems) | Via yt-dlp | Most Ruby projects shell out to yt-dlp |
| **Java/Kotlin** | [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) | Very active | Powers the NewPipe Android app |
| **Swift** | [YouTubeKit](https://github.com/nicklama/YouTubeKit) | Moderate | Swift implementation |

### How They All Work (Same Core Technique)

Every one of these libraries does roughly the same thing:

```
1. GET https://www.youtube.com/watch?v={videoId}
       or
   POST https://www.youtube.com/youtubei/v1/player  (InnerTube player endpoint)

2. Extract the player.js URL from the page

3. Download player.js, find the signature decipher function

4. Parse the streaming data (adaptiveFormats array)

5. For each stream:
   - If signatureCipher present → decipher the URL
   - If url present directly → use as-is

6. Filter for audio-only streams (mimeType starts with "audio/")

7. Return list of playable URLs with metadata (itag, bitrate, codec, etc.)
```

The reason multiple libraries exist per language is that YouTube frequently
changes step 3 (the cipher), so active maintenance matters.

### The yt-dlp Escape Hatch

If you don't want to deal with cipher breakage, you can always shell out to
`yt-dlp` from any language:

```bash
# Get best audio URL
yt-dlp -f bestaudio --get-url "https://youtube.com/watch?v=VIDEO_ID"

# Get JSON metadata with stream URLs
yt-dlp -j "https://youtube.com/watch?v=VIDEO_ID"

# Download best audio directly
yt-dlp -x --audio-format opus "https://youtube.com/watch?v=VIDEO_ID"
```

This works from Python, Node, Go, Rust, C — anything that can run a subprocess.
It's the most battle-tested option since `yt-dlp` has the fastest response
time to YouTube changes (usually fixed within hours).

---

## 4. Layer 3: Audio Playback

**What Harmony Music uses:** `just_audio` (Flutter) + `audio_service` (background playback)

### Equivalents by Platform

| Platform | Library | Features |
|----------|---------|----------|
| **Web (Browser)** | HTML5 `<audio>` element | Built-in, zero deps |
| **Web (Browser)** | [Howler.js](https://github.com/goldfire/howler.js) | Web Audio API wrapper, cross-browser |
| **Web (Browser)** | [Tone.js](https://github.com/Tonejs/Tone.js) | Advanced audio processing |
| **Node.js** | [node-speaker](https://github.com/TooTallNate/node-speaker) | Raw PCM output |
| **Python** | [python-vlc](https://github.com/oaubert/python-vlc) | VLC bindings, plays anything |
| **Python** | [mpv](https://github.com/jaseg/python-mpv) | mpv bindings, excellent streaming |
| **Python** | [pygame.mixer](https://www.pygame.org/) | Simple audio playback |
| **Go** | [Beep](https://github.com/gopxl/beep) | Pure Go audio |
| **Rust** | [rodio](https://github.com/RustAudio/rodio) | Pure Rust audio playback |
| **Rust** | [Symphonia](https://github.com/pdeljanov/Symphonia) | Pure Rust audio decoding |
| **C/C++** | [libmpv](https://github.com/mpv-player/mpv) | Embeddable mpv player |
| **C/C++** | [GStreamer](https://gstreamer.freedesktop.org/) | Full multimedia framework |
| **C/C++** | [FFmpeg/libav](https://ffmpeg.org/) | The universal codec Swiss army knife |
| **Android (Kotlin)** | [ExoPlayer/Media3](https://github.com/google/ExoPlayer) | Google's official Android player |
| **iOS (Swift)** | AVFoundation | Apple's native framework |
| **Electron** | Chromium `<audio>` | Built-in |
| **Cross-platform** | [mpv](https://mpv.io/) | CLI or embeddable, plays everything |

---

## 5. Layer 4: Caching & Storage

**What Harmony Music uses:** Hive (Dart key-value store)

### Equivalents

| Use Case | Options (Any Language) |
|----------|----------------------|
| Key-value cache | SQLite, LevelDB, RocksDB, Redis, LMDB |
| Simple config | JSON files, TOML, YAML |
| Browser storage | localStorage, IndexedDB |
| In-memory cache | HashMap/Dictionary with TTL logic |
| Structured data | SQLite (universally available) |

The caching pattern is simple:
- Key: YouTube video ID
- Value: stream URL + metadata + expiry timestamp
- Eviction: check YouTube's `expire` param (~6 hours)

This is a ~20 line implementation in any language.

---

## 6. Layer 5: Piped (Privacy Frontend)

**What Harmony Music uses:** Piped REST API for playlist management

[Piped](https://github.com/TeamPiped/Piped) exposes a clean REST API that
works from any HTTP client:

```
GET  /playlists/{playlistId}     → fetch playlist
POST /user/playlists/create      → create playlist
POST /user/playlists/add         → add video to playlist
POST /user/playlists/remove      → remove video
GET  /search?q={query}&filter=all → search
GET  /streams/{videoId}          → get stream info (alternative to youtube_explode!)
```

Piped can actually replace BOTH the InnerTube API and stream resolution:
- `GET /streams/{videoId}` returns playable audio URLs directly
- `GET /search?q=...` returns search results

The trade-off: you depend on a Piped instance's availability and rate limits
instead of hitting YouTube directly.

### Piped Instance Discovery

```
GET https://piped-instances.kavin.rocks
```

Returns a JSON list of public Piped instances with their API URLs.

---

## 7. Full Stack Examples

Here's what a complete music sourcing stack looks like in different ecosystems:

### Python Backend

```
Discovery:    ytmusicapi
Resolution:   yt-dlp (or pytube)
Playback:     python-mpv (or stream to frontend)
Cache:        SQLite + diskcache
```

### Node.js / TypeScript

```
Discovery:    node-ytmusic-api (or raw InnerTube calls)
Resolution:   @distube/ytdl-core
Playback:     HTML5 <audio> (web) or node-speaker (CLI)
Cache:        better-sqlite3 + node-cache
```

### Go

```
Discovery:    raitonoberu/ytmusic
Resolution:   kkdai/youtube
Playback:     gopxl/beep (or mpv subprocess)
Cache:        bbolt (embedded key-value store)
```

### Rust

```
Discovery:    Raw InnerTube HTTP calls via reqwest
Resolution:   rusty_ytdl
Playback:     rodio + symphonia
Cache:        sled or redb
```

### Android (Kotlin) — See NewPipe

```
Discovery:    NewPipeExtractor (custom InnerTube implementation)
Resolution:   NewPipeExtractor (built-in stream extraction)
Playback:     ExoPlayer / Media3
Cache:        Room database
```

### Electron / Desktop Web App

```
Discovery:    Raw InnerTube fetch() calls
Resolution:   @distube/ytdl-core (in main process)
Playback:     Chromium <audio> element
Cache:        electron-store or IndexedDB
```

---

## 8. The Fragile Part: What Can Break

The portability is excellent. The **fragility** is the real concern, and it's
the same regardless of language:

### YouTube's Cipher Changes

YouTube periodically changes the JavaScript signature decipher function in
`player.js`. When this happens, **all** stream extraction libraries break
until they're updated.

**Response times by library (typical):**

| Library | Fix turnaround |
|---------|---------------|
| yt-dlp (Python) | Hours to 1-2 days |
| NewPipeExtractor (Java) | 1-3 days |
| YoutubeExplode (.NET) | Days to weeks |
| ytdl-core (Node) | Days to weeks (use @distube fork) |
| youtube_explode_dart | Weeks to months |
| rusty_ytdl (Rust) | Days to weeks |

### InnerTube API Changes

YouTube occasionally changes:
- Response JSON structure (breaks parsing)
- Required headers or authentication
- Rate limiting thresholds
- Client version requirements

`ytmusicapi` (Python) tracks these changes most actively since it has the
largest contributor base for YouTube Music specifically.

### Mitigation Strategies

1. **Use yt-dlp as a subprocess** — fastest to get fixes, works from any language
2. **Use Piped as a fallback** — if direct extraction breaks, Piped instances
   may still work (they update independently)
3. **Pin library versions** and update deliberately after testing
4. **Cache aggressively** — fewer requests = less exposure to breakage
5. **Watch the GitHub issues** of your chosen library

---

## 9. Community Projects Worth Studying

These open-source music apps implement the same pipeline in different languages.
Great for learning how others solved the same problems:

| Project | Language/Platform | What to Study |
|---------|------------------|---------------|
| [NewPipe](https://github.com/TeamNewPipe/NewPipe) | Kotlin/Android | NewPipeExtractor is the most complete Java/Kotlin implementation |
| [Invidious](https://github.com/iv-org/invidious) | Crystal | Alternative YouTube frontend with its own extraction |
| [Piped](https://github.com/TeamPiped/Piped) | Java (backend) + Vue (frontend) | Clean REST API design, uses NewPipeExtractor |
| [ViMusic](https://github.com/vfsfitvnm/ViMusic) | Kotlin/Android | UI inspiration for Harmony Music, Innertube + Piped |
| [SpotiFlyer](https://github.com/AdraxVermillion/SpotiFlyer) | Kotlin Multiplatform | Cross-platform music downloader |
| [youtube-music](https://github.com/th-ch/youtube-music) | Electron/TypeScript | Desktop YouTube Music client |
| [mps-youtube](https://github.com/mps-youtube/mps-youtube) | Python | Terminal-based YouTube player |
| [cobalt](https://github.com/imputnet/cobalt) | JavaScript | Modern media downloader with clean architecture |
| [Musify](https://github.com/gokadzev/Musify) | Dart/Flutter | Similar to Harmony Music, active development |
| [BlackHole](https://github.com/Sangwan5688/BlackHole) | Dart/Flutter | Another Flutter music app, different API approach |
| [youtui](https://github.com/nick42d/youtui) | Rust | TUI YouTube Music client with Rust ytmusicapi |

---

## Summary

The music sourcing pipeline is **fully portable**. The community has built
and maintained implementations in Python, JavaScript, Go, Rust, Kotlin, C#,
Swift, Crystal, and more. The core techniques (InnerTube API calls + stream
cipher extraction) are language-agnostic — they're just HTTP and JavaScript
parsing.

The real constraint isn't the language — it's **maintenance against YouTube's
changes**. Pick libraries with active communities, or use `yt-dlp` as your
extraction backend and focus your own code on the user experience.
