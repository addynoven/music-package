# Audio Fingerprinting & Song Identification — Wild Research

Everything interesting in the audio fingerprinting and song recognition space: npm packages, open source engines, commercial APIs, dead projects, academic research, and the plumbing underneath it all.

---

## How Audio Fingerprinting Works (The Core Idea)

All practical systems trace back to the same 2003 Shazam paper by Avery Li-Chun Wang. The process:

1. Compute a spectrogram (FFT over sliding windows)
2. Extract **constellation points** — local maxima in time-frequency space
3. Pair nearby peaks to form **hash landmarks**
4. Look up hashes against a database; a cluster of matching hashes at the same time offset = a hit

The genius is that landmarks are sparse, so fingerprints are tiny, and time-offset alignment makes the matching immune to where in the song you started listening. Noise tolerance comes from the fact that loud peaks survive noise well.

Chromaprint (AcoustID) takes a different path: it analyzes chroma energy (12 pitch classes) across overlapping 500ms frames, stores 8 feature vectors/second, applies whitening + PCA, and encodes the result as a bitstring. It's designed for near-duplicate detection of clean audio, not noisy over-the-air recording.

---

## The Core Stack: AcoustID + Chromaprint + MusicBrainz

This is the open-source canonical pipeline for song identification in the wild.

### Chromaprint (C library)
- **Repo**: https://github.com/acoustid/chromaprint — 1.3k stars, C++, last commit Jan 2026
- The reference implementation. Ships `fpcalc` binary. Used by MusicBrainz Picard, beets, and everything else in this space.
- Fingerprints the **first ~2 minutes** of a track. Not suitable for "snippet from the middle" identification.
- Algorithm: chroma features → sliding window → bit comparison → compressed fingerprint string
- Fingerprints are not secret — they're submitted publicly to the AcoustID database

### AcoustID (Service + Index)
- **Site**: https://acoustid.org
- Free service for non-commercial use (first 10k queries free, then metered)
- Database: 30+ million fingerprints, ~10 million mapped to MusicBrainz recordings
- Two API operations: `lookup` (submit fingerprint → get recording IDs) and `submit` (contribute new fingerprints)
- **acoustid-index**: https://github.com/acoustid/acoustid-index — 93 stars, written in **Zig**, last commit Oct 2025. This is the actual fingerprint search engine that powers the service. Minimalistic similarity search over compressed fingerprint vectors.
- **acoustid-server**: https://github.com/acoustid/acoustid-server — 83 stars, Python, last commit Mar 2026. The web platform and API itself. Running infrastructure, not usually what you clone.

### MusicBrainz
- The metadata endpoint. AcoustID resolves fingerprints to MusicBrainz Recording IDs (MBIDs), and then you use MusicBrainz to look up artist, album, track title, ISRC, release date, etc.
- No fingerprinting here — it's purely a structured music database with a public API.

---

## Node.js / npm Packages

### Working / Current

#### `fpcalc` (npm)
- **npm**: https://www.npmjs.com/package/fpcalc
- Thin Node.js wrapper that shells out to the `fpcalc` binary (from Chromaprint)
- Returns `{ duration, fingerprint }` from any audio file path or readable stream
- Limitation: requires `fpcalc` installed separately (via apt, brew, or bundled binary)
- The only realistic way to get real Chromaprint fingerprints in Node right now
- Stream support has a known bug: duration not returned when passing a stream (fpcalc limitation)

#### `acoustid` (npm)
- **npm**: https://www.npmjs.com/package/acoustid
- Wraps `node-fpcalc` + makes the AcoustID lookup HTTP call for you
- Result: fingerprint → MusicBrainz recording metadata in one call
- Still requires `fpcalc` binary installed
- Light abstraction, does the job

#### `node-fpcalc` (parshap/node-fpcalc)
- **Repo**: https://github.com/parshap/node-fpcalc — 74 stars
- The underlying module used by `acoustid`. Separate package if you only need the fingerprint without the API lookup.

#### `@unimusic/chromaprint` (npm)
- **npm**: https://www.npmjs.com/package/@unimusic/chromaprint
- Keywords: `wasm, acoustid, chromaprint, audio, fingerprint`
- **Chromaprint compiled to WASM** — no native binary dependency
- Most recent entry in this space (published recently as of 2025)
- Works in browser and Node. This is the most interesting pure-JS option right now.

#### `musicbrainz-api` (Borewit)
- **npm**: https://www.npmjs.com/package/musicbrainz-api
- **Repo**: https://github.com/Borewit/musicbrainz-api — 218 stars, TypeScript 99.7%
- Latest: v1.2.0, Feb 2026. Node.js 16+ required.
- Full TypeScript. Supports: lookup by MBID, search (Lucene syntax), browse, submit metadata, Cover Art Archive
- Built-in rate limiting (15 req / 18s, configurable). The right choice for MusicBrainz in TypeScript projects.
- Use this after AcoustID gives you an MBID.

#### `music-metadata` (Borewit)
- **npm**: https://www.npmjs.com/package/music-metadata — **1.84 million weekly downloads**, v11.12.3, March 2026
- **Repo**: https://github.com/Borewit/music-metadata — 1.3k stars, TypeScript 99.6%
- Not a fingerprinting tool, but an essential companion: reads embedded metadata (ID3, APE, Vorbis, AAC, FLAC, etc.) and returns MusicBrainz tags if Picard has tagged the file
- Supports 25+ formats: MP3, FLAC, Ogg, WAV, MP4, AIFF, AAC, APE, AIFF, WebM, WMA...
- Works in Node and browser (with bundler). The most downloaded audio-related package on npm by a wide margin.
- Pairs naturally with `fpcalc` + `acoustid` to build a full identification pipeline

#### `acrcloud` (npm)
- **npm**: https://www.npmjs.com/package/acrcloud — ~30k weekly downloads
- Wrapper for ACRCloud's Audio Recognition API
- Requires ACRCloud account (free trial, then paid). Not a self-hosted solution.
- ACRCloud claims 98%+ accuracy, 100M+ daily queries capacity

#### `audd.io` (npm)
- **npm**: https://www.npmjs.com/package/audd.io
- **Repo**: https://github.com/DrKain/audd.io
- Wrapper for AudD Music Recognition API (https://audd.io)
- `audd.recognize.fromURL()` / `audd.recognize.fromFile()`
- Returns: artist, title, album, release_date, label, ISRC, UPC, Spotify/Apple Music links
- 300 free requests. Simpler signup than ACRCloud. REST-based.

---

### Dead / Abandoned Node.js Packages

#### `chromaprint.js` (bjjb/chromaprint.js)
- **Repo**: https://github.com/bjjb/chromaprint.js — 68 stars
- Pure CoffeeScript port of the C++ Chromaprint library
- No WASM, no native bindings — a direct JS reimplementation
- No releases, ~29 commits, 3 open issues. Last meaningful activity unclear but appears dormant.
- The idea was right but the execution stalled. Superseded by `@unimusic/chromaprint` (WASM approach).

#### `chromaprint-wasm` (npm)
- **npm**: https://www.npmjs.com/package/chromaprint-wasm — v0.1.2, published ~6 years ago
- WASM wrapper around `rust-chromaprint` via `wasm-bindgen`
- Zero other packages use it. Targets `no-modules` build only (works with neither parcel nor webpack cleanly)
- Superseded by `@unimusic/chromaprint`

#### `node-acoustid` (parshap/node-acoustid)
- **Repo**: https://github.com/parshap/node-acoustid — older sibling of the `acoustid` package
- Hits the AcoustID web service given a fingerprint; the `acoustid` package wraps this

#### `nodebrainz` (jbraithwaite/nodebrainz)
- **npm**: https://www.npmjs.com/package/nodebrainz
- **Repo**: https://github.com/jbraithwaite/nodebrainz
- Zero dependencies, full MusicBrainz API v2 (search, lookup, browse), Lucene query support
- Not dead, but `musicbrainz-api` is the modern replacement (TypeScript, ESM, better maintained)

#### `node-shazam-api` (asivery)
- **Repo**: https://github.com/asivery/node-shazam-api — 29 stars
- Reverse-engineered Shazam API client. Uses `recognizeSong()` with raw 16kHz mono 16-bit PCM
- Low star count, minimal commits (16), limited maintenance
- Fragile — Shazam can change their API without notice

#### `stream-audio-fingerprint` (adblockradio)
- **Repo**: https://github.com/adblockradio/stream-audio-fingerprint — 780 stars
- Node.js duplex stream: PCM audio in → fingerprint events out
- Implements the Shazam landmark algorithm directly in Node.js
- Built for the Adblock Radio project (radio stream ad detection)
- **Archived March 11, 2025. Read-only.** Not maintained.
- Still worth studying as a Node.js reference implementation of the Shazam algorithm

---

## Open Source Engines (Non-npm)

### seek-tune (cgzirim/seek-tune) — Most Important Reference
- **Repo**: https://github.com/cgzirim/seek-tune — **5.6k stars**, Go, last activity Nov 2025
- Full Shazam algorithm implementation: spectrogram → peak extraction → constellation maps → hash fingerprints → database matching
- Stack: Go backend, JavaScript/Node frontend, FFmpeg for audio, SQLite or MongoDB for fingerprint storage, Spotify + YouTube API integrations
- 337 commits, 6 open issues — actively maintained
- **Best single reference for understanding the complete pipeline end-to-end**

### SongRec (marin-m/SongRec) — Shazam Protocol Reverse Engineering
- **Repo**: https://github.com/marin-m/SongRec — **1.8k stars**, Rust, last update Apr 2026
- Open-source Shazam client for Linux. Communicates with actual Shazam servers.
- Reverse-engineered the Shazam fingerprint format: frequency peaks encoded as `(frequency, amplitude, time)` tuples, sent to Shazam's identify endpoint
- Processes audio at 16kHz, analyzes four frequency bands: 250-520 Hz, 520-1450 Hz, 1450-3500 Hz, 3500-5500 Hz
- Privacy note: only fingerprints are sent, not raw audio
- Codebase has a `signature_format.rs` file documenting the exact binary fingerprint encoding
- **If you want to understand what Shazam actually receives, this is the source**

### Dejavu (worldveil/dejavu)
- **Repo**: https://github.com/worldveil/dejavu — **6.7k stars**, Python
- Shazam-style: FFT → spectrogram → peak extraction → LSH hash pairs → MySQL/PostgreSQL storage
- "Locality sensitive hashes computed from the spectrogram" — same Wang 2003 approach
- Originally the go-to Python teaching implementation of audio fingerprinting
- 109 open issues, 24 PRs — community engagement but original author maintenance is spotty
- Multiple forks and ports exist (C++ port: `dejavu_cpp_port`)
- Not dead but not thriving. Good for learning, not production.

### Olaf (JorenSix/Olaf)
- **Repo**: https://github.com/JorenSix/Olaf — **396 stars**, C (74.7%), Zig (14.6%), last release v2.0.2 March 2026
- "Overly Lightweight Acoustic Fingerprinting" — designed for embedded devices (ESP32, ARM), desktop, and **browser via WASM**
- Uses LMDB key-value store for fingerprint storage on desktop
- WASM build via Emscripten — integrates with Web Audio API in browser
- AGPL-3.0 license (copyleft — commercial use requires sharing)
- Same author (Joren Six) as Panako. More minimal, more portable.
- **The best option if you need audio fingerprinting in a browser without a server round-trip**

### Panako (JorenSix/Panako)
- **Repo**: https://github.com/JorenSix/Panako — **250 stars**, Java, last release v2.1.0 Oct 2022
- **Key differentiator**: handles audio that has been **pitch-shifted, time-stretched, or sped up** — up to 10% modification with 100% specificity
- Algorithm: key points in Constant-Q spectrogram (not standard FFT), which is inherently pitch-invariant
- Useful for: cover detection, DJ sets, live recordings where tempo may drift, degraded archives
- AGPL-3.0 license
- Maintenance: "goes in activity bursts" per author. Not fast-moving.

### Audfprint (dpwe/audfprint)
- **Repo**: https://github.com/dpwe/audfprint — **602 stars**, Python
- Dan Ellis (Columbia University / LabROSA) — one of the key researchers in the field
- Landmark-based, same family as Shazam. Originally MATLAB, Python rewrite available.
- Processing: 11025 Hz, ~20 hashes/second, ~262k track capacity per database
- ~0.008x real-time for DB building (extremely fast ingestion)
- Dependencies: `librosa`, `docopt`
- Not archived, but no recent releases. Research-grade code.

### Audioneex (a-gram/audioneex)
- **Repo**: https://github.com/a-gram/audioneex — 60 stars, C++, MPL-2.0
- "General purpose, real-time audio recognition engine"
- Uses **binary auditory words model** (from a 2014 paper) — different from spectral landmark approaches
- Extremely compact: 1 hour of audio in under 1 MB of fingerprint storage
- Database-neutral: works with any storage backend
- Low stars but technically distinct. Worth knowing exists.

### Echoprint / echoprint-codegen (spotify/echoprint-codegen)
- **Repo**: https://github.com/spotify/echoprint-codegen — 962 stars
- **Archived March 2022 by Spotify. Dead.**
- Was The Echo Nest's open-source fingerprinting system (acquired by Spotify in 2014)
- Algorithm: generates "Echoprint codes" from 11025 Hz PCM via base64(zlib(hex-fingerprint))
- ~250x realtime scanning speed
- MIT + Apache 2 licenses — code is still usable, just not maintained
- Historically important: the main competitor to AcoustID/Chromaprint in the open-source space

### Neural Audio Fingerprint (mimbres/neural-audio-fp)
- **Repo**: https://github.com/mimbres/neural-audio-fp — 206 stars, Python
- Official implementation of the ICASSP 2021 paper "Neural Audio Fingerprint for High-Specific Audio Retrieval Based on Contrastive Learning"
- **Entirely different paradigm**: deep learning (contrastive learning / NTxent loss) instead of spectral landmarks
- Audio encoded at 16-bit 8000 Hz PCM Mono
- Training: batches of original samples + augmented replicas (time offsets, noise, reverb, impulse responses)
- Search at scale via **Faiss** (100x larger database than traditional methods claimed)
- Dataset: 100K full-length songs (443 GB) available
- Slower to query than hash-based systems, but potentially more robust to heavy distortion
- Not production-ready tooling — research code

---

## Commercial APIs (Worth Knowing)

| Service | Free Tier | Coverage | Node.js | Notes |
|---------|-----------|----------|---------|-------|
| **AcoustID** | 10k queries/month | 30M+ fingerprints, MusicBrainz-linked | `acoustid` npm | Open source infrastructure, crowdsourced |
| **ACRCloud** | Free trial | 100M+ tracks, video/broadcast | `acrcloud` npm (~30k DL/week) | The enterprise standard. Handles broadcast monitoring, covers, versions |
| **AudD** | 300 requests | Mainstream catalog | `audd.io` npm | Clean API, returns Spotify/Apple Music links |
| **Shazam** (unofficial) | None officially | Massive catalog | `node-shazam-api`, `shazamapi-node` | Reverse-engineered. No official API for developers. Fragile. |
| **RapidAPI Shazam** | Freemium | Shazam catalog | HTTP calls | Third-party reseller, not from Apple/Shazam directly |

---

## The Ecosystem Map

```
Audio File / Stream
        |
   [Fingerprint Generation]
        |
   +-----------+--------------------+
   |           |                    |
fpcalc      Olaf WASM           Shazam landmark
(Chromaprint) (C → WebAssembly)   (Shazam/seek-tune style)
   |           |                    |
   v           v                    v
[AcoustID]  [Self-hosted DB]    [ACRCloud / AudD / Shazam]
   |
   v
[MusicBrainz MBID]
   |
   v
[musicbrainz-api]
   → artist, album, title, ISRC, release date, cover art
```

---

## Key Technical Papers (If You Want to Go Deep)

- **"An Industrial-Strength Audio Search Algorithm"** — Avery Li-Chun Wang, 2003. The Shazam paper. Everything else references this.
- **"Panako – A Scalable Acoustic Fingerprinting System Handling Time-Scale and Pitch Modification"** — Joren Six, ISMIR 2014. Why pitch-invariant fingerprinting is hard and how to do it.
- **"Neural Audio Fingerprint for High-Specific Audio Retrieval Based on Contrastive Learning"** — Chang et al., ICASSP 2021. The ML approach.
- **"Echoprint: An Open Music Identification Service"** — Daniel Ellis et al. 2011. Historical context on the Echoprint approach.

---

## What's Actually Alive in 2025

**Active and recommended:**
- `@unimusic/chromaprint` — WASM Chromaprint, no native dep, browser/Node
- `musicbrainz-api` (Borewit) — TypeScript MusicBrainz client, rate-limit aware
- `music-metadata` (Borewit) — 1.84M weekly downloads, the metadata parsing standard
- `fpcalc` + `acoustid` — still the practical pipeline if you can install a binary
- `acrcloud` npm — commercial but production-ready, high accuracy
- `audd.io` npm — simpler commercial option
- seek-tune (Go) — best full Shazam-algorithm reference implementation
- SongRec (Rust) — best Shazam protocol documentation
- Olaf (C/WASM) — best for embedded / browser fingerprinting
- AcoustID service — the only open, free, crowdsourced fingerprint database with 30M entries

**Dead / skip:**
- `chromaprint.js` (bjjb) — abandoned CoffeeScript port
- `chromaprint-wasm` (old one) — superseded
- `stream-audio-fingerprint` (adblockradio) — archived Mar 2025
- Echoprint / echoprint-codegen — archived by Spotify 2022
- `node-shazam-api` — reverse-engineered, fragile, low activity

**Worth studying but not for production:**
- Dejavu (Python) — canonical teaching implementation of Shazam algorithm
- Audfprint (Python, Dan Ellis) — research-grade landmark system
- Neural Audio Fingerprint — the ML direction, not tooling-ready yet
- Panako (Java) — unique pitch-shift robustness, if that's a real requirement

---

## Practical Recommendations for This SDK

If the goal is identifying a song from a file or stream and returning metadata:

1. **Easiest path**: `fpcalc` → `acoustid` → `musicbrainz-api`. Pure open source, free up to 10k queries/day, returns full MusicBrainz metadata. Requires `fpcalc` binary which means a system dependency.

2. **Zero native dependency path**: `@unimusic/chromaprint` (WASM) → AcoustID API → `musicbrainz-api`. Fully JS/WASM, works in browser or serverless. Newer package, fewer users, but architecturally cleanest.

3. **High accuracy, commercial, quick to ship**: `acrcloud` npm. Handles edge cases (covers, live versions, broadcast) that AcoustID misses. 30k weekly downloads. Costs money.

4. **AudD if you want Spotify/Apple Music metadata back directly**: `audd.io` npm. Fewer integration steps if downstream is streaming link lookups.

The gap in the ecosystem: there is **no well-maintained, pure TypeScript, self-hosted Shazam-style landmark fingerprinting engine in npm**. The stream-audio-fingerprint package filled this niche and got archived. seek-tune is the closest working implementation but it's Go, not Node.js. This is a legitimate space to build something.
