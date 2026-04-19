# Music SDK Design Brainstorm

Design notes for building a developer-friendly SDK that wraps YouTube Music
sourcing (search, autocomplete, recommendations, stream resolution) into an
easy-to-import package for Python and Node.js projects.

---

## Table of Contents

1. [The Idea](#1-the-idea)
2. [Design Decisions](#2-design-decisions)
3. [Anti-Ban Architecture](#3-anti-ban-architecture)
4. [What Harmony Music Does to Avoid Bans](#4-what-harmony-music-does-to-avoid-bans)
5. [Why Single-User Makes This Simpler](#5-why-single-user-makes-this-simpler)
6. [API Design: Layered Depth](#6-api-design-layered-depth)
7. [Anti-Ban Config: Transparent & Overridable](#7-anti-ban-config-transparent--overridable)
8. [Language Strategy: Python & Node.js](#8-language-strategy-python--nodejs)
9. [Foundation Libraries Comparison](#9-foundation-libraries-comparison)
10. [Build Approach Options Evaluated](#10-build-approach-options-evaluated)
11. [Recommended Architecture](#11-recommended-architecture)
12. [RAM & Resource Budget](#12-ram--resource-budget)
13. [Decision Log](#13-decision-log)

---

## 1. The Idea

Build an SDK that developers can import into their Python or Node.js projects
to get YouTube Music functionality without dealing with:

- InnerTube API complexity
- Stream URL deciphering
- Anti-ban/anti-detection logic
- Session management
- Cache management
- YouTube's constantly changing internals

The developer should be able to:

```python
# Python — this is the dream API
from musickit import MusicKit

mk = MusicKit()

# Autocomplete
suggestions = mk.autocomplete("never gonna")
# → ["never gonna give you up", "never gonna let you down", ...]

# Search
results = mk.search("never gonna give you up")
# → [Song(title="Never Gonna Give You Up", artist="Rick Astley", videoId="dQw4w9WgXcQ", ...)]

# Get stream URL
stream = mk.get_stream("dQw4w9WgXcQ")
# → Stream(url="https://rr5---.googlevideo.com/...", codec="opus", bitrate=160000, expires_in=21600)

# Browse
home = mk.get_home()
artist = mk.get_artist("UC-9-kyTW8ZkZNDHQJ6FgpwQ")
album = mk.get_album("MPREb_...")
```

All anti-ban logic, session management, caching, and retry handling happens
automatically under the hood.

---

## 2. Design Decisions

### Target Use Case: Single-User Applications

The SDK targets single-user apps:
- CLI tools
- Desktop applications
- Discord/Telegram bots
- Personal automation scripts
- Learning projects

NOT designed for:
- Multi-user API servers
- High-concurrency backends
- Commercial streaming services

This decision dramatically simplifies the anti-ban architecture. One user,
one session, human-paced requests — looks identical to someone using YouTube
Music in a browser.

### API Depth: Layered

Each function returns what makes sense for that specific operation:

| Function | Returns |
|----------|---------|
| `autocomplete(query)` | List of strings |
| `search(query)` | Song/Album/Artist objects with metadata + videoId |
| `get_stream(videoId)` | Stream URL + codec + bitrate + expiry |
| `get_home()` | Sections with mixed content |
| `get_artist(id)` | Artist page with songs, albums, singles |
| `get_album(id)` | Album tracks with metadata |
| `get_lyrics(videoId)` | Synced or plain lyrics |
| `download(videoId, path)` | Downloads audio file to disk |

The developer chooses their depth:
- Just want autocomplete strings? One function, no stream resolution.
- Want to build a full player? Use `get_stream()` and feed it to your audio library.
- Want offline support? Use `download()`.

No function forces you through the full pipeline.

### Anti-Ban: Transparent Defaults, Fully Overridable

The SDK auto-handles all anti-detection out of the box, logs what it's doing
so the developer can see the protection layer at work, and allows overriding
any part of the configuration.

---

## 3. Anti-Ban Architecture

### What the SDK Must Handle Automatically

#### Session Identity (Mimicking a Real Browser)

Every request must look like it comes from the YouTube Music web app:

```
Headers:
  User-Agent:        Chrome on Windows (full realistic string)
  Origin:            https://music.youtube.com/
  Cookie:            CONSENT=YES+1
  Content-Type:      application/json
  Content-Encoding:  gzip
  X-Goog-Visitor-Id: <managed automatically>

Client Context:
  clientName:    "WEB_REMIX"
  clientVersion: "1.YYYYMMDD.01.00"  (dynamically generated)

Playback Context:
  signatureTimestamp: <yesterday's datestamp>
```

#### Visitor ID Lifecycle

The Visitor ID is a session identifier that YouTube uses to track "users":

```
First launch:
  1. GET https://music.youtube.com/
  2. Parse HTML for ytcfg.set({...})
  3. Extract VISITOR_DATA via regex
  4. Cache for 30 days
  5. Send as X-Goog-Visitor-Id on all subsequent requests

On expiry:
  6. Regenerate transparently
  7. Log: "Visitor ID expired, generating new one"

On failure:
  8. Fall back to hardcoded known-good ID
  9. Log warning: "Using fallback visitor ID"
```

#### Rate Limiting

For single-user, the natural pace of human interaction is usually enough.
But the SDK should still enforce sensible minimums:

```
Default rate limits:
  Search:           Max 10 requests/minute
  Browse:           Max 20 requests/minute
  Stream resolution: Max 5 requests/minute (most expensive)
  Autocomplete:     Max 30 requests/minute (lightweight)

Between requests:   Minimum 100ms gap (prevents burst patterns)
After errors:       Exponential backoff (1s, 2s, 4s, 8s, max 60s)
```

These should be overridable:

```python
mk = MusicKit(
    rate_limit={"search": 20, "stream": 10},
    min_request_gap=0.05,  # 50ms
)
```

#### Caching

Cache aggressively to minimize requests:

```
Stream URLs:     Cache by videoId, TTL = expire param (~6 hours)
                 Check expiry before reuse (with 30-min buffer)
Search results:  Cache by query+filter, TTL = 5 minutes
Home feed:       Cache, TTL = 8 hours
Artist pages:    Cache by channelId, TTL = 1 hour
Visitor ID:      Cache, TTL = 30 days
player.js URL:   Cache until it changes
Decipher ops:    Cache until player.js URL changes
```

#### Retry Logic

```
On non-200 response:  Retry up to 3 times with exponential backoff
On network error:     Retry up to 3 times, then raise exception
On cipher failure:    Update yt-dlp/ytdl-core, retry once
On 429 (rate limit):  Back off 60 seconds, retry
On 403 (forbidden):   Regenerate visitor ID, retry once
```

#### What NOT to Do (Overkill for Single-User)

- Proxy rotation (not needed — one IP is fine)
- Multiple visitor ID pools (one session is enough)
- CAPTCHA solving (YouTube doesn't CAPTCHA normal usage patterns)
- Fingerprint randomization (one consistent browser identity is better)
- Request jittering (human pace is naturally jittered)

---

## 4. What Harmony Music Does to Avoid Bans

Studied from the Harmony Music codebase for reference:

| Technique | Implementation | File |
|-----------|---------------|------|
| Browser impersonation | Full Chrome UA, WEB_REMIX client, proper headers | `music_service.dart` |
| Visitor ID management | Generated from YouTube page, cached 30 days, fallback ID | `music_service.dart` |
| Signature timestamp | `getDatestamp() - 1` sent in playbackContext | `music_service.dart` |
| URL caching | Stream URLs cached in Hive, checked against expire param | `audio_handler.dart` |
| Expiry buffer | `isExpired()` adds 1800s (30 min) buffer before marking expired | `utils.dart` |
| Audio file caching | LockCachingAudioSource saves to disk while streaming | `audio_handler.dart` |
| Housekeeping | Purges expired URLs from cache on app start | `house_keeping.dart` |
| Isolate extraction | Stream fetching runs in separate isolate | `background_task.dart` |
| Infinite retry | `_sendRequest` recursively retries on non-200 | `music_service.dart` |
| CONSENT cookie | `CONSENT=YES+1` bypasses cookie consent banner | `music_service.dart` |

What Harmony Music does NOT do (and gets away with it because single-user):
- No rate limiting between requests
- No random delays
- No proxy rotation
- No CAPTCHA handling
- No request jittering

---

## 5. Why Single-User Makes This Simpler

A single-user client app generates traffic that looks identical to someone
using YouTube Music in a browser:

```
Real YouTube Music user:          Your SDK user:
─────────────────────────         ──────────────────
Opens app                         Imports library
Sees home feed (1 request)        mk.get_home() (1 request)
Types search (3-5 suggestions)    mk.autocomplete() (3-5 requests)
Views results (1 request)         mk.search() (1 request)
Plays song (1 stream resolve)     mk.get_stream() (1 stream resolve)
Plays next song (1 resolve)       mk.get_stream() (1 resolve)
...                               ...
```

Same headers, same client context, same visitor ID pattern, same request
frequency. YouTube's bot detection targets bulk scrapers doing thousands of
requests per minute from data center IPs — not this.

---

## 6. API Design: Layered Depth

### Level 1: Text Only (Autocomplete)

```python
suggestions = mk.autocomplete("bohemian")
# → ["bohemian rhapsody", "bohemian rhapsody lyrics", ...]
# Returns: list[str]
# Anti-ban cost: 1 lightweight request
```

### Level 2: Metadata (Search, Browse)

```python
results = mk.search("bohemian rhapsody", filter="songs")
# → [Song(
#      title="Bohemian Rhapsody",
#      artist="Queen",
#      album="A Night at the Opera",
#      video_id="fJ9rUzIMcZQ",
#      duration=354,
#      thumbnail="https://...",
#    )]
# Returns: list[Song | Album | Artist | Playlist]
# Anti-ban cost: 1 request + potential continuations

home = mk.get_home()
# → [Section(title="Quick picks", items=[Song, Song, ...]),
#    Section(title="Trending", items=[Song, ...])]

artist = mk.get_artist("UCiMhD4jzUqG-IgPzUmmytRQ")
# → Artist(name="Queen", songs=[...], albums=[...], singles=[...])
```

### Level 3: Stream URLs (Playback)

```python
stream = mk.get_stream("fJ9rUzIMcZQ")
# → Stream(
#      url="https://rr5---.googlevideo.com/videoplayback?...",
#      codec="opus",
#      bitrate=160000,
#      duration_ms=354000,
#      expires_at=1744300800,
#      loudness_db=-7.2,
#      size_bytes=3456789,
#    )
# Returns: Stream object with ready-to-play URL
# Anti-ban cost: 1 heavy request (stream extraction)

stream = mk.get_stream("fJ9rUzIMcZQ", quality="low")
# → Lower bitrate stream
```

### Level 4: File Operations (Download)

```python
mk.download("fJ9rUzIMcZQ", path="./music/", format="opus")
# Downloads audio file, writes metadata tags
# Anti-ban cost: 1 stream extraction + 1 file download
```

### Level 5: Recommendations & Radio

```python
radio = mk.get_radio("fJ9rUzIMcZQ")
# → [Song, Song, Song, ...] — YouTube's auto-generated playlist

related = mk.get_related("fJ9rUzIMcZQ")
# → [Song, Song, ...] — related songs

charts = mk.get_charts(country="US")
# → [Section(title="Top songs", items=[...]), ...]
```

---

## 7. Anti-Ban Config: Transparent & Overridable

### Default Behavior (Zero Config)

```python
mk = MusicKit()
# Everything works automatically:
# - Visitor ID generated and cached
# - Rate limiting active with sensible defaults
# - Caching active (SQLite or file-based)
# - Logging to stderr at INFO level
```

### What the Developer Sees (Transparency)

```
[MusicKit] Generating new visitor ID...
[MusicKit] Visitor ID cached (expires 2026-05-09)
[MusicKit] Search: "bohemian rhapsody" → 200 OK (142ms)
[MusicKit] Stream resolve: fJ9rUzIMcZQ → cached URL valid (expires in 4h12m)
[MusicKit] Stream resolve: dQw4w9WgXcQ → fetching fresh URL...
[MusicKit] Rate limit: waiting 200ms before next request
```

### Overriding (Power Users)

```python
mk = MusicKit(
    # Anti-ban tuning
    rate_limit={
        "search": 20,        # max per minute
        "stream": 10,
        "browse": 30,
        "autocomplete": 60,
    },
    min_request_gap=0.05,     # 50ms minimum between requests
    backoff_max=120,          # max backoff seconds on error

    # Session
    visitor_id="custom_id",   # BYO visitor ID
    user_agent="custom UA",   # custom user agent
    language="ja",            # content language

    # Caching
    cache_dir="./my_cache",   # custom cache location
    cache_ttl={
        "stream": 18000,      # 5 hours instead of 6
        "search": 600,        # 10 minutes
    },
    cache_enabled=True,       # disable entirely with False

    # Logging
    log_level="DEBUG",        # DEBUG, INFO, WARNING, ERROR, SILENT
    log_handler=my_handler,   # custom log handler

    # Advanced
    proxy="socks5://...",     # route through proxy
)
```

### Event Hooks (For Full Control)

```python
@mk.on("before_request")
def on_request(request):
    # Modify any request before it's sent
    request.headers["X-Custom"] = "value"

@mk.on("rate_limited")
def on_rate_limit(wait_seconds):
    print(f"Rate limited, waiting {wait_seconds}s")

@mk.on("visitor_id_refreshed")
def on_visitor_refresh(old_id, new_id):
    print(f"Visitor ID rotated")

@mk.on("cache_hit")
def on_cache_hit(key, ttl_remaining):
    pass  # Track cache effectiveness

@mk.on("error")
def on_error(error):
    # Custom error handling
    if error.code == 429:
        notify_admin("Rate limited by YouTube")
```

---

## 8. Language Strategy: Python & Node.js

### The Ecosystem Reality

The open-source libraries that power YouTube music extraction are NOT equal
across languages:

**Python: The Source of Truth**

| Library | Role | Stars | Contributors | Fix Speed |
|---------|------|-------|-------------|-----------|
| yt-dlp | Stream extraction | 95k+ | 50+ active | Hours to 1-2 days |
| ytmusicapi | InnerTube API | 4k+ | 50+ | Days |

**Node.js: Downstream Ports**

| Library | Role | Stars | Contributors | Fix Speed |
|---------|------|-------|-------------|-----------|
| @distube/ytdl-core | Stream extraction | ~200 | ~3-5 | Days to weeks |
| node-ytmusic-api | InnerTube API | ~200 | ~3 | Weeks |

When YouTube changes their cipher:
1. **yt-dlp figures it out first** (always)
2. Everyone else reads yt-dlp's commits and ports the fix

### Decision: Native Implementations in Both Languages

```
Python SDK:
  Built on:  yt-dlp + ytmusicapi
  Strength:  Fastest cipher recovery, most battle-tested
  Users recover from YouTube breakage: hours

Node.js SDK:
  Built on:  @distube/ytdl-core + node-ytmusic-api
  Strength:  Native JS, no Python dependency
  Users recover from YouTube breakage: days to weeks
  
Shared:
  - Identical API surface and function signatures
  - Same anti-ban defaults and configuration options
  - Same cache structure (interoperable if needed)
  - Same event/hook system
```

The API stays identical, but Node.js users should understand they're on a
slightly slower update track for cipher fixes. Document this honestly.

---

## 9. Foundation Libraries Comparison

### Stream Extraction (The Critical Dependency)

| | Python (yt-dlp) | Node.js (@distube/ytdl-core) |
|---|---|---|
| Cipher fix speed | Hours to 1-2 days | Days to weeks |
| Active contributors | 50+ | ~3-5 |
| Release frequency | Multiple/week | Irregular |
| Sites supported | 1000+ | YouTube only |
| Self-update | `yt-dlp --update` | `npm update` |
| Battle-tested | Millions of users | Thousands |
| Who fixes first | **Always first** | Watches yt-dlp, then ports |

### InnerTube API (Discovery & Metadata)

| | Python (ytmusicapi) | Node.js (node-ytmusic-api) |
|---|---|---|
| Documentation | Excellent | Minimal |
| API coverage | Complete (search, browse, library, uploads) | Partial |
| Contributors | 50+ | ~3 |
| Maintenance | Active | Sporadic |

### Verdict

Python SDK will always be more reliable because it sits on top of the
strongest foundations. Node.js SDK is viable but will lag on fixes.
Both are worth building — the API design work transfers directly.

---

## 10. Build Approach Options Evaluated

Four approaches were considered:

### Option A: Two Separate Native Libraries

```
Python SDK → yt-dlp + ytmusicapi
Node.js SDK → @distube/ytdl-core + node-ytmusic-api
```

Pros: Each feels native, no cross-language dependency
Cons: Double maintenance, anti-ban logic can diverge

### Option B: Core in Rust/Go + Bindings

```
Rust core → Python bindings (PyO3) + Node bindings (napi-rs)
```

Pros: One codebase, fast, low memory
Cons: Can't leverage yt-dlp/ytmusicapi, YOU maintain the cipher — full-time job

### Option C: Core in Python + Node Wrapper

```
Python core → Node.js calls via subprocess
```

Pros: Leverages yt-dlp directly
Cons: Node users need Python installed, latency per call

### Option D: Start With One, Port Later

```
Ship Python first → Node.js later once API is stable
```

Pros: Ship faster, validate the API design with real users
Cons: Node.js users wait

### Chosen: Option A (Native Implementations in Both)

Rationale: Each language gets its own native best-in-class foundation.
The API surface is identical. The anti-ban layer is simple enough to
implement twice without divergence. Developers in each ecosystem get
a package that feels native to their language.

---

## 11. Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Developer's Code                   │
│                                                       │
│   from musickit import MusicKit                       │
│   mk = MusicKit()                                     │
│   results = mk.search("query")                        │
│   stream = mk.get_stream(results[0].video_id)         │
│                                                       │
└──────────────────────┬────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────┐
│                   MusicKit SDK                         │
│                                                       │
│  ┌──────────────────────────────────────────────┐     │
│  │  Public API Layer                             │     │
│  │  autocomplete() search() get_stream()         │     │
│  │  get_home() get_artist() get_album()          │     │
│  │  get_radio() get_charts() download()          │     │
│  └──────────────────────┬───────────────────────┘     │
│                         │                              │
│  ┌──────────────────────▼───────────────────────┐     │
│  │  Anti-Ban Layer (transparent, overridable)    │     │
│  │                                               │     │
│  │  • Session manager (visitor ID lifecycle)     │     │
│  │  • Rate limiter (token bucket per endpoint)   │     │
│  │  • Request builder (headers, context, UA)     │     │
│  │  • Retry engine (exponential backoff)         │     │
│  │  • Cache manager (SQLite/file-based)          │     │
│  │  • Event emitter (hooks for transparency)     │     │
│  └───────┬──────────────────────┬───────────────┘     │
│          │                      │                      │
│  ┌───────▼──────────┐  ┌───────▼──────────────┐      │
│  │  Discovery Engine │  │  Stream Engine        │      │
│  │                   │  │                       │      │
│  │  Python:          │  │  Python:              │      │
│  │    ytmusicapi     │  │    yt-dlp             │      │
│  │                   │  │                       │      │
│  │  Node.js:         │  │  Node.js:             │      │
│  │    node-ytmusic   │  │    @distube/ytdl-core │      │
│  └───────────────────┘  └───────────────────────┘      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 12. RAM & Resource Budget

For single-user applications:

### Python SDK

```
Python runtime:           ~30 MB
yt-dlp (loaded):          ~50 MB peak (during stream extraction)
ytmusicapi:               ~5 MB
Anti-ban layer:           ~5 MB (rate limiter, session state, cache index)
SQLite cache:             ~5-20 MB (depends on usage)
                          ──────
Total peak:               ~100-120 MB
Idle:                     ~40-50 MB
```

### Node.js SDK

```
Node.js runtime (V8):    ~40 MB
@distube/ytdl-core:      ~20 MB peak
node-ytmusic-api:         ~5 MB
Anti-ban layer:           ~5 MB
SQLite cache:             ~5-20 MB
                          ──────
Total peak:               ~80-100 MB
Idle:                     ~50-60 MB
```

Both fit comfortably in 512 MB with 300+ MB headroom.

---

## 13. Decision Log

| # | Decision | Alternatives Considered | Why This Choice |
|---|----------|------------------------|-----------------|
| 1 | Target single-user apps only | Multi-user server, both | Simplifies anti-ban massively. No proxy pools, no session pools, no CAPTCHA solving needed. |
| 2 | Layered API — each function returns what makes sense | Full pipeline always, metadata only | Developers shouldn't need stream resolution to get autocomplete strings. Choose your depth. |
| 3 | Anti-ban: transparent by default, fully overridable | Invisible only, manual config required | Developers see what's happening (trust), can override when needed (power), but it just works out of the box (simplicity). |
| 4 | Native implementations in both Python and Node.js | Rust core + bindings, Python core + Node subprocess, one language only | Each language gets native feel. Anti-ban is simple enough to implement twice. Avoids cross-language dependency pain. |
| 5 | Python built on yt-dlp + ytmusicapi | Custom implementation, Piped-only | yt-dlp has fastest cipher fixes. ytmusicapi is the most complete InnerTube wrapper. Standing on giants. |
| 6 | Node.js built on @distube/ytdl-core + node-ytmusic-api | Subprocess to Python, custom implementation | Native JS, no Python dependency. Accept the fix-speed tradeoff, document it honestly. |
| 7 | SQLite for caching | Redis, JSON files, LevelDB | SQLite is built into Python, tiny, works everywhere, no external dependencies. Single-file database. |
| 8 | Event hooks for anti-ban transparency | Logging only, callbacks only | Events are composable — attach logging, metrics, custom behavior. Familiar pattern in both languages. |
