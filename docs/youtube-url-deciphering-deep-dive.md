# YouTube URL Deciphering — Deep Dive

How YouTube protects its audio streams, how libraries crack them open,
and how little it actually takes to do it.

---

## Table of Contents

1. [The URL Situation](#1-the-url-situation)
2. [What a Real Deciphered URL Looks Like](#2-what-a-real-deciphered-url-looks-like)
3. [Why URLs Expire](#3-why-urls-expire)
4. [What the Libraries Actually Do](#4-what-the-libraries-actually-do)
5. [How Harmony Music Handles Expiry](#5-how-harmony-music-handles-expiry)
6. [RAM Requirements for Deciphering](#6-ram-requirements-for-deciphering)
7. [Going to Absolute Minimum RAM](#7-going-to-absolute-minimum-ram)
8. [Realistic Minimums by Language](#8-realistic-minimums-by-language)
9. [The Absolute Floor](#9-the-absolute-floor)
10. [The Irony](#10-the-irony)

---

## 1. The URL Situation

**YouTube never gives you a permanent link to an audio file.**

What you see in the browser or API response is one of two things:

1. **A signed/ciphered URL** — the raw URL in the player page is scrambled
   with a signature that must be deciphered using a JavaScript function
   from YouTube's `player.js`

2. **A temporary direct URL** — once deciphered, you get a real URL pointing
   to Google's content delivery servers

You cannot just grab a URL from the page source and play it. The signature
is intentionally scrambled, and the decryption key is buried inside a
minified JavaScript file that YouTube changes periodically.

---

## 2. What a Real Deciphered URL Looks Like

Once a library successfully deciphers the signature, you get something like:

```
https://rr5---sn-something.googlevideo.com/videoplayback
  ?expire=1744300800          ← Unix timestamp, ~6 hours from now
  &ei=...                     ← event ID
  &ip=203.0.113.42            ← YOUR IP address baked into the URL
  &id=o-ABC123...             ← video identifier
  &itag=251                   ← audio format (251 = Opus high quality)
  &source=youtube
  &requiressl=yes
  &sig=AOq0QJ8w...            ← THE DECIPHERED SIGNATURE
  &range=0-3456789            ← byte range of the audio
  &ratebypass=yes
  ...more parameters...
```

Key things to notice:
- `expire` — this URL will stop working after this timestamp
- `ip` — this URL only works from the IP address that requested it
- `sig` — this is what the libraries compute by running the decipher function
- `rr5---sn-something.googlevideo.com` — Google's CDN edge server near you

---

## 3. Why URLs Expire

YouTube enforces expiry through **three mechanisms**:

| Mechanism | What It Does | Timeframe |
|-----------|-------------|-----------|
| `expire` parameter | URL returns 403 after this Unix timestamp | ~6 hours |
| IP binding | URL only works from the IP that originally requested it | Immediate — try from another IP, get 403 |
| Signature rotation | The cipher function in `player.js` changes | Days to weeks |

### Why YouTube Does This

- **Prevents hotlinking** — you can't just share a direct audio URL
- **Prevents bulk scraping** — URLs are short-lived and IP-bound
- **Enables CDN routing** — the URL encodes which edge server to use
- **Tracks usage** — each URL is tied to a specific request context
- **Revenue protection** — makes it harder to build unofficial clients
  (though clearly not impossible, as all the libraries prove)

This is YouTube's "DRM-lite" approach for non-premium content. It's not
encryption — the audio bytes themselves are unprotected. It's access
control through obscurity and expiry.

---

## 4. What the Libraries Actually Do

Every stream extraction library (yt-dlp, youtube_explode, ytdl-core, etc.)
performs the same fundamental process:

```
YouTube page / API response
    │
    │  Contains: signatureCipher or scrambled URL
    │  NOT directly playable
    │
    ▼
Library (yt-dlp, youtube_explode, ytdl-core, etc.)
    │
    │  Step 1: Download player.js (~1-2 MB JavaScript file)
    │  Step 2: Extract the decipher function using regex
    │  Step 3: Run it against the scrambled signature
    │  Step 4: Construct the final URL with deciphered sig
    │
    ▼
Temporary direct URL → points to rr*.googlevideo.com
    │
    │  Valid for: ~6 hours
    │  Bound to: your IP
    │  Points to: actual audio bytes on Google's CDN
    │
    ▼
Audio stream (Opus or MP4A bytes)
```

### Step-by-Step Detail

**Step 1 — Download `player.js`**

Every YouTube page references a player JavaScript file with a URL like:
```
https://www.youtube.com/s/player/HASH/player_ias.vflset/en_US/base.js
```

This file is ~1-2 MB of minified JavaScript. Somewhere buried inside it is
the signature decipher function.

**Step 2 — Extract the decipher function**

The library searches `player.js` using regex patterns to find the function
that transforms signatures. The function typically looks something like
(after deobfuscation):

```javascript
function decipher(a) {
    a = a.split("");
    Xq.rK(a, 2);        // splice: remove first 2 chars
    Xq.Jg(a, 36);       // swap: swap position 0 with position 36
    Xq.Jg(a, 51);       // swap: swap position 0 with position 51
    Xq.GH(a, 3);        // splice: remove first 3 chars
    Xq.rK(a, 28);       // splice: remove first 28 chars
    Xq.Zu(a);           // reverse: reverse the entire array
    return a.join("");
}
```

The function names (`Xq.rK`, `Xq.Jg`, etc.) change every time YouTube
updates `player.js`, but the underlying operations are always the same
three primitives:

| Operation | What It Does |
|-----------|-------------|
| **swap(a, n)** | Swap character at position 0 with character at position n |
| **splice(a, n)** | Remove the first n characters |
| **reverse(a)** | Reverse the entire string |

**Step 3 — Run the decipher**

The scrambled signature is a string of ~100 characters. The library applies
the extracted operations in order:

```
Input:  "AOq0QJ8wRAIgY2sCmM8..."  (scrambled, ~100 chars)
         │
         ├── swap(36)
         ├── splice(3)
         ├── reverse()
         ├── swap(51)
         └── splice(2)
         │
Output: "8Jq0AO0wRAIgY2sCmM..."   (deciphered)
```

This is trivially cheap — it's 3-5 string operations on a 100-character string.

**Step 4 — Construct the final URL**

The deciphered signature is inserted into the URL:
```
base_url + "&sig=" + deciphered_signature
```

Done. You now have a playable URL that will work for ~6 hours from your IP.

---

## 5. How Harmony Music Handles Expiry

In the codebase, this is managed in `lib/services/audio_handler.dart` inside
the `checkNGetUrl()` method (line ~776):

```
Need to play a song
    │
    ▼
Check SongsUrlCache box for cached URL
    │
    ├── Found? → Check if expired using isExpired(url: cachedUrl)
    │              │
    │              ├── Not expired → Reuse it (no network call needed)
    │              │
    │              └── Expired → Fall through to fresh fetch
    │
    └── Not found → Fresh fetch
                      │
                      ▼
              StreamProvider.fetch(songId)
              → youtube_explode_dart does steps 1-4 above
              → Returns Audio objects with fresh URLs
                      │
                      ▼
              Cache in SongsUrlCache for next time
```

The `isExpired()` function parses the `expire` parameter from the URL and
compares it to the current time. Simple Unix timestamp comparison.

### The full priority cascade

Before even checking URLs, the app checks if it has the audio locally:

```
Priority 1: SongsCache (cached-to-disk audio files)
    → Plays from: file://<cacheDir>/cachedSongs/<songId>.mp3
    → No network needed at all

Priority 2: SongDownloads (user-downloaded songs)
    → Plays from: local file path
    → Falls back to online if file was deleted

Priority 3: SongsUrlCache (cached stream URLs)
    → Reuses URL if not expired (~6 hour window)
    → One network call to play, zero to resolve

Priority 4: Fresh StreamProvider.fetch()
    → Full decipher process
    → Downloads player.js, extracts cipher, deciphers signature
    → Caches result for next time
```

This means most songs only go through the expensive decipher process once.
After that, they're either cached locally or the URL is reused until it
expires.

---

## 6. RAM Requirements for Deciphering

### Memory Breakdown Per Step

| Step | What's in Memory | Size |
|------|-----------------|------|
| Download `player.js` | A single JavaScript file | ~1-2 MB |
| Extract decipher function | Regex/string search on that file | Negligible (reuses same buffer) |
| Run decipher on signature | A few string manipulations | ~A few KB |
| Construct final URL | String concatenation | ~A few KB |

### Total for the Decipher Itself: ~2-5 MB Peak

The `player.js` file is the heaviest part at ~1-2 MB. Everything else is
string operations on tiny data.

The real memory cost comes from the **language runtime**, not the work:

| Library | Language Runtime Overhead | Realistic Total |
|---------|-------------------------|-----------------|
| yt-dlp | Python interpreter | ~30-50 MB |
| ytdl-core | Node.js (V8 engine) | ~40-60 MB |
| youtube_explode_dart | Dart VM (inside Flutter) | Already loaded, ~0 extra |
| YoutubeExplode (.NET) | .NET runtime | ~30-50 MB |
| rusty_ytdl (Rust) | Native binary, no runtime | ~5-10 MB |
| kkdai/youtube (Go) | Go runtime | ~10-15 MB |

### Practical Impact

- **On a phone with 2 GB RAM** — trivial, Harmony Music does this constantly
- **On a Raspberry Pi Zero (512 MB)** — fine with Go/Rust, tight but works
  with Python/Node
- **On an ESP32 or microcontroller (KB of RAM)** — not with standard libraries,
  need custom approach (see section 7)
- **As a backend handling many concurrent requests** — each request costs
  ~2-5 MB for actual work, runtime overhead is shared

---

## 7. Going to Absolute Minimum RAM

If you strip away every comfort and optimize purely for memory:

### Option A: Load player.js Normally (~1.5 MB)

The simple approach — download the whole file, regex it, done.

```
player.js in memory:  ~1.2 MB
Regex search:         ~negligible
Working space:        ~a few KB
Total:                ~1.5 MB
```

### Option B: Stream-Parse player.js (~8-10 KB)

Never hold the full file in memory:

```
Read player.js in chunks (4 KB buffer)
Search for the decipher function pattern as bytes stream through
Discard each chunk after scanning
Keep only the extracted function (~200 bytes)

Total:                ~8-10 KB
```

This is harder to implement (your regex can't span chunk boundaries naively,
so you need a sliding window or state machine), but it drops memory by 100x.

### Option C: Cache the Decipher Operations (~1 KB)

Extract the operations once and store them as a tiny data structure:

```json
["swap,36", "splice,3", "reverse", "swap,51", "splice,2"]
```

That's ~50 bytes. Reuse until YouTube changes `player.js` (days to weeks).

**Per-request after caching: ~1 KB total**

You only need the ~100-byte signature string and ~500-byte output URL.

---

## 8. Realistic Minimums by Language

| Approach | RAM | Notes |
|----------|-----|-------|
| **C + mbedTLS + stream parse** | ~30-50 KB | Maximum effort, minimum RAM |
| **C + libcurl + stream parse** | ~100-200 KB | More practical C approach |
| **Rust (no_std + embedded TLS)** | ~50-100 KB | Doable on embedded targets |
| **Rust (with std)** | ~2-5 MB | Normal Rust binary |
| **Go (TinyGo)** | ~1-3 MB | Stripped-down Go runtime |
| **Go (standard)** | ~8-10 MB | Full Go runtime |
| **MicroPython** | ~256 KB+ | Barely feasible, very tight |
| **Lua + luasocket** | ~500 KB - 1 MB | Lightweight scripting option |
| **Python** | ~30 MB | The interpreter alone eats this |
| **Node.js** | ~40 MB | V8 engine is hungry |

---

## 9. The Absolute Floor

If you pre-compute and hardcode the decipher operations (update them manually
or via a tiny updater service when YouTube changes them):

```
No need to download player.js at all.

Just:
  - HTTP GET to fetch the ciphered URL          → 4 KB buffer
  - Apply 3-5 hardcoded string operations       → 1 KB workspace
  - Output the final URL                        → ~500 bytes

Minimum: ~25-35 KB (C + minimal TLS library)
```

At this level, you could run it on:

| Device | RAM | Can It Run? |
|--------|-----|-------------|
| Modern phone (2+ GB) | Overkill | Yes, trivially |
| Raspberry Pi Zero (512 MB) | Overkill | Yes, any language |
| ESP32 (520 KB) | Comfortable | Yes, with C approach |
| ESP8266 (80 KB) | Tight but possible | Yes, with pre-computed cipher + stream parsing |
| Arduino Uno (2 KB) | No | Not enough for TLS handshake alone |
| ATtiny85 (512 bytes) | Absolutely not | Needs external network + compute |

The hard floor is set by **TLS** (HTTPS), not the decipher logic. A TLS
handshake alone needs ~20-30 KB minimum. If you could somehow proxy through
an HTTP (non-TLS) intermediary, the decipher itself could run in under 2 KB.

---

## 10. The Irony

The actual cryptographic work — deciphering a YouTube signature — needs less
RAM than a single frame of the thumbnail image.

```
Decipher work:           ~1 KB
One thumbnail (120x90):  ~30 KB (compressed JPEG)
One second of audio:     ~20 KB (Opus at 160kbps)
player.js download:      ~1.2 MB (the expensive part)
Python runtime:          ~30 MB (just to exist)
Node.js runtime:         ~40 MB (just to exist)
```

The bottleneck was never the decryption. It's the runtime we wrap around it
and the `player.js` file we need to download. The signature itself is just
5 string operations on 100 characters — something a 1970s mainframe could do.

---

## Summary

YouTube's stream protection is an access-control system, not encryption.
The audio bytes are unprotected — YouTube just makes you solve a small
puzzle (decipher a signature) to get a temporary, IP-bound key to access
them. The puzzle changes periodically, which is why libraries need active
maintenance. But the puzzle itself is trivial: download a file, find a
function, apply 3-5 string transforms. The open-source community has
independently implemented this in every major programming language, and
the actual compute cost is negligible — the language runtime overhead
dwarfs the real work by 1000x or more.
