# Research Synthesis — What We Learned

> Compiled from 6 research agents covering YouTube/InnerTube, metadata/lyrics, Discord audio, Indian music APIs, SDK infrastructure, and a wild-card broad search.

---

## The Patterns That Kept Coming Up

### 1. Zod for Runtime Response Validation
**Found by:** YouTube agent, Indian music agent (independently)
**Packages:** `ytmusic-api`, `@saavn-labs/sdk`

InnerTube and JioSaavn both return inconsistent, undocumented shapes. Two separate agents searching completely different spaces landed on the same solution: Zod runtime validation at the boundary. We currently trust both APIs blindly — if a field moves or disappears, we silently return garbage.

**Action:** Wrap JioSaavn and InnerTube response parsing in Zod schemas. Fail loudly at the boundary instead of silently downstream.

---

### 2. `music-metadata` Is the Standard for File Tags
**Found by:** Wild-card agent AND metadata agent (independently)
**Package:** `music-metadata` — 2.5M/week

We download files and never touch their tags. Every agent that touched the file I/O space pointed at this package. The tokenizer abstraction (plug in S3, stream, buffer, blob — same interface) is the standout design pattern.

**Action:** Use `music-metadata` to embed ID3/Vorbis tags into downloaded files (title, artist, album, artwork). A downloaded Opus file should be a properly tagged file, not a raw audio blob.

---

### 3. The yt-dlp Fallback Path Is a Black Box
**Found by:** YouTube agent (`ytdlp-nodejs` lifecycle events), Discord audio agent

When our direct URL fails and we fall back to yt-dlp, there are zero events — no `progress`, no `start`, no `finish`. `ytdlp-nodejs` at 29K/week solves this with a fluent builder and rich lifecycle hooks. `youtube-dl-exec`'s camelCase flag object also eliminates shell injection risk.

**Action:** Add progress events to the yt-dlp fallback path. Wire `onProgress` into both paths so callers can't tell which one fired.

---

### 4. Permanent vs Retryable Error Distinction
**Found by:** Infrastructure agent (`p-retry`)

`p-retry`'s `AbortError` pattern — throw `AbortError` for 401/404 (don't retry), regular errors for 429/5xx (do retry). Our retry engine currently doesn't distinguish — it retries everything including 404s.

**Action:** Update `RetryEngine` to check error type/status code before retrying. `NotFoundError` and `ValidationError` should never retry.

---

### 5. Weight-Based Rate Limiting
**Found by:** Infrastructure agent (`p-throttle`)

Expensive endpoints cost more "points" than cheap ones. Our rate limiter treats all endpoints equally — one search costs the same as one autocomplete hit. Real APIs don't work that way.

**Action:** Add weight/cost per endpoint to `RateLimiter`. Search = 5 points, autocomplete = 1, stream = 10, etc.

---

### 6. Nobody Has a Clean Multi-Source Pipeline
**Found by:** Indian music agent, Discord audio agent, YouTube agent

Every package solves one piece. `musicfetch` resolves links across 38 services but returns links only (paid, no stream URLs). `play-dl` is archived. `discord-player` dropped YouTube in v7. No package combines:
- Multi-source resolution
- Stream URL decryption
- Caching + retry
- Typed errors
- LRC sync

**This is our actual moat.** We're the only installable npm package that does all of it.

---

### 7. `tonal` — Music Theory Nobody Is Using
**Found by:** Wild-card agent only
**Package:** `tonal` — pure TypeScript music theory. Notes, chords, scales, keys.

None of the focused agents found this. Zero music streaming SDKs integrate it. If someone searches "Am chord songs" or wants songs filtered by key/scale, there's no infrastructure for it anywhere.

**Action:** Future feature — `tonal` integration for key/chord/scale-aware search filtering.

---

### 8. The React Native Gap Is Real
**Found by:** Wild-card agent (`react-native-track-player`, `expo-av`)

People running our SDK on mobile are doing server-side + `react-native-track-player` on the client. The SDK runs on their VPS, the app is the playback layer. This is a valid architecture and explains the mobile usage.

**Action:** Worth documenting in README. Add an "architecture patterns" section showing server-side SDK + mobile client as a first-class use case.

---

## Packages Worth Installing and Studying

| Package | Downloads | Why |
|---------|-----------|-----|
| `music-metadata` | 2.5M/week | ID3/Vorbis tag reading — embed metadata into downloads |
| `tonal` | — | Music theory — chord/scale/key aware features |
| `bottleneck` | 10M/week peak | Reservoir rate limiting pattern |
| `p-retry` | 27M/week | AbortError for permanent vs retryable failure |
| `lrc-kit` | niche | `Runner` class for playback-sync karaoke |
| `ytdlp-nodejs` | 29.6K/week | yt-dlp lifecycle events pattern |
| `@saavn-labs/sdk` | low | Zod validation pattern for JioSaavn |

---

## Common Gaps Across the Entire Space

1. No package combines fingerprinting → MBID lookup → lyrics → LRC sync
2. YouTube reliability is unsolved — everyone hurts from it
3. Seeking support is universally fragile in stream-based playback
4. Receive-side audio (recording from voice channels) is essentially untouched
5. Wynk Music has zero developer tooling in any language
6. MIDI and music theory are fragmented and underutilized in streaming apps
