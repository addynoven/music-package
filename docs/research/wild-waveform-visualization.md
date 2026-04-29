# Audio Waveform Generation, Visualization & Analysis — NPM Research

Research conducted April 2026. Download figures are weekly unless noted. Treat all numbers as directionally accurate — they vary across npm registry snapshots, Snyk, Socket.dev, and npmtrends.

---

## The Ecosystem in One Paragraph

There is no single "do everything" package here. The space splits cleanly into three tiers: **server-side peak extraction** (generating the raw min/max amplitude arrays from audio files), **frontend visualization** (rendering those arrays as waveforms in the browser), and **loudness/analysis** (LUFS measurement, ReplayGain, spectrogram generation). The BBC's `audiowaveform` binary + `waveform-data.js` is the production-grade backbone for the first two. `wavesurfer.js` dominates the frontend. Everything else is either specialized (spectrogram, loudness) or lighter-weight alternatives.

---

## Section 1 — Server-Side Peak Extraction

These run in Node.js, consume audio files, and output waveform data (arrays of min/max amplitude values at intervals).

---

### `audiowaveform` (BBC — C++ binary, not an npm package)

- **What it is:** A compiled C++ command-line tool from BBC R&D. It reads MP3, WAV, FLAC, Ogg Vorbis, or Opus and emits waveform data in binary `.dat` or JSON format.
- **Why it matters:** This is the reference implementation. Every serious Node.js waveform pipeline uses it as the backend processor — peaks.js was designed around its output format.
- **Node.js role:** Not an npm package. You install it as a system binary (`apt install audiowaveform` on Ubuntu / via Homebrew on macOS) and call it from Node.js via `child_process.exec`, a task queue, or a build pipeline.
- **Output formats:**
  - Binary `.dat` — compact, preferred for serving over HTTP
  - JSON — human-readable, easy to consume directly

**JSON format example:**
```json
{
  "version": 2,
  "channels": 2,
  "sample_rate": 48000,
  "samples_per_pixel": 512,
  "bits": 8,
  "length": 3,
  "data": [-65, 63, -66, 64, -40, 41, -39, 45, -55, 43, -55, 44]
}
```

**Typical pipeline command:**
```bash
# Binary (preferred — smaller)
audiowaveform -i track.mp3 -o track.dat -b 8 -z 256

# JSON (easier to serve as API response)
audiowaveform -i track.mp3 -o track.json --pixels-per-second 20 --bits 8
```

- **GitHub:** https://github.com/bbc/audiowaveform
- **Used by:** BBC World Service Radio Archive, peaks.js, any serious music platform needing pre-computed waveforms

---

### `waveform-data` (BBC npm package)

- **npm:** `waveform-data`
- **What it is:** JavaScript library that consumes waveform data produced by `audiowaveform` OR generates it client-side via the Web Audio API. The companion JS library to the C++ tool above.
- **Node.js support:** Yes — CommonJS build at `dist/waveform-data.cjs.js`. You can load `.dat` or `.json` files, resample, and serve from an Express endpoint.
- **Browser support:** Yes — same API, with Web Audio path for in-browser generation.

**Core API:**
```javascript
import WaveformData from 'waveform-data';

// From a JSON file (Node.js server)
const waveform = WaveformData.create(jsonData);

// Resample to a target pixel width
const resampled = waveform.resample({ width: 800 });

// Get amplitude arrays for rendering
const channel = resampled.channel(0);
const minArray = channel.min_array(); // Float32Array
const maxArray = channel.max_array(); // Float32Array

// Generate from audio in browser using Web Audio API
WaveformData.createFromAudio({ audioContext, arrayBuffer }, (err, waveform) => {
  // waveform ready
});
```

- **Key methods:** `create()`, `createFromAudio()`, `channel(n)`, `resample({ width })`, `max_sample(i)`, `min_sample(i)`, `max_array()`, `min_array()`
- **GitHub:** https://github.com/bbc/waveform-data.js
- **npm:** https://www.npmjs.com/package/waveform-data

---

### `audio-decode`

- **npm:** `audio-decode`
- **Version:** 3.6.0 (April 2026)
- **What it is:** Decodes audio to raw PCM samples in Node.js and the browser — no ffmpeg, no native bindings, pure JS/WASM.
- **Supported formats:** MP3, WAV, OGG Vorbis, FLAC, Opus, M4A/AAC, QOA, AIFF, CAF, WebM, AMR, WMA (13 formats)
- **Node.js support:** Yes — same API in Node and browser
- **Why it matters for peak extraction:** Gives you `channelData` (Float32Array per channel) directly. You iterate it yourself to build min/max peak arrays. No system dependency required — good for serverless/containerized environments where you can't install `audiowaveform`.

**API:**
```javascript
import decode from 'audio-decode';

const { channelData, sampleRate, numberOfChannels } = await decode(audioBuffer);
// channelData[0] is Float32Array of raw PCM samples for channel 0

// Manual peak extraction from decoded PCM
function extractPeaks(channelData, targetSamples) {
  const blockSize = Math.floor(channelData.length / targetSamples);
  const peaks = { min: new Float32Array(targetSamples), max: new Float32Array(targetSamples) };
  for (let i = 0; i < targetSamples; i++) {
    let min = Infinity, max = -Infinity;
    for (let j = 0; j < blockSize; j++) {
      const sample = channelData[i * blockSize + j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    peaks.min[i] = min;
    peaks.max[i] = max;
  }
  return peaks;
}
```

- **Tradeoff vs audiowaveform:** No system binary needed, but you write the peak extraction loop yourself, and WASM startup overhead is non-trivial for high-throughput batch processing.
- **GitHub:** https://github.com/audiojs/audio-decode

---

### `ffmpeg-peaks`

- **npm:** `ffmpeg-peaks`
- **What it is:** Generates waveform peak data from audio files using ffmpeg. Node.js only.
- **System dependency:** ffmpeg must be installed
- **Stars:** 27 (small, niche)
- **API:**
```javascript
const ffmpegPeaks = require('ffmpeg-peaks');
const fp = new ffmpegPeaks({ width: 800, precision: 2, numOfChannels: 1, sampleRate: 44100 });

// Accepts local file path or HTTP URL
fp.getPeaks('./track.mp3', (err, peaks) => {
  console.log(peaks); // JSON peak data
});
```
- **Status:** Low activity, small community. Use `audio-decode` or the audiowaveform pipeline instead unless you have specific ffmpeg requirements.
- **GitHub:** https://github.com/t4nz/ffmpeg-peaks
- **npm:** https://www.npmjs.com/package/ffmpeg-peaks

---

### `waveform-node`

- **npm:** `waveform-node`
- **Version:** 0.3.1
- **Weekly downloads:** ~52
- **What it is:** Node.js audio waveform generator via ffmpeg.
- **Status:** Effectively abandoned — no meaningful activity, 52 weekly downloads. Mentioned only for completeness. Do not use in new projects.
- **npm:** https://www.npmjs.com/package/waveform-node

---

### `waveform-data-generator` (chrisweb)

- **npm:** Not published — GitHub only
- **What it is:** Node.js/ffmpeg-based waveform peak generator with both a CLI and a web interface.
- **Use case:** Dev tooling / one-off generation rather than a runtime library.
- **GitHub:** https://github.com/chrisweb/waveform-data-generator

---

### `node-web-audio-api`

- **npm:** `node-web-audio-api`
- **Stars:** 248
- **What it is:** Node.js bindings for a Rust implementation of the Web Audio API specification. Uses NAPI-RS with prebuilt binaries.
- **Node.js support:** Node-only (not browser). Provides `AudioContext`, `OfflineAudioContext`, `AudioBuffer`, and all standard Web Audio nodes.
- **Why it matters:** Lets you use `OfflineAudioContext` server-side for peak extraction — the same code pattern you'd write in the browser, but running in Node without a DOM. Useful for teams that want code symmetry between client and server.
- **Peak extraction pattern:**
```javascript
import { OfflineAudioContext } from 'node-web-audio-api';
import { readFileSync } from 'fs';

const audioData = readFileSync('./track.mp3');
const ctx = new OfflineAudioContext(2, 44100 * 60, 44100); // 60s stereo
const audioBuffer = await ctx.decodeAudioData(audioData.buffer);

// audioBuffer.getChannelData(0) → Float32Array of PCM samples
```
- **Tradeoff:** Requires native compilation (prebuilt binaries help), and the Rust audio engine won't support every exotic format. Solid choice for MP3/WAV/FLAC.
- **GitHub:** https://github.com/ircam-ismm/node-web-audio-api

---

## Section 2 — Frontend Waveform Visualization

These run in the browser. They consume pre-generated peak arrays (from the server-side tools above) or decode audio themselves client-side.

---

### `wavesurfer.js` — The Dominant Choice

- **npm:** `wavesurfer.js`
- **Version:** 7.12.6 (April 2026)
- **GitHub stars:** 10.2k
- **What it is:** Interactive waveform rendering and audio playback. Renders into a Shadow DOM, full TypeScript support, no external dependencies.
- **Browser-only:** Yes. Uses Web Audio API and Canvas/SVG. Not usable in Node.js directly.
- **Official plugins (v7):**
  - `Regions` — clickable overlays, loop regions, markers
  - `Timeline` — time labels under the waveform
  - `Minimap` — scrollable overview bar
  - `Envelope` — fade-in/fade-out visual envelope
  - `Record` — live microphone recording
  - `Spectrogram` — frequency spectrogram rendering
  - `Hover` — cursor with timestamp

**Basic usage:**
```javascript
import WaveSurfer from 'wavesurfer.js';

const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#4F4A85',
  progressColor: '#383351',
  url: '/api/audio/track.mp3',
});
```

**With pre-decoded peaks (recommended for large files):**
```javascript
// peaks: Array<Float32Array>, one per channel
const ws = WaveSurfer.create({
  container: '#waveform',
  url: '/audio/track.mp3',
  peaks: [leftChannelPeaks, rightChannelPeaks],
  duration: 240, // seconds — required when supplying peaks without decoding
});

// Or via load()
ws.load('/audio/track.mp3', [leftPeaks, rightPeaks], 240);
```

**Important caveat:** Wavesurfer decodes audio entirely in the browser using Web Audio API. For files over a few minutes, browser memory constraints can cause decoding failures. Always pre-compute peaks server-side for production music streaming apps.

- **React integration:** `@wavesurfer/react` — official package with hooks and props-based wavesurfer options.
- **npm:** https://www.npmjs.com/package/wavesurfer.js
- **Docs:** https://wavesurfer.xyz

---

### `peaks.js` (BBC) — For Complex Editing UIs

- **npm:** `peaks.js`
- **GitHub stars:** 3.4k
- **What it is:** BBC R&D's full waveform interaction component. Built for audio editing workflows — zooming, scrolling, segment markers, point markers. More feature-complete than wavesurfer for editing use cases.
- **Browser-only:** Yes. Requires `konva` and `waveform-data` as peer dependencies.
- **Best fit:** When users need to create/edit clips, cue points, or segments on a waveform (podcast editors, broadcast tools, DAW-like interfaces).

**Initialization:**
```javascript
import Peaks from 'peaks.js';

Peaks.init({
  zoomview: { container: document.getElementById('zoomview-container') },
  overview: { container: document.getElementById('overview-container') },
  mediaElement: document.getElementById('audio'),
  // Option A: pre-computed data from audiowaveform
  dataUri: {
    arraybuffer: '/waveforms/track.dat',
    json: '/waveforms/track.json',
  },
  // Option B: compute in browser
  webAudio: { audioContext: new AudioContext() },
}, (err, peaksInstance) => {
  if (err) return console.error(err);
  peaksInstance.segments.add({ startTime: 10, endTime: 20, label: 'Chorus' });
});
```

- **Waveform data source:** Works best with pre-computed `.dat` files from `audiowaveform`. Binary format reduces bandwidth significantly for long tracks.
- **npm:** https://www.npmjs.com/package/peaks.js

---

### `audioMotion-analyzer` — Real-Time Spectrum Analyzer

- **npm:** `audiomotion-analyzer`
- **Version:** 4.5.4 (January 2026)
- **GitHub stars:** 908
- **Bundle size:** ~30KB minified
- **Dependencies:** Zero
- **What it is:** Real-time frequency spectrum analyzer. Not a static waveform renderer — this shows live FFT frequency data as audio plays. Logarithmic/linear/Bark/Mel scales, octave bands, LED bar effects, radial modes, retina/HiDPI support.
- **Browser-only:** Yes. Uses Web Audio API and Canvas.
- **License:** AGPL-3.0 (important — check license compatibility for commercial projects)

**Usage:**
```javascript
import AudioMotionAnalyzer from 'audiomotion-analyzer';

const audioMotion = new AudioMotionAnalyzer(document.getElementById('container'), {
  source: audioElement,
  height: 300,
  mode: 6,           // 1/6th octave bands
  barSpace: 0.1,
  gradient: 'rainbow',
  showScaleX: true,
  reflexRatio: 0.3,  // reflection effect
});
```

- **npm:** https://www.npmjs.com/package/audiomotion-analyzer

---

## Section 3 — Spectrogram Generation

Spectrograms map frequency over time (frequency on Y-axis, time on X-axis, amplitude as color). Different from waveform peaks — they require STFT/FFT computation.

---

### `spectrogram` (npm package)

- **npm:** `spectrogram`
- **What it is:** Renders an audio spectrogram to an HTML canvas. Customizable color mapping.
- **Browser-only:** Uses canvas API. Primarily browser-targeted.
- **Status:** Low download volume. Simple implementation.
- **npm:** https://www.npmjs.com/package/spectrogram

---

### wavesurfer.js Spectrogram Plugin

- **What it is:** Official `wavesurfer.js` plugin (ships with the package). Renders a spectrogram below the waveform using Web Audio `AnalyserNode`.
- **Why prefer it:** If you're already using wavesurfer, use this. Zero additional dependencies, consistent with the rest of the visualization stack.
- **Browser-only:** Yes.

```javascript
import WaveSurfer from 'wavesurfer.js';
import SpectrogramPlugin from 'wavesurfer.js/dist/plugins/spectrogram.js';

const ws = WaveSurfer.create({
  container: '#waveform',
  url: '/audio/track.mp3',
  plugins: [
    SpectrogramPlugin.create({
      container: '#spectrogram',
      labels: true,
      height: 200,
      frequencyMax: 8000,
    }),
  ],
});
```

---

### Node.js Spectrogram Options

For server-side spectrogram image generation (e.g., generating a PNG to store/serve):

- **`spectro`** (GitHub: `mmende/spectro`) — Clustered Node.js module that creates spectrograms from PCM audio data using worker processes for performance. Not published to npm, GitHub-only.
- **`wav-spectrogram`** (`npm: wav-spectrogram`) — Node.js library for loading WAV files and drawing a spectrogram to canvas. Limited format support (WAV only).
- **FFmpeg approach:** `ffmpeg -i input.mp3 -filter_complex showspectrumpic=s=1280x512:color=intensity spectrogram.png` — often the most practical server-side solution. No npm dependency required.

For the SDK's use case (generating spectrogram images at ingest time), the FFmpeg filter approach is the most robust and format-agnostic option.

---

## Section 4 — Loudness Normalization (ReplayGain / EBU R128)

---

### Standards Primer

- **EBU R128 / ITU-R BS.1770** — The broadcast standard. Measures loudness in **LUFS** (Loudness Units relative to Full Scale). Target: -23 LUFS for broadcast, -14 LUFS for streaming (Spotify/Apple Music target).
- **ReplayGain** — Older per-track dB adjustment tag. ReplayGain 2.0 targets -18 LUFS.
- **True Peak** — Maximum inter-sample peak (important for codec headroom). EBU R128 specifies -1 dBTP max.
- In practice for streaming: measure integrated loudness, compute a gain adjustment, store it as a tag. Apply at playback time.

---

### `music-metadata` — Reading Existing Gain Tags

- **npm:** `music-metadata`
- **Version:** 8.x (ESM-only)
- **Weekly downloads:** ~2.5M (documented in `npm-wild-find.md`)
- **What it is:** The go-to metadata parser for Node.js. Reads ReplayGain tags, EBU R128 stored loudness, and all common tag formats.
- **Node.js + browser:** Both supported.

**Reading gain tags:**
```javascript
import { parseFile } from 'music-metadata';

const metadata = await parseFile('./track.mp3');
const trackGain = metadata.format.trackGain;   // number | undefined (dB)
const albumGain = metadata.format.albumGain;   // number | undefined (dB)
const replayGainTrackPeak = metadata.format.replayGainTrackPeak;
```

- **npm:** https://www.npmjs.com/package/music-metadata

---

### `@domchristie/needles` — Browser EBU R128 Measurement

- **npm:** `@domchristie/needles`
- **What it is:** Browser-only EBU R128 / ITU-R BS.1770-4 compliant loudness metering. Measures momentary, short-term, and integrated LUFS in real-time from Web Audio sources. Also supports offline file analysis.
- **Browser-only:** Yes. Uses Web Audio API (ScriptProcessorNode currently; AudioWorklet planned).
- **Does not normalize:** Measures loudness only — you compute the gain adjustment yourself.

**Usage:**
```javascript
import { LoudnessMeter } from '@domchristie/needles';

const meter = new LoudnessMeter({
  source: audioSourceNode,         // Web Audio AudioNode
  workerUri: 'needles-worker.js',
});

meter.on('dataavailable', (event) => {
  // event.data.mode: 'momentary' | 'short-term' | 'integrated'
  // event.data.value: number (LUFS)
  if (event.data.mode === 'integrated') {
    const gainAdjustment = -14 - event.data.value; // dB to reach -14 LUFS target
  }
});

meter.start();
```

- **GitHub:** https://github.com/domchristie/needles
- **npm:** https://www.npmjs.com/package/@domchristie/needles

---

### `ebur128-wasm` — Cross-Platform EBU R128 (WASM)

- **npm:** `ebur128-wasm`
- **What it is:** Bundles the Rust `ebur128` crate compiled to WASM. Provides EBU R128 loudness analysis in both Node.js and browser without native bindings.
- **Node.js + browser:** Both supported.
- **Why it matters:** The WASM approach sidesteps native compilation issues (unlike `node-groove`). Suitable for serverless/containerized environments.
- **npm:** https://www.npmjs.com/package/ebur128-wasm

---

### `groove` (node-groove) — Full Loudness Pipeline, Node.js

- **npm:** `groove`
- **GitHub stars:** 161
- **What it is:** Node.js bindings to `libgroove` — a generic music player backend C library. Provides full loudness detection (LUFS + true peak), ReplayGain computation, and volume adjustment utilities.
- **Node.js only:** Yes. Native C++ bindings, requires `libgroove >= 5.0.0` to be installed.
- **Key API for loudness:**
```javascript
const groove = require('groove');

const player = groove.createPlayer();
const loudnessDetector = groove.createLoudnessDetector();

loudnessDetector.on('info', (info) => {
  const lufs = info.loudness;
  const truePeak = info.peak;
  const replayGain = groove.loudnessToReplayGain(lufs); // dB adjustment
  const gainFloat = groove.dBToFloat(replayGain);        // float multiplier
});
```
- **Tradeoff:** `libgroove` is a native system dependency that must be installed — adds complexity to deployment. Better for a local processing daemon than a containerized API.
- **GitHub:** https://github.com/andrewrk/node-groove

---

### `ffmpeg-normalize` — Batch Normalization Tool

- **npm:** `ffmpeg-normalize`
- **What it is:** CLI tool (also usable as a Node.js library) that normalizes audio loudness using FFmpeg's EBU R128 filter. Two-pass measurement + normalization. Supports writing loudness tags back to files.
- **Best fit:** Offline batch normalization of audio files (at ingest time), not real-time measurement.
- **Node.js + CLI:** Both — can be required as a module or run via `npx ffmpeg-normalize`.
- **npm:** https://www.npmjs.com/package/ffmpeg-normalize

---

## Section 5 — Comparison Tables

### Server-Side Peak Extraction

| Package | Approach | Node.js | No System Deps | Formats | Maintenance |
|---------|----------|---------|----------------|---------|-------------|
| `audiowaveform` (C++) | Native binary | via child_process | No (binary) | MP3, WAV, FLAC, OGG, Opus | Active (BBC) |
| `audio-decode` | JS/WASM | Yes | Yes | 13 formats | Active (v3.6, Apr 2026) |
| `node-web-audio-api` | Rust/NAPI | Node-only | Prebuilt binaries | Via Rust audio engine | Active |
| `ffmpeg-peaks` | ffmpeg wrapper | Yes | No (ffmpeg) | All ffmpeg formats | Low activity |
| `waveform-node` | ffmpeg wrapper | Yes | No (ffmpeg) | All ffmpeg formats | Abandoned |

**Recommendation:** `audiowaveform` + `waveform-data` for production. `audio-decode` for serverless/no-system-deps environments. `node-web-audio-api` if you want Web Audio API code symmetry between client and server.

---

### Frontend Waveform Visualization

| Package | Type | Stars | Dependencies | License | Best For |
|---------|------|-------|--------------|---------|----------|
| `wavesurfer.js` | Playback + waveform | 10.2k | Zero | BSD-3-Clause | Music players, general use |
| `peaks.js` | Editing/interaction | 3.4k | konva, waveform-data | LGPL-2.1 | Clip editors, DAW-like UIs |
| `audiomotion-analyzer` | Live spectrum | 908 | Zero | AGPL-3.0 | Real-time visualizers |

**Recommendation:** `wavesurfer.js` for most music streaming use cases. `peaks.js` if users need to create clips or markers. `audioMotion-analyzer` for live spectrum/equalizer visuals — but check AGPL-3.0 license compatibility.

---

### Loudness Measurement

| Package | Standard | Environment | Native Deps | Measures | Normalizes |
|---------|----------|-------------|-------------|----------|------------|
| `@domchristie/needles` | EBU R128 | Browser only | No | LUFS (M/S/I) + True Peak | No |
| `ebur128-wasm` | EBU R128 | Node + Browser | No (WASM) | LUFS | No |
| `groove` | EBU R128 + ReplayGain | Node only | Yes (libgroove) | LUFS + True Peak | Provides gain value |
| `music-metadata` | Reads existing tags | Node + Browser | No | Reads stored ReplayGain/EBU tags | No |
| `ffmpeg-normalize` | EBU R128 | Node + CLI | Yes (ffmpeg) | LUFS (2-pass) | Yes (writes files) |

---

## Section 6 — Recommended Pipeline for MusicStream SDK

Given the SDK targets Node.js >= 22 and serves a music streaming use case:

### At Ingest Time (Server/Worker)

1. **Decode audio + extract peaks:** Run `audiowaveform` via `child_process` to generate a `.json` waveform file stored alongside the track. Binary `.dat` for serving to `peaks.js`; JSON for serving to `wavesurfer.js`.
2. **Loudness measurement:** Use `ffmpeg-normalize` in measurement-only mode (or `ebur128-wasm` for zero system deps) to measure integrated LUFS and store as a tag or in the database.
3. **Spectrogram (optional):** FFmpeg `showspectrumpic` filter to generate a PNG at ingest. No npm dependency needed.
4. **Read existing tags:** `music-metadata` to extract any ReplayGain tags already embedded in the file before overwriting.

### At Playback Time (Frontend)

1. **Waveform:** `wavesurfer.js` v7 with pre-decoded peaks fed from the server. Use `@wavesurfer/react` for the React integration.
2. **Live spectrum (optional):** `audioMotion-analyzer` — zero deps, but AGPL license means you either open-source the client or get a commercial license.
3. **Loudness normalization:** Apply stored gain adjustment at the `GainNode` level in Web Audio API — no npm package needed for playback-time normalization.

### Key Tradeoff to Decide

`audiowaveform` (C++ binary) vs `audio-decode` (pure JS/WASM):
- **audiowaveform:** Faster, better suited for bulk processing, produces the exact format peaks.js expects. Requires the binary to be installed in your deployment environment.
- **audio-decode:** Zero system deps, works in containers/serverless out of the box, but you write peak extraction yourself and WASM startup overhead matters at scale.

If you're running a persistent Node.js service (not serverless), go with `audiowaveform`. If you're on Vercel/Lambda/containerized with no system package access, `audio-decode` is the pragmatic choice.

---

## Sources

- [waveform-data npm](https://www.npmjs.com/package/waveform-data)
- [bbc/waveform-data.js GitHub](https://github.com/bbc/waveform-data.js/)
- [bbc/peaks.js GitHub](https://github.com/bbc/peaks.js/)
- [bbc/audiowaveform GitHub](https://github.com/bbc/audiowaveform)
- [wavesurfer.js official site](https://wavesurfer.xyz/)
- [katspaugh/wavesurfer.js GitHub](https://github.com/katspaugh/wavesurfer.js/)
- [hvianna/audioMotion-analyzer GitHub](https://github.com/hvianna/audioMotion-analyzer)
- [@domchristie/needles GitHub](https://github.com/domchristie/needles)
- [ebur128-wasm npm](https://www.npmjs.com/package/ebur128-wasm)
- [andrewrk/node-groove GitHub](https://github.com/andrewrk/node-groove)
- [ffmpeg-normalize npm](https://www.npmjs.com/package/ffmpeg-normalize)
- [music-metadata GitHub](https://github.com/Borewit/music-metadata)
- [audio-decode GitHub](https://github.com/audiojs/audio-decode)
- [ircam-ismm/node-web-audio-api GitHub](https://github.com/ircam-ismm/node-web-audio-api)
- [t4nz/ffmpeg-peaks GitHub](https://github.com/t4nz/ffmpeg-peaks)
- [@wavesurfer/react npm](https://www.npmjs.com/package/@wavesurfer/react)
- [spectrogram npm](https://www.npmjs.com/package/spectrogram)
- [audiomotion-analyzer npm](https://www.npmjs.com/package/audiomotion-analyzer)
