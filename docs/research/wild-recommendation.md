# Music Recommendation Research

Audio similarity, collaborative filtering, related songs, listening history analysis, genre classification — what exists, what works, and what you can actually use without a full ML stack.

---

## The Context: Why This Is Hard In JS/Node

Most serious recommendation infrastructure lives in Python (scikit-learn, PyTorch, Hugging Face). The JS ecosystem has pieces, not a full stack. That said, there's enough to build something genuinely good without shelling out to a Python service, especially if you're doing:

- Metadata/tag-based content filtering (fully doable in pure JS)
- Collaborative filtering on listening history (Redis-based, solid packages exist)
- Audio feature extraction for BPM/key/energy (Essentia.js or Meyda cover this)
- Fingerprint-based ID (Chromaprint + AcoustID, Node wrapper available)
- Cosine similarity / KNN over feature vectors (trivial JS math)

The hard part — deep neural audio embeddings, learned latent spaces — needs a pre-trained model. You can run those in JS via TensorFlow.js or ONNX Runtime, but model selection and quality is the work.

---

## Audio Feature Extraction

### Essentia.js
**npm:** `essentia.js`
**Source:** https://github.com/MTG/essentia.js

The heaviest hitter in JS audio analysis. Built by the Music Technology Group at UPF Barcelona — the same group behind Essentia C++, which is industry-grade MIR software. The JS version is compiled to WebAssembly via Emscripten.

What it gives you:
- BPM/tempo estimation
- Key and scale detection
- Loudness (EBU R128, ReplayGain)
- Danceability score (their own algorithm, similar concept to Spotify's)
- Energy, onset detection, beat tracking
- Mel-frequency cepstral coefficients (MFCCs) for fingerprinting/similarity
- Spectral features: centroid, flatness, rolloff

Runs in Node.js and browser. Supports offline batch analysis and real-time via Web Audio API. Published peer-reviewed paper: "Audio and Music Analysis on the Web using Essentia.js" (TISMIR 2021).

The `EssentiaModel` add-on also lets you load pre-trained TensorFlow.js models from the Essentia model zoo — genre classifiers, mood detectors, instrument detectors. These are production-quality models trained on large labeled datasets (Discogs, AcousticBrainz data).

**Size:** Large. WebAssembly binary is heavy. Not something you stream to a browser on every page load, but fine for a backend batch pipeline.

### Meyda
**npm:** `meyda`
**Source:** https://github.com/meyda/meyda

Lighter alternative to Essentia.js. Pure JS, no WASM. Works with Web Audio API or raw arrays.

Features: RMS, ZCR, spectral centroid, spectral flatness, spectral rolloff, MFCCs, chroma features, perceptual spread/sharpness. No BPM or key detection built in.

Good for: real-time feature extraction in a streaming pipeline. Published at IRCAM. MIT licensed.

~288 ops/sec on simultaneous feature extraction = roughly 3.4x real-time, so it can keep up with audio playback.

### music-tempo
**npm:** `music-tempo`

BPM detection using the Beatroot algorithm (Simon Dixon). Returns tempo in BPM and array of beat times. Pure JS. Works on decoded PCM audio.

### realtime-bpm-analyzer
**npm:** `realtime-bpm-analyzer`

Web Audio API BPM detection for real-time use. Feed it an audio stream, subscribe to BPM events.

### music-metadata
**npm:** `music-metadata`
**Source:** https://github.com/Borewit/music-metadata

Not audio analysis — metadata parsing. But critical for building a feature vector: it extracts embedded ID3/Vorbis/APE/iTunes tags including BPM, key, genre, year, ReplayGain, and more from MP3, FLAC, OGG, M4A, AIFF, WAV etc. Works in Node.js and browser. Actively maintained, ~4M weekly downloads. The go-to library for reading whatever the encoder baked in.

---

## Audio Fingerprinting & Identity

### stream-audio-fingerprint / @qgustavor/stream-audio-fingerprint
**npm:** `stream-audio-fingerprint`, `@qgustavor/stream-audio-fingerprint`
**Source:** https://github.com/adblockradio/stream-audio-fingerprint

Shazam-style landmark fingerprinting as a Node stream. Input: PCM audio. Output: a stream of fingerprint hashes. Based on the Wang 2003 Shazam paper and D. Ellis's MATLAB implementation.

Use case: deduplication, identifying re-uploaded tracks, detecting when two tracks are the same audio. Not for "similarity" — two songs that sound musically similar will have very different fingerprints.

The fork `@qgustavor/stream-audio-fingerprint` adds configurable fingerprinter options.

### node-fpcalc (Chromaprint / AcoustID)
**npm:** `node-fpcalc`
**Source:** https://github.com/parshap/node-fpcalc

Node.js wrapper around `fpcalc`, the Chromaprint CLI. Chromaprint generates an acoustic fingerprint that can be submitted to the AcoustID database (30M+ fingerprints) to get a MusicBrainz ID, which then gives you canonical metadata: artist, album, genre, ISRC, etc.

Requires `fpcalc` binary installed on the system. Good for tagging unknown files.

**AcoustID** is fully open source and the database is downloadable. Free API key for lookup. This is the foundation of MusicBrainz Picard's auto-tagging.

---

## Music Theory Utilities (for harmonic matching)

### tonal
**npm:** `tonal`
**Source:** https://github.com/tonaljs/tonal

The serious music theory library in JS. 20kb minified / 6kb gzipped. Functional, pure, TypeScript.

Covers: notes, intervals, scales, chords, keys, modes, MIDI, frequencies. Can detect what key/chord a set of notes implies. Useful for harmonic similarity: songs in the same key or harmonically related keys (circle of fifths distance) can be matched for smooth transitions.

### music-fns
**npm:** `music-fns`
**Source:** https://github.com/madewithlove/music-fns

Smaller utility set. Scale/mode detection, interval analysis, pentatonic/diatonic classification. Less comprehensive than tonal but lighter.

### teoria
**npm:** `teoria`
**Source:** https://github.com/saebekassebil/teoria

Older but functional. Note, chord, scale, interval objects. Less maintained than tonal.

---

## Collaborative Filtering

### raccoon (recommendationRaccoon)
**npm:** `raccoon` (original, unmaintained), `@maruware/raccoon` (maintained fork)
**Source:** https://github.com/guymorita/recommendationRaccoon

Collaborative filtering over Redis. Stores like/dislike events. Uses Jaccard coefficient for user-user similarity, then KNN to generate item recommendations. Simple, battle-tested approach.

**Original package:** last updated 2017. **`@maruware/raccoon`:** updated 2021. The Redis-based architecture is still perfectly valid — the math hasn't changed.

How it works:
1. User A likes tracks [1, 2, 3]. User B likes tracks [2, 3, 4].
2. Jaccard(A, B) = |intersection| / |union| = 2/4 = 0.5
3. Track 4 gets recommended to User A.

Requires Redis. No ML, no training, no model files. Scales horizontally.

### collaborative-filter
**npm:** `collaborative-filter`
**Source:** https://github.com/TSonono/collaborative-filtering

Lightweight memory-based collaborative filtering with Jaccard similarity. No database dependency. Feed it a user-item matrix, get recommendations back. Good for small-to-medium user bases or in-memory use.

### likely
**npm:** `likely`

Matrix-based collaborative filtering for Node.js. Takes a training matrix (rows = users, columns = items, values = ratings). After training, returns recommended items and estimated ratings. Supports both explicit ratings and implicit feedback.

### recommender
**npm:** `recommender`

TF-IDF, collaborative filtering, and global baseline approach in one package. Has both sync and async APIs. The async variants run in worker threads to avoid blocking the event loop.

### akin
**npm:** (check npm registry)
**Source:** https://github.com/bluehalo/akin

Collaborative filtering via MongoDB/Mongoose. Alternative to raccoon if you're already on MongoDB rather than Redis.

---

## Similarity Math / KNN

These are the primitives you'd use to build a content-based "related songs" system once you have feature vectors.

### ml-distance
**npm:** `ml-distance`
**Source:** https://github.com/mljs/ml

Part of the mljs family. Contains: cosine similarity, Euclidean, Manhattan, Chebyshev, Jaccard, Dice, and more. Active, maintained. The right pick if you want multiple distance metrics in one package.

### compute-cosine-similarity
**npm:** `compute-cosine-similarity`

Focused single-purpose: cosine similarity between two arrays. Tiny.

### vector-cosine-similarity
**npm:** `vector-cosine-similarity`

Same concept, explicitly described as working with high-dimensional vectors (e.g. OpenAI embedding dimensions). Useful if you're comparing pre-computed audio embeddings.

### ml-knn
**npm:** `ml-knn`
**Source:** https://github.com/mljs/knn

K-nearest neighbors classifier in JS. Part of mljs. Last version is 3.0.0, published ~7 years ago, but the algorithm is stable — KNN doesn't change. Pair it with ml-distance.

### The DIY Content-Based Pattern

Given a feature vector per song like:

```
{ bpm: 128, energy: 0.8, valence: 0.6, danceability: 0.9, key: 5, mode: 1, genre_vec: [0,1,0,0,...] }
```

You normalize to [0,1], compute cosine similarity against your catalog, take top-N. That's it. No model files, no training. Accuracy depends entirely on feature quality.

---

## Genre Classification

### Essentia Models (via essentia.js EssentiaModel)
The Essentia project provides pre-trained TensorFlow.js and ONNX models:
- **MAEST**: Music Audio Efficient Spectrogram Transformer. Trained to predict music style labels using Discogs metadata. Available in TFJS and ONNX formats.
- **MusiCNN**: CNN auto-tagger. Notably, research in 2025 showed MusiCNN *outperforms heavier architectures* like Jukebox and MERT for downstream recommendation tasks — more signal, less compute.
- Mood/genre models available at various sequence lengths (5–30s of audio).

### deepsound genre-recognition
**Source:** https://github.com/deepsound-project/genre-recognition

In-browser CNN for genre recognition rewritten to TensorFlow.js. 82% accuracy on the GTZAN dataset. Runnable entirely in the browser. Older project but shows the pattern is feasible.

### Pattern: ONNX Runtime in Node
`onnxruntime-node` lets you run any ONNX model in Node.js with hardware acceleration. The ONNX Model Zoo has migrated to Hugging Face (`onnxmodelzoo` org). If you find an audio classification model in ONNX format on HuggingFace, you can serve it from your Node backend without any Python.

---

## Listening History Analysis

There are no good turnkey npm packages for this — you build it yourself. But the algorithms are well understood.

### Signal Types

**Implicit signals (no user action required):**
- Play-through rate: completed vs. skipped. A skip before 30 seconds is a strong negative signal. Listen to completion is a strong positive.
- Repeat plays: likelihood of replaying a track grows up to ~10 plays, then slowly drops (Deezer research, 2025).
- Session adjacency: tracks listened to back-to-back are likely to have something in common.

**Explicit signals:**
- Likes, dislikes, playlist adds
- Shares

### What to track per play event

```ts
{
  userId: string,
  trackId: string,
  timestamp: number,
  playDurationMs: number,       // how long they actually listened
  trackDurationMs: number,      // total track length
  completionRatio: number,       // playDuration / trackDuration
  skippedAt?: number,            // ms into track when skipped
  source: 'autoplay' | 'search' | 'playlist' | 'manual',
  sessionId: string
}
```

### Deriving a Score

A simple implicit rating formula:
```
score = completionRatio * 1.0
      + (repeats > 0 ? 0.3 : 0)
      + (addedToPlaylist ? 0.5 : 0)
      - (skippedBefore5s ? 0.8 : 0)
      - (skippedBefore30s ? 0.4 : 0)
```

Then normalize to [0, 1]. Feed this into collaborative filtering as a rating matrix.

### Session-based pattern mining

Track sequences within sessions. If users who listen to track A frequently listen to track B next, that's a co-occurrence signal. Simple co-occurrence matrix + PMI (pointwise mutual information) can give strong "related tracks" suggestions from pure listening history without any audio analysis.

PMI formula: `log( P(A,B) / (P(A) * P(B)) )`

This is the core of how Spotify's "Taste Profile" radio worked before they added deep learning.

---

## External APIs & Data Sources

### Last.fm
**Docs:** https://www.last.fm/api

Free API with an API key. The `artist.getSimilar` and `track.getSimilar` endpoints return similar artists/tracks based on Last.fm's collaborative scrobble data — 30+ years of listening history from millions of users. Extremely high quality signal for "related artists."

Node wrappers:
- `scrobbles` (lmammino/scrobbles) — fetches listening history for a user as async iterator
- `scribble` — basic API wrapper with getSimilar, getInfo etc.

The similar artists data from Last.fm is arguably better than anything you'll compute yourself from audio features alone, and it's free.

### MusicBrainz
**Docs:** https://musicbrainz.org/doc/MusicBrainz_API

Open database with artist relationships, genre tags, ISRC codes, recording IDs. The `npm` ecosystem has several MB client wrappers (search `keywords:musicbrainz` on npm). Canonical IDs from MusicBrainz + Last.fm similar data = a solid metadata-based recommendation pipeline.

### AcoustID
**Docs:** https://acoustid.org/webservice

Free fingerprint lookup. Submit a Chromaprint fingerprint, get back a MusicBrainz recording ID. 30M+ fingerprints in the database. Open source, database downloadable. Free API key required, generous rate limits.

### AudD
**Docs:** https://docs.audd.io/

Shazam-style music recognition API with a Node.js-friendly REST interface. 300 free requests to start. Cheaper and simpler than ACRCloud. Returns track metadata including Apple Music and Spotify IDs for cross-reference.

### Cyanite.ai
**Docs:** https://api-docs.cyanite.ai/

Commercial API for AI-powered music tagging and similarity search. GraphQL interface. Gives you genre, mood, energy, BPM, key, plus semantic text search ("find songs that sound like a rainy afternoon"). No free tier — custom pricing. The quality is high because they've trained on large curated datasets. Relevant if you're building a feature that requires commercial-grade tagging and the audio analysis DIY path is too slow.

### The Spotify Audio Features Situation
Spotify deprecated its `/audio-features` and `/audio-analysis` endpoints in November 2024. New apps get 403 errors. Only apps that had a quota extension before Nov 27, 2024 still have access. This killed a huge number of recommendation projects that were built on Spotify's BPM/energy/valence/danceability scores.

Third-party workarounds have appeared (RapidAPI wrappers, dataset CSVs) but none are authoritative. If your pipeline needs these audio descriptors for existing catalog, you need to either extract them yourself (Essentia.js) or pay for a service like Soundcharts or Cyanite.

---

## State of the Art (What Spotify/Deezer Actually Do)

For context on where the ceiling is:

**2024-2025 research consensus:**
- Hybrid approaches (collaborative + content) beat pure-content or pure-CF
- MusiCNN auto-tagging embeddings outperform heavier models (Jukebox, MERT) in downstream recommendation — counterintuitive but confirmed in "Adopting State-of-the-Art Pretrained Audio Representations for Music Recommender Systems" (arxiv 2025)
- Session-based models (BERT4Rec adapted for music) are strong for next-track prediction
- LLMs for taste profile + recommendation are being explored but not production standard yet

**Playlist continuation** is the most studied problem. SIGIR 2023 showed a "represent-then-aggregate" architecture that scales to millions of tracks while staying competitive with Transformers.

**Fairness** is now a first-class concern: popularity-biased CF tends to surface US/English content disproportionately. LightGCN-style graph approaches show more geographic diversity.

---

## What's Realistic Without an ML Stack

### Tier 1: No model files, pure logic, works today

| Goal | Approach | Tools |
|------|----------|-------|
| Related songs | Metadata similarity (genre, year, BPM range, key) | `music-metadata`, `tonal`, cosine on feature vec |
| Artist radio | Last.fm `artist.getSimilar` + metadata filter | Last.fm API |
| Next track | Session co-occurrence matrix | Build yourself (Redis counters) |
| User recommendations | Collaborative filtering on play history | `raccoon` / `@maruware/raccoon` + Redis |
| Deduplication | Acoustic fingerprint match | `stream-audio-fingerprint` or `node-fpcalc` |
| Track identity | AcoustID lookup | `node-fpcalc` + AcoustID API |
| BPM / key detection | Audio analysis | `music-tempo`, `essentia.js` |

### Tier 2: Pre-trained model, no Python, no training

| Goal | Approach | Tools |
|------|----------|-------|
| Genre classification | Essentia TFJS/ONNX models | `essentia.js` + EssentiaModel |
| Mood tagging | Essentia mood models | same |
| Audio embeddings for similarity | MusiCNN features | `essentia.js` |
| KNN over embeddings | Vector similarity | `ml-distance`, `compute-cosine-similarity` |

### Tier 3: External API call, commercial or free

| Goal | Approach | Cost |
|------|----------|------|
| Similar artists / tracks | Last.fm API | Free |
| Track identity + metadata | AcoustID + MusicBrainz | Free |
| Full audio tagging + similarity | Cyanite.ai | Paid |
| Music recognition | AudD | 300 free then paid |

---

## Practical Recommendation for This SDK

The SDK already handles search and streaming across JioSaavn and YouTube Music. The natural places to layer in recommendation:

1. **Related songs from existing metadata**: JioSaavn and YouTube Music both return genre, language, mood tags on tracks. Build a cosine similarity function over a normalized feature vector from those tags + BPM if available. Zero external dependencies.

2. **Last.fm as a data backbone**: When a user plays an artist, hit `artist.getSimilar`. Last.fm's data is the result of 30 years of collaborative filtering at scale. Better than anything you'll compute locally. Free. Cache aggressively — similar artists doesn't change often.

3. **Implicit feedback pipeline**: Track play duration, completion ratio, skips per session. Derive a score. Use `@maruware/raccoon` or build a simple Redis sorted set per user of (trackId, score). This is the foundation for "more like what I've been listening to."

4. **BPM/key from audio for mixing**: If the use case involves DJ-style continuous playback, use `music-tempo` + `tonal` for harmonic matching. Songs in harmonically compatible keys with similar BPM will transition well.

5. **Do not extract audio features from arbitrary URLs client-side**: Essentia.js WebAssembly is heavy. Run audio feature extraction as a background job on your server when a new track enters your catalog.

---

## Key Papers

- Wang, A. (2003). *An industrial strength audio search algorithm* (Shazam paper) — basis for all landmark fingerprinting
- Ellis, D. (2009). *Robust Landmark-Based Audio Fingerprinting* — MATLAB reference implementation
- Correya et al. (2021). *Audio and Music Analysis on the Web using Essentia.js* — TISMIR
- Schedl et al. (2018). *Current challenges and visions in music recommender systems* — Springer MIR
- Meggetto et al. (2023). *A Scalable Framework for Automatic Playlist Continuation* — SIGIR
- arxiv:2604.23077 (2025). *Adopting State-of-the-Art Pretrained Audio Representations for Music Recommender Systems* — MusiCNN > Jukebox finding
- arxiv:2511.16478 (2025). *Music Recommendation with Large Language Models* — LLM taste profiles

---

## Package Summary

| Package | Purpose | Maintained |
|---------|---------|------------|
| `essentia.js` | Full audio analysis + ML models (WASM) | Yes (MTG Barcelona) |
| `meyda` | Real-time spectral features | Yes |
| `music-tempo` | BPM/beat detection | Stable |
| `realtime-bpm-analyzer` | Live BPM from Web Audio | Yes |
| `music-metadata` | Metadata parsing all formats | Yes (4M wkly DLs) |
| `stream-audio-fingerprint` | Shazam-style fingerprinting | Stable |
| `@qgustavor/stream-audio-fingerprint` | Fingerprinting (fork with options) | Active fork |
| `node-fpcalc` | AcoustID/Chromaprint wrapper | Stable |
| `tonal` | Music theory (key, chord, scale) | Yes |
| `music-fns` | Music notation utilities | Stable |
| `raccoon` / `@maruware/raccoon` | Collaborative filtering (Redis) | Fork active |
| `collaborative-filter` | In-memory collaborative filtering | Stable |
| `likely` | Matrix-based CF | Stable |
| `recommender` | TF-IDF + CF + baseline | Stable |
| `ml-distance` | Distance metrics (cosine, Jaccard, etc) | Yes (mljs org) |
| `compute-cosine-similarity` | Single-purpose cosine sim | Stable |
| `ml-knn` | K-nearest neighbors | Stable (mljs org) |
