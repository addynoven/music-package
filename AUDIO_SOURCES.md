# MusicBot — Audio Source System Deep Dive

## Overview

Audio in this bot is powered by **Lavaplayer** (`dev.arbjerg:lavaplayer:2.2.1`), a Java library that
resolves, downloads (in-memory, streamed), decodes, and re-encodes audio from remote sources into
**Opus frames** that Discord's voice protocol expects. No audio is ever stored to disk — it is all
streamed in real-time.

The entry point for everything audio-related is
[`PlayerManager`](src/main/java/com/jagrosh/jmusicbot/audio/PlayerManager.java), which extends
Lavaplayer's `DefaultAudioPlayerManager` and registers every supported source during `init()`.

---

## How Lavaplayer Source Resolution Works (Internals)

When a user runs `!play <input>`, Lavaplayer calls `loadItemOrdered()`. It iterates through the
registered source managers **in the order they were registered** and asks each one:

> "Can you handle this identifier?"

The first source manager that recognises the identifier wins and handles loading. If none match, the
`noMatches()` callback fires, and the bot retries with `ytsearch:<input>` prefix to fall back to a
YouTube search.

Each source manager does roughly this:

1. **Match** — check if the URL/string belongs to its platform (regex or prefix check)
2. **Resolve** — make HTTP requests to the platform to get the real stream URL (often involves
   scraping, API calls, or token negotiation)
3. **Decode** — demux the container format (e.g., `.webm`, `.mp3`, `.ogg`) and decode the audio
   codec (Opus, AAC, MP3, etc.)
4. **Re-encode to Opus** — Lavaplayer outputs raw Opus frames into a buffer
5. **Send to Discord** — `AudioHandler.provide20MsAudio()` pulls frames from the buffer 50 times
   per second and hands them to JDA, which sends them over UDP to Discord's voice servers

---

## Source Manager Registration Order

The order in [`PlayerManager.init()`](src/main/java/com/jagrosh/jmusicbot/audio/PlayerManager.java#L48)
matters — first match wins.

```
1. TransformativeAudioSourceManager(s)   ← custom regex-based redirects (registered first, highest priority)
2. YoutubeAudioSourceManager             ← YouTube videos, playlists, searches
3. SoundCloudAudioSourceManager          ← SoundCloud tracks and playlists
4. BandcampAudioSourceManager            ← Bandcamp artist/album pages
5. VimeoAudioSourceManager               ← Vimeo videos
6. TwitchStreamAudioSourceManager        ← Twitch live streams
7. BeamAudioSourceManager                ← Mixer/Beam streams (legacy, defunct platform)
8. GetyarnAudioSourceManager             ← Yarn.co audio clips
9. NicoAudioSourceManager                ← Niconico (ニコニコ動画) Japanese video platform
10. HttpAudioSourceManager               ← Any direct audio URL (.mp3, .ogg, .flac, .wav, etc.)
11. Local file source                    ← Files on the machine running the bot
12. DuncteBotSources                     ← Apple Music, Spotify, Google Music, etc. (resolved to YouTube)
```

---

## Each Source in Detail

### 1. YouTube (`YoutubeAudioSourceManager`)

**Library:** `dev.lavalink.youtube:common:1.5.2` (the Lavalink-maintained fork, NOT the old
Lavaplayer built-in one — YouTube broke the original repeatedly)

**What it handles:**
- Single video URLs: `youtube.com/watch?v=...`, `youtu.be/...`
- Playlist URLs: `youtube.com/playlist?list=...`
- Search queries prefixed with `ytsearch:`
- Mix/radio URLs

**How it works:**

YouTube does not have a public streaming API for third-party apps. The source manager:
1. Fetches the video page or the InnerTube API (`/youtubei/v1/player`) using internal client
   credentials (web client, Android client, etc.)
2. Parses the response JSON to extract stream format manifests (DASH or HLS)
3. Picks the best audio-only format (usually `audio/webm; codecs=opus` or `audio/mp4`)
4. Streams the bytes from the CDN (`googlevideo.com`) in chunks
5. Demuxes the WebM/MP4 container and decodes Opus/AAC

**Playlist pages:** Configured in `config.txt`:
```
maxytplaylistpages = 10   # each page = up to 100 tracks → default max 1000 tracks
```
This maps directly to `yt.setPlaylistPageCount(bot.getConfig().getMaxYTPlaylistPages())` at
[`PlayerManager.java:53`](src/main/java/com/jagrosh/jmusicbot/audio/PlayerManager.java#L53).

**Why this is fragile:** YouTube actively tries to block scraping. The source manager requires
periodic updates when YouTube changes its internal API contracts or adds bot detection. This is why
the project switched from Lavaplayer's built-in YouTube support to the Lavalink community fork.

---

### 2. SoundCloud (`SoundCloudAudioSourceManager`)

**What it handles:**
- Track URLs: `soundcloud.com/artist/track`
- Playlist/set URLs: `soundcloud.com/artist/sets/name`
- SoundCloud searches via `scsearch:` prefix (used by the `!scsearch` command)

**How it works:**
1. Uses SoundCloud's public API with a client ID (fetched dynamically by scraping the SoundCloud
   web app's JavaScript bundle to find the embedded client ID)
2. Resolves the track URL to a stream URL via `/resolve` API endpoint
3. Fetches the HLS (`.m3u8`) or progressive MP3 stream
4. Decodes and streams MP3 audio

**Created via:** `SoundCloudAudioSourceManager.createDefault()` — uses the default client ID
discovery mechanism.

---

### 3. Bandcamp (`BandcampAudioSourceManager`)

**What it handles:**
- Individual track pages: `artist.bandcamp.com/track/name`
- Album pages: `artist.bandcamp.com/album/name`

**How it works:**
1. Fetches the HTML page of the track/album
2. Parses the embedded `data-tralbum` JSON blob in the page source
3. Extracts the `mp3-128` stream URL (free tier) or higher quality if available
4. Streams MP3 directly

No authentication required — Bandcamp embeds stream URLs directly in the page HTML.

---

### 4. Vimeo (`VimeoAudioSourceManager`)

**What it handles:**
- Vimeo video URLs: `vimeo.com/123456789`

**How it works:**
1. Fetches the video page HTML
2. Parses the Vimeo player config JSON embedded in the page
3. Extracts the HLS or progressive MP4 stream URL
4. Streams and extracts audio from the video container (AAC audio track from MP4)

---

### 5. Twitch (`TwitchStreamAudioSourceManager`)

**What it handles:**
- Live channel streams: `twitch.tv/channelname`

**How it works:**
1. Calls Twitch's API to get an access token for the stream
2. Fetches the master HLS playlist (`m3u8`) from Twitch's CDN
3. Selects an audio-only or lowest-quality stream variant
4. Continuously fetches new HLS segments as they appear (live stream = infinite segments)
5. Decodes AAC audio from the TS (MPEG transport stream) segments

This is different from on-demand sources — the stream is infinite and segments are fetched in a
polling loop.

---

### 6. Beam/Mixer (`BeamAudioSourceManager`)

**Status: Dead.** Microsoft shut down Mixer in July 2020. This source manager is registered but
will never successfully load anything. It remains in the codebase as legacy code.

---

### 7. Getyarn (`GetyarnAudioSourceManager`)

**What it handles:**
- Yarn.co clip URLs: `getyarn.io/yarn-clip/...`

**How it works:**
Fetches the page, extracts the direct video/audio URL, streams the media.

---

### 8. Niconico (`NicoAudioSourceManager`)

**What it handles:**
- Niconico video URLs: `nicovideo.jp/watch/sm...`

**How it works:**
1. Requires a Niconico account (credentials configured separately) since most content is behind
   login
2. Authenticates with the Niconico API
3. Fetches the video's HLS stream or FLV/MP4 download URL
4. Streams and decodes audio

---

### 9. HTTP Direct (`HttpAudioSourceManager`)

**What it handles:**
- Any direct URL ending in a supported audio/video container:
  `.mp3`, `.ogg`, `.flac`, `.wav`, `.aac`, `.m4a`, `.webm`, `.mp4`, `.m3u8` (HLS), etc.
- Uses `MediaContainerRegistry.DEFAULT_REGISTRY` which covers all formats Lavaplayer supports

**How it works:**
1. Makes a HEAD or GET request to the URL
2. Inspects the `Content-Type` header and/or file extension
3. Picks the appropriate container demuxer from the registry
4. Streams and decodes directly

**Examples of valid inputs:**
```
https://example.com/song.mp3
https://some-radio-station.com/stream.m3u8
https://cdn.example.com/audio.ogg
```

This is the most generic fallback for any internet-accessible audio file.

---

### 10. Local Files

**Registered via:** `AudioSourceManagers.registerLocalSource(this)`

**What it handles:**
- Absolute or relative file paths on the machine running the bot
- Same container formats as the HTTP source

**Use case:** Bot owner puts audio files on the server, references them in local playlist `.txt`
files. Regular users cannot load local files via commands — they would need to know the server's
file paths.

---

### 11. DuncteBot Sources (`DuncteBotSources.registerAll`)

**Library:** `com.dunctebot:sourcemanagers:1.9.0`

**Registered with:** `DuncteBotSources.registerAll(this, "en-US")`

**What it handles:**
- **Spotify** — track, album, playlist, podcast URLs
- **Apple Music** — track, album, playlist URLs
- **Google Music** (defunct)
- Potentially others depending on the library version

**Critical detail — these do NOT stream from Spotify/Apple Music directly.**

Spotify and Apple Music use DRM-protected streams that cannot be decoded without licensed SDKs.
Instead, DuncteBot sources work as **metadata resolvers**:

1. Receive a Spotify/Apple Music URL
2. Fetch the track metadata (title, artist) from the platform's public API
3. Construct a YouTube search query: `ytsearch:Artist - Track Title`
4. Hand that query back to Lavaplayer, which routes it to `YoutubeAudioSourceManager`
5. The audio actually plays from YouTube

This means:
- Spotify/Apple Music links work, but you're hearing the YouTube version of the song
- Playlist loading works (all tracks get individually searched on YouTube)
- Obscure tracks with no YouTube equivalent will fail to load
- Audio quality and exact version may differ from the original

---

## TransformativeAudioSourceManager — Custom URL Redirects

**File:** [`TransformativeAudioSourceManager.java`](src/main/java/com/jagrosh/jmusicbot/audio/TransformativeAudioSourceManager.java)

This is a power-user feature that lets the bot owner define custom source rules in `config.txt`.
Each transform is a named rule that:

1. **Matches** an identifier against a regex pattern
2. **Transforms** the URL using a regex replacement
3. **Fetches** the transformed URL with jsoup (HTML scraper)
4. **Extracts** a value from the page using a CSS selector
5. **Formats** the extracted value into a search query
6. **Passes** the result to the YouTube source manager

### Class Internals

```java
public class TransformativeAudioSourceManager extends YoutubeAudioSourceManager {
    private final String name, regex, replacement, selector, format;

    @Override
    public AudioItem loadItem(AudioPlayerManager apm, AudioReference ar) {
        if (ar.identifier == null || !ar.identifier.matches(regex))
            return null; // not our URL, skip

        String url = ar.identifier.replaceAll(regex, replacement); // transform URL
        Document doc = Jsoup.connect(url).get();                   // fetch HTML
        String value = doc.selectFirst(selector).ownText();        // extract via CSS selector
        String formattedValue = String.format(format, value);      // format into query/URL
        return super.loadItem(apm, new AudioReference(formattedValue, null)); // pass to YouTube
    }
}
```

### Config Format

```hocon
transforms {
  myCustomSource {
    regex       = "https://mysite\\.com/song/.*"
    replacement = "https://mysite.com/api/song-info/$1"
    selector    = "h1.song-title"
    format      = "ytsearch:%s"
  }
}
```

### Registration Priority

Transforms are registered **first** (before YouTube, SoundCloud, etc.), meaning they intercept
matching URLs before any built-in source manager sees them. This allows:
- Whitelisting only certain URL patterns
- Blocking specific domains (return null for everything → bot refuses to play it)
- Routing a custom website's links through YouTube search

### Warning

The config itself warns this feature is complex and may be removed. Use only if you understand the
regex and jsoup selector mechanics.

---

## The Full Request Lifecycle

When a user types `!play some input`:

```
User: !play https://youtube.com/watch?v=abc123
         │
         ▼
   PlayCmd.doCommand()
         │
         │  event.getArgs() = "https://youtube.com/watch?v=abc123"
         ▼
   bot.getPlayerManager()
      .loadItemOrdered(guild, "https://youtube.com/watch?v=abc123", resultHandler)
         │
         │  Lavaplayer iterates source managers in order:
         │
         ├─ TransformativeAudioSourceManager → regex doesn't match → null → skip
         ├─ YoutubeAudioSourceManager → "youtube.com/watch" → MATCH ✓
         │       │
         │       │  1. Fetch InnerTube API /youtubei/v1/player
         │       │  2. Parse stream formats JSON
         │       │  3. Select best audio-only format (opus/webm)
         │       │  4. Return AudioTrack with stream URL
         │       ▼
         │  resultHandler.trackLoaded(track)
         │       │
         │       │  Check: isTooLong(track)? → if yes, reject with message
         │       │  handler.addTrack(new QueuedTrack(track, requestMetadata))
         │       │  Edit Discord message: "Added [title] to queue at position N"
         │       ▼
         │  AudioHandler.addTrack()
         │       │
         │       │  If player is idle: player.playTrack(track) immediately
         │       │  Else: queue.add(new QueuedTrack(...))
         │       ▼
         │  AudioPlayer (Lavaplayer internal)
         │       │
         │       │  Streams audio bytes from CDN in background thread
         │       │  Decodes to raw PCM
         │       │  Re-encodes to Opus frames (20ms each)
         │       │  Fills frame buffer
         │       ▼
         │  AudioHandler.provide20MsAudio()  ← called 50x/sec by JDA
         │       │
         │       │  Pulls next Opus frame from buffer
         │       ▼
         │  JDA sends Opus frame over UDP to Discord voice server
         │       │
         ▼  User hears audio in voice channel
```

### No-Match Fallback (YouTube Search)

If the input is a plain text search (not a URL) and no source manager matches:

```
resultHandler.noMatches()
    │
    │  ytsearch == false → retry with prefix
    ▼
bot.getPlayerManager()
   .loadItemOrdered(guild, "ytsearch:some input", new ResultHandler(..., ytsearch=true))
    │
    ▼
YoutubeAudioSourceManager handles "ytsearch:" prefix
    │  → calls YouTube search API
    │  → returns AudioPlaylist (search result set, isSearchResult=true)
    ▼
resultHandler.playlistLoaded(playlist)
    │  playlist.isSearchResult() == true
    │  → take first result: playlist.getTracks().get(0)
    ▼
loadSingle(firstResult, null)
```

If `ytsearch` retry also returns no matches → user sees: `"No results found for ..."`

---

## Local Playlist Files

**File:** [`PlaylistLoader.java`](src/main/java/com/jagrosh/jmusicbot/playlist/PlaylistLoader.java)

Playlists are plain `.txt` files stored in the `Playlists/` folder (configurable via `playlistsfolder`
in `config.txt`).

### File Format

```
# This is a comment and is ignored
// This is also a comment

#shuffle         ← special directive: randomise order before loading

https://youtube.com/watch?v=abc
https://soundcloud.com/artist/track
Never Gonna Give You Up       ← plain text → treated as YouTube search
https://example.com/song.mp3  ← direct audio URL
```

Rules:
- Lines starting with `#` or `//` are comments, ignored completely
- The special `#shuffle` or `//shuffle` comment (case-insensitive, whitespace stripped) sets a
  shuffle flag — all tracks are randomised after loading
- Every other non-empty line is a track item (URL or search query)

### Loading Flow

`PlaylistLoader.Playlist.loadTracks()` iterates every item and calls
`manager.loadItemOrdered(playlistName, item, handler)`. The `playlistName` string is used as the
**ordering key** — Lavaplayer uses this to serialise loads so playlist items queue in order instead
of racing each other asynchronously.

Each item goes through the full source resolution pipeline described above. Results:
- `trackLoaded` → check duration, add to tracks list, call consumer (adds to AudioHandler queue)
- `playlistLoaded` (search result) → take first result, treat as single track
- `playlistLoaded` (actual playlist) → add all tracks (optionally shuffled)
- `noMatches` → log to `PlaylistLoadError` list
- `loadFailed` → log to `PlaylistLoadError` list with reason

After the **last item** finishes loading (synchronised via `last` boolean flag):
1. If shuffle was set, shuffle the final `tracks` list again
2. Fire the `callback` runnable → bot edits the Discord message with final count + any errors

---

## Configuration Reference (Audio-Related)

All settings live in `config.txt`, with defaults from
[`reference.conf`](src/main/resources/reference.conf).

| Setting | Default | Effect |
|---|---|---|
| `maxtime` | `0` | Max track duration in seconds. `0` = no limit. Applies to every source. |
| `maxytplaylistpages` | `10` | Max YouTube playlist pages to load. Each page = up to 100 tracks. |
| `transforms` | `{}` | Custom `TransformativeAudioSourceManager` rules (see above). |
| `playlistsfolder` | `"Playlists"` | Directory for local `.txt` playlist files. |
| `stayinchannel` | `false` | Keep bot in voice channel after queue empties. |
| `npimages` | `false` | Show YouTube thumbnail images in now-playing embeds. |
| `lyrics.default` | `"A-Z Lyrics"` | Lyrics provider for `!lyrics` command. |

---

## Key Dependencies

| Library | Version | Role |
|---|---|---|
| `dev.arbjerg:lavaplayer` | `2.2.1` | Core audio engine — all source loading, decoding, encoding |
| `dev.lavalink.youtube:common` | `1.5.2` | YouTube source manager (community fork, actively maintained) |
| `com.dunctebot:sourcemanagers` | `1.9.0` | Spotify, Apple Music metadata resolution → YouTube search |
| `org.jsoup:jsoup` | `1.15.3` | HTML parsing used by `TransformativeAudioSourceManager` |

Maven repositories required (not on Maven Central):
- `https://m2.dv8tion.net/releases` — JDA
- `https://maven.lavalink.dev/releases` — YouTube source manager
- `https://m2.duncte123.dev/releases` — DuncteBot sources

---

## What Actually Produces the Audio Bytes

To be completely clear about where the audio data physically comes from:

| Source | Audio comes from |
|---|---|
| YouTube | Google's CDN (`googlevideo.com`) — streamed directly |
| SoundCloud | SoundCloud's CDN — HLS or progressive MP3 |
| Bandcamp | Bandcamp's CDN — MP3 |
| Vimeo | Vimeo's CDN — HLS/MP4 |
| Twitch | Twitch/Akamai CDN — live HLS segments, continuously fetched |
| HTTP | Whatever server hosts the file |
| Local | Disk on the machine running the bot |
| Spotify links | YouTube CDN (metadata resolved, then searched on YT) |
| Apple Music links | YouTube CDN (same as Spotify) |

**Nothing is stored.** All audio is streamed in real-time, decoded in-memory, and forwarded as
Opus packets to Discord's UDP voice endpoint. The moment a track ends or is skipped, the bytes
are discarded.
