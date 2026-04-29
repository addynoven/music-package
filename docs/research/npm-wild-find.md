# NPM Music Software Packages — Wild Find

Research conducted April 2026. Download figures are weekly unless noted. Numbers vary across tracking sources (npm registry, Snyk, npm-compare, npmtrends); ranges are given where there is meaningful disagreement. Treat all figures as directionally accurate, not exact.

---

## Tier 1 — Dominant Packages (500K+ weekly downloads)

These are the heavyweights. Cross-domain usage (music apps, games, podcasts, video platforms) inflates numbers, but they are genuinely the most installed packages in the audio/music space.

### `react-player`
- **Weekly downloads:** ~1.6–1.9M
- **What it is:** React component that plays URLs from YouTube, SoundCloud, Vimeo, Twitch, Mixcloud, DailyMotion, Wistia, and local files. Audio and video.
- **Why it matters:** The default grab-and-go player for any React app needing embeddable media. SoundCloud support makes it relevant to music streaming.
- **Latest version:** 3.4.0
- **npm:** https://www.npmjs.com/package/react-player

### `howler`
- **Weekly downloads:** ~700K–1.5M (reported as ~1.5M by PkgPulse Feb 2026; npm registry shows ~700K in other snapshots)
- **What it is:** JavaScript audio library for the modern web. Handles format fallbacks (MP3/OGG/WebM/AAC), audio sprites, 3D spatial audio, Web Audio API + HTML5 Audio fallback.
- **Why it matters:** The dominant general-purpose browser audio playback library. Used in games, music apps, and anything that needs reliable cross-browser sound.
- **GitHub stars:** ~23K
- **npm:** https://www.npmjs.com/package/howler

### `expo-av`
- **Weekly downloads:** ~390K–560K (depending on version snapshot; heavily tied to Expo release cycles)
- **What it is:** Expo's official audio/video SDK for React Native. Covers recording, playback, and streaming on iOS and Android.
- **Why it matters:** The de facto standard for audio in Expo-based React Native apps. Huge install base because it ships with the Expo ecosystem.
- **npm:** https://www.npmjs.com/package/expo-av

### `react-native-video`
- **Weekly downloads:** ~370K–440K
- **What it is:** Video (and audio) playback component for React Native. Broad format support, maintained by TheWidlarzGroup.
- **Why it matters:** Most popular native video/audio player for bare React Native. Often pulled in for music streaming apps that also display video.
- **npm:** https://www.npmjs.com/package/react-native-video

### `music-metadata`
- **Weekly downloads:** ~2.5M (version 11.12.3 per socket.dev snapshot — this is the standout number)
- **What it is:** Streaming metadata parser for Node.js. Reads ID3v1/v2, APEv2, Vorbis, iTunes/MP4 tags, FLAC, WAV, AIFF, OGG, and more. Extracts title, artist, album, duration, bitrate, cover art.
- **Why it matters:** The go-to server-side metadata extractor. Massive downloads likely driven by music servers, media scanners, and tooling (e.g., Jellyfin, Navidrome, Beets integrations).
- **GitHub stars:** ~1.2K
- **npm:** https://www.npmjs.com/package/music-metadata

---

## Tier 2 — Strong Packages (50K–500K weekly downloads)

Highly specialized but well-established with real production usage.

### `amplitude-js` / `amplitudejs`
- **Weekly downloads:** ~620K (amplitude-js); amplitudejs varies separately
- **Note:** `amplitude-js` is Amplitude Analytics' SDK — not a music library despite the name. Do not confuse with `amplitudejs` (the HTML5 audio player). The analytics SDK dominates the download count.
- **`amplitudejs` (the music player):** Much smaller — niche
- **npm:** https://www.npmjs.com/package/amplitude-js | https://www.npmjs.com/package/amplitudejs

### `expo-audio`
- **What it is:** The newer, lower-level audio API from Expo replacing portions of expo-av for audio-only use cases.
- **npm:** https://www.npmjs.com/package/expo-audio

### `react-native-sound`
- **Weekly downloads:** ~125K
- **What it is:** Simple audio playback for React Native. Older library, broadly considered legacy now.
- **Why it matters:** Still widely installed in older codebases. Not recommended for new projects.
- **npm:** https://www.npmjs.com/package/react-native-sound

### `react-native-track-player`
- **Weekly downloads:** ~32K–36K
- **What it is:** Full-featured audio player built for music apps in React Native. Background playback, lock screen controls, Android Auto/CarPlay, queue management, caching, preloading. Built on the New Architecture.
- **Why it matters:** The premium choice for dedicated music streaming apps in React Native. Purpose-built for music UX.
- **npm:** https://www.npmjs.com/package/react-native-track-player
- **Docs:** https://rntp.dev

### `react-h5-audio-player`
- **Weekly downloads:** ~90K
- **What it is:** Customizable React audio player component with time indicators, keyboard support, MediaSource Extensions (MSE), and TypeScript types.
- **Why it matters:** Best-maintained dedicated React audio player UI component. Drop-in for web music players.
- **npm:** https://www.npmjs.com/package/react-h5-audio-player

### `lamejs`
- **Weekly downloads:** ~110K
- **What it is:** MP3 encoder written in JavaScript (port of LAME). Used for in-browser audio recording and encoding.
- **Why it matters:** Many recording/music tools encode to MP3 on the client side before upload. This is the standard way to do it.
- **npm:** https://www.npmjs.com/package/lamejs

### `wavesurfer.js`
- **Weekly downloads:** ~500K (latest versions; older package listing shows lower)
- **What it is:** Interactive audio waveform visualization. Renders waveform on canvas, supports zoom, regions, markers, plugins (spectrogram, timeline, microphone, envelope).
- **Why it matters:** Default choice for podcast players, audio editors, music streaming UIs that show waveforms.
- **Latest version:** 7.x
- **GitHub stars:** ~8K
- **npm:** https://www.npmjs.com/package/wavesurfer.js

---

## Tier 3 — Specialist Packages (5K–50K weekly downloads)

Purpose-built for specific music software problems. High signal-to-noise for an SDK building in this space.

### `tone`
- **Weekly downloads:** ~23K–600K (widely varying — PkgPulse reports ~600K for the broader ecosystem; npm registry snapshot shows ~23K for the package itself)
- **What it is:** Web Audio framework for making interactive music in the browser. Provides schedulers, synthesizers, effects chains, transport/timeline control, and audio graph management.
- **Why it matters:** The most capable music programming library in the JS ecosystem. Used for generative music, DAW-like web apps, music education tools, and live coding.
- **GitHub stars:** ~13.6K
- **npm:** https://www.npmjs.com/package/tone
- **Docs:** https://tonejs.github.io

### `tonal`
- **Weekly downloads:** not clearly published; 50 dependent projects in registry
- **What it is:** Functional music theory library in TypeScript. Notes, intervals, chords, scales, modes, keys — all pure functions. Published as a monorepo of sub-packages (`@tonaljs/*`).
- **Why it matters:** The standard music theory computation library. No DOM dependency, works in Node and browser. Essential for anything that reasons about musical structure.
- **Latest version:** 6.4.3
- **npm:** https://www.npmjs.com/package/tonal

### `@tonejs/midi`
- **Weekly downloads:** ~14.5K
- **What it is:** Converts binary MIDI files into JSON (and back). Built on `midi-file`. Tone.js-friendly output format.
- **npm:** https://www.npmjs.com/package/@tonejs/midi

### `midi-writer-js`
- **Weekly downloads:** ~6.3K
- **What it is:** API for generating MIDI files programmatically — tracks, notes, velocity, timing.
- **npm:** https://www.npmjs.com/package/midi-writer-js

### `webmidi`
- **Weekly downloads:** ~4.5K–9K
- **What it is:** WEBMIDI.js — makes Web MIDI API accessible in browsers and Node.js. Handles device input/output, note on/off, CC messages, pitch bend, SysEx.
- **Why it matters:** The best abstraction over the browser Web MIDI API. Used in hardware-connected music apps.
- **npm:** https://www.npmjs.com/package/webmidi

### `meyda`
- **What it is:** Real-time audio feature extraction. Computes RMS, spectral centroid, ZCR, MFCCs, chroma, loudness, and 50+ other features from Web Audio nodes or offline buffers.
- **Why it matters:** Go-to for audio analysis, music recommendation features, and anything ML-adjacent working with audio in JS.
- **npm:** https://www.npmjs.com/package/meyda

### `audiomotion-analyzer`
- **Weekly downloads:** ~7.5K
- **What it is:** High-resolution real-time spectrum analyzer. Logarithmic/linear/perceptual frequency scales, up to 240 bands, dual-channel, no dependencies.
- **npm:** https://www.npmjs.com/package/audiomotion-analyzer

### `abcjs`
- **Weekly downloads:** ~6.6K–16.6K (range across sources)
- **What it is:** Renders ABC music notation to SVG in the browser. Also plays back notation via Web Audio API (no MIDI device needed).
- **npm:** https://www.npmjs.com/package/abcjs

### `vexflow`
- **What it is:** TypeScript library for rendering music notation and guitar tablature in SVG/Canvas.
- **33 dependent packages** in the npm registry.
- **npm:** https://www.npmjs.com/package/vexflow

### `spotify-web-api-node`
- **Weekly downloads:** ~15K–67K (range across sources; package is community-maintained, not official)
- **What it is:** Node.js wrapper for the Spotify Web API. Auth options, all endpoints covered.
- **Note:** Spotify published their own official TypeScript SDK in 2023: `@spotify/web-api-ts-sdk`. Migration toward the official one is happening.
- **npm:** https://www.npmjs.com/package/spotify-web-api-node

### `@spotify/web-api-ts-sdk`
- **What it is:** Official Spotify TypeScript SDK. Full type safety, OAuth 2.1 + PKCE, all API endpoints.
- **Latest version:** 1.2.0 (published ~2 years ago — limited recent maintenance)
- **npm:** https://www.npmjs.com/package/@spotify/web-api-ts-sdk

### `realtime-bpm-analyzer`
- **What it is:** Dependency-free in-browser BPM/tempo detection from audio/video nodes or any stream. Runs via Web Audio API.
- **Latest version:** 5.0.0
- **npm:** https://www.npmjs.com/package/realtime-bpm-analyzer

### `pitchfinder`
- **What it is:** Pitch detection algorithms for JS — YIN, McLeod, AMDF, Dynamic Wavelet. Works in browser and Node.
- **npm:** https://www.npmjs.com/package/pitchfinder

---

## Tier 4 — Niche / Low-Volume but Relevant

These have low weekly downloads but are worth knowing about for specific problems.

| Package | Downloads | Notes |
|---|---|---|
| `peaks.js` | low (~hundreds/week) | BBC's waveform UI component. Zoomable overview + detail views. Used in professional broadcast tooling. |
| `music-metadata-browser` | moderate | Browser-compatible build of `music-metadata`. |
| `standardized-audio-context` | moderate | Cross-browser Web Audio API wrapper. Drop-in replacement for `AudioContext`/`OfflineAudioContext`. Used in Tone.js internally. |
| `easymidi` | small | Simple event-based MIDI messaging for Node.js. 38 dependents. Wraps `node-midi`. |
| `pizzicato` | ~427/week | Web Audio effects and sound manipulation. Largely unmaintained. |
| `soundmanager2` | near-zero | Last published 2017. Legacy Flash-era library. Ignore for new projects. |
| `supercolliderjs` | niche | Node.js client for the SuperCollider synthesis server. Very specialized. |
| `bpm-detective` | small | Web Audio BPM detection. Simple API. |

---

## Key Observations

**The metadata surprise.** `music-metadata` at ~2.5M weekly downloads is likely the most-downloaded purely music-focused package in npm. Most developers don't know about it because it's a server-side tool, not a UI component. If you're building anything that ingests audio files, this is table stakes.

**react-player dominates on the web, expo-av dominates mobile.** These are not music-specific but are the most commonly used players in music streaming applications. High download counts reflect ecosystem lock-in (Expo) and convenience (React).

**howler vs tone are not interchangeable.** Howler is about playback reliability — play sounds, don't worry about browsers. Tone is about music programming — synthesis, scheduling, effects, generative composition. They solve different problems. Both are mature and battle-tested.

**The MIDI landscape is fragmented.** No single MIDI package dominates. `@tonejs/midi` leads for file parsing (14.5K/week), `webmidi` leads for hardware device access, and `midi-writer-js` is common for programmatic MIDI generation. All three solve different sub-problems.

**Music theory computation is unsolved for most devs.** `tonal` is the best library in this space but has relatively low awareness outside music-focused developer communities. If your SDK exposes any music theory primitives (key, scale, chord), tonal is the natural integration point.

**React Native music apps have a clear winner.** `react-native-track-player` is the only RN library purpose-built for music streaming — background playback, lock screen controls, caching, queue. `expo-av` and `react-native-sound` are general playback tools, not music-app tools.

**Spectrum analysis and visualization are under-served.** `audiomotion-analyzer` (7.5K/week), `meyda` (feature extraction), and `wavesurfer.js` (waveform UI) together form the visualization/analysis stack but none have massive download counts. This space has room.

---

## Sources

- https://www.pkgpulse.com/guides/howler-vs-tone-js-vs-wavesurfer-web-audio-javascript-2026
- https://npmtrends.com/howler-vs-soundjs-vs-tone
- https://npmtrends.com/amplitudejs-vs-howler-vs-pizzicato-vs-react-wavesurfer-vs-soundjs-vs-tone
- https://npmtrends.com/react-player
- https://npmtrends.com/expo-av
- https://npmtrends.com/react-native-track-player
- https://snyk.io/advisor/npm-package/music-metadata
- https://snyk.io/advisor/npm-package/webmidi
- https://snyk.io/advisor/npm-package/abcjs
- https://npm-compare.com/expo-av,react-native-sound,react-native-track-player
- https://www.npmjs.com/package/howler
- https://www.npmjs.com/package/tone
- https://www.npmjs.com/package/wavesurfer.js
- https://www.npmjs.com/package/music-metadata
- https://www.npmjs.com/package/tonal
- https://www.npmjs.com/package/react-player
- https://www.npmjs.com/package/react-native-track-player
- https://www.npmjs.com/package/lamejs
- https://www.npmjs.com/package/meyda
- https://www.npmjs.com/package/audiomotion-analyzer
- https://www.npmjs.com/package/abcjs
- https://www.npmjs.com/package/peaks.js
- https://bestofjs.org/projects?tags=audio
