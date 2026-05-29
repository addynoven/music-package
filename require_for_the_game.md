# SDK Requirement — Audio Analysis Endpoint for MusicStream Rhythm

> Spec for the audio-analysis endpoint the rhythm-game client (`musicstream-rhythm/bemuse`) needs from the MusicStream SDK.
> Authored 2026-05-03.

---

## Goal

Return audio-analysis metadata for a YouTube videoId so the rhythm-game client can build musically-informed charts (real BPM, beat grid, percussive onsets, key) instead of guessing from lyric timestamps.

---

## Endpoint contract

### Method + URL
```
GET /api/music/analyze/:videoId
```

### Response shape

```jsonc
{
  "success": true,
  "data": {
    "videoId": "-tJYN-eG1zk",
    "duration": 122.4,                  // seconds, float
    "tempo": {
      "bpm": 81.3,                      // float, the dominant tempo
      "confidence": 0.87,               // 0..1, how certain we are
      "beatGrid": [0.21, 0.95, 1.69, 2.43, 3.17, ...]  // seconds per beat
    },
    "onsets": [0.12, 0.21, 0.34, 0.95, 1.04, 1.69, ...], // seconds, percussive transients
    "key": {
      "tonic": "A",                     // 'C' | 'C#' | 'D' | ... | 'B'
      "mode": "minor",                  // 'major' | 'minor'
      "camelot": "8A",                  // '1A'..'12A' | '1B'..'12B'
      "confidence": 0.74                // 0..1
    },
    "energy": {
      "overall": 0.62,                  // 0..1, mean RMS normalized
      "envelope": [                     // optional — RMS over time, downsampled
        { "t": 0.0, "rms": 0.12 },
        { "t": 0.5, "rms": 0.34 },
        { "t": 1.0, "rms": 0.41 }
      ]
    },
    "sections": [                       // optional — verse/chorus/etc
      { "start": 0.0,   "end": 18.5,  "label": "intro",   "loudness": 0.18 },
      { "start": 18.5,  "end": 60.2,  "label": "verse",   "loudness": 0.45 },
      { "start": 60.2,  "end": 96.0,  "label": "chorus",  "loudness": 0.72 },
      { "start": 96.0,  "end": 122.4, "label": "outro",   "loudness": 0.40 }
    ],
    "analyzedAt": "2026-05-03T00:00:00Z"  // ISO timestamp
  }
}
```

### Failure shape (existing pattern)

```json
{ "success": false, "message": "Analysis failed: <reason>" }
```

---

## Required fields (must work)

These three are **must-have**. Without them the rhythm game falls back to today's "guessing" mode.

| Field | Type | Why we need it |
|-------|------|---------------|
| `tempo.bpm` | float | Replaces our hardcoded 120 BPM. Notes scroll at the song's actual pulse. |
| `tempo.beatGrid` | `number[]` | Array of beat timestamps in seconds. Used to align lyric notes to the nearest beat (snap quantization) so charts feel rhythmically tight. |
| `onsets` | `number[]` | Array of percussive-hit timestamps in seconds. Used to inject "drum lane" notes between vocal-line notes. This is THE feature that makes charts feel musical. |

## Nice-to-have fields (graceful fallback if missing)

| Field | Type | Why |
|-------|------|-----|
| `key.tonic` + `key.mode` + `key.camelot` | strings | Showcase flair — display "Key: 8A (A minor)" on loading screen. Optional Camelot Wheel widget. |
| `energy.envelope` | array | Drives the audio-reactive background visualization on the falling-notes scene. |
| `sections` | array | Lets the chart generator boost note density during chorus/drop sections. |

If a nice-to-have field can't be computed, return it as `null` rather than failing the whole request.

---

## Performance / behavior requirements

- **Caching:** Analyze each videoId at most once. Persist results in your DB / file cache keyed by videoId. Subsequent calls return the cached JSON instantly.
- **First-call latency:** Up to **30 s** is acceptable. The client shows a progress bar during this. Longer than 30 s → return 408 with a partial result (whatever subset of fields completed).
- **Concurrency:** If two clients request the same uncached videoId at once, deduplicate — second caller waits on the first's analysis, doesn't run a second job.
- **Cold-start audio source:** You can reuse whatever pipeline `/api/music/proxy/:id` already uses to fetch audio. Decoding to PCM for analysis is the same first step.

---

## Suggested implementation stack

You're free to pick — but for the analysis itself, **Python** is the cleanest choice on the server because the libraries are mature:

| Field | Library / algorithm |
|-------|---------------------|
| `tempo.bpm` + `beatGrid` | `librosa.beat.beat_track` (autocorrelation on onset strength) |
| `onsets` | `librosa.onset.onset_detect` (spectral flux peaks) |
| `key` | `librosa.feature.chroma_cqt` → Krumhansl–Schmuckler key templates → Camelot lookup |
| `energy.envelope` | `librosa.feature.rms` downsampled to ~2 Hz |
| `sections` | `librosa.segment.agglomerative` or `msaf` (music structure analysis framework) |

If you'd rather stay in Node, `essentia.js` runs in Node and gives BPM + key + onsets. Quality is decent. No `sections` though — you'd need to roll your own or skip.

If running Python from your Node server is awkward, wrap it as a separate microservice (Python FastAPI on port 4000, your Node SDK shells out via HTTP). That's how Spotify's audio-analysis service works internally.

---

## Camelot lookup table (use this exact mapping)

```
C  major → 8B    A  minor → 8A
G  major → 9B    E  minor → 9A
D  major → 10B   B  minor → 10A
A  major → 11B   F# minor → 11A
E  major → 12B   C# minor → 12A
B  major → 1B    G# minor → 1A
F# major → 2B    D# minor → 2A
C# major → 3B    A# minor → 3A
G# major → 4B    F  minor → 4A
D# major → 5B    C  minor → 5A
A# major → 6B    G  minor → 6A
F  major → 7B    D  minor → 7A
```

Use sharps (not flats) for the `tonic` field for consistency.

---

## Quality bar

This is a **rhythm game**, not Rekordbox. "Good enough" is fine:

- **BPM** within ±2 of the actual tempo → acceptable. Within ±0.5 → excellent.
- **Onsets:** 80% recall on percussive hits, < 20% false positives → acceptable.
- **Key:** top-1 accuracy ~70% → acceptable. Pop/EDM is easier than jazz.

Don't burn time getting Spotify-grade accuracy. If `librosa.beat.beat_track` defaults give you 80% acceptable results, ship it.

---

## Test signal

Once it's running, validate against these (known) songs:

| videoId | Title | Expected BPM | Expected Key |
|---------|-------|-------------|--------------|
| `-tJYN-eG1zk` | Queen — We Will Rock You | ~81 | A minor (8A) |
| `dQw4w9WgXcQ` | Rick Astley — Never Gonna Give You Up | ~113 | A♭ major (4B) |
| `kXYiU_JCYtU` | Linkin Park — Numb | ~110 | F# minor (11A) |

If your results are close to these, the rhythm-game side will work great.

---

## Client integration plan (done by rhythm-game side once endpoint is live)

1. Add `getAnalysis(videoId)` to `bemuse/src/sdk/api.ts`.
2. Trigger it from the `playSong` flow — fire it in parallel with `getLyrics` so it doesn't block.
3. Pass the analysis into `generateBmsonFromLyrics` so:
   - Real BPM replaces hardcoded 120.
   - Lyric notes get snapped to the nearest beat in `beatGrid`.
   - Onsets become drum-lane notes (lanes 5–7 by default).
   - `expert` tier flips on the scratch wheel and uses section boundaries / phrase starts for scratch notes.
4. Display BPM + Camelot key on the loading scene next to the difficulty pill.
5. (If `energy.envelope` provided) drive an audio-reactive halo on the gameplay background.

The client won't touch the SDK code. Once this endpoint returns the shape above, the rhythm-game side wires it.

---

## TL;DR

Add `GET /api/music/analyze/:videoId` returning `{ tempo: {bpm, beatGrid}, onsets[], key: {tonic, mode, camelot}, energy?, sections? }`. Cache by videoId. First-call ≤ 30 s, cached calls instant.

**Required:** BPM, beatGrid, onsets.
**Optional:** key, energy, sections.

Use librosa/Python if you can. Ping the rhythm-game side when live.
