# Music Theory npm Ecosystem: Wild Find

> Research date: April 2026
> Focus: Scales, chords, keys, modes, BPM detection, pitch detection, note parsing

---

## The Lay of the Land

The music theory npm space is small but surprisingly mature in some areas — and weirdly empty in others. The core "abstract theory" space is dominated by one library (tonal), with a handful of niche alternatives for jazz, chord parsing, and audio analysis. BPM and pitch detection live in a completely separate part of the graph and are much more shallow.

There is a clear split between:
1. **Music theory as data** — pure functions operating on note names, intervals, scales. No audio required.
2. **Music theory from audio** — signal processing to extract pitch, tempo, key from actual audio buffers.

Very few packages bridge the two.

---

## Tier 1: The Clear Winner

### tonal
- **npm**: `tonal` (monorepo bundle) or individual `@tonaljs/*` packages
- **Weekly downloads**: ~6,800 (for `tonal`), ~8,400 for `@tonaljs/chord-detect`
- **GitHub**: 3,900+ stars, actively maintained, last release 3 months ago (v6.4.3)
- **Size**: 20kb minified, 6kb gzipped
- **TypeScript**: full types, published as ESM + CJS
- **License**: MIT

This is the de facto standard. Nothing else comes close in terms of completeness, TypeScript quality, or maintenance.

#### Architecture

Tonal is a monorepo. You can install the full bundle (`npm install tonal`) or individual modules. All functions are pure — no mutation, no classes, entities are plain data objects.

#### Full Module Inventory

| Package | What it does |
|---|---|
| `@tonaljs/note` | Note name parsing, transposition, simplification |
| `@tonaljs/midi` | Note ↔ MIDI number ↔ frequency conversion |
| `@tonaljs/interval` | Interval arithmetic, semitone counting, inversion |
| `@tonaljs/scale` | Scale notes, degrees, subscales |
| `@tonaljs/scale-type` | Dictionary of 100+ named scales |
| `@tonaljs/chord` | Chord notes, intervals, inversions |
| `@tonaljs/chord-type` | Dictionary of 300+ named chord types |
| `@tonaljs/chord-detect` | Detect chord name from a set of notes |
| `@tonaljs/key` | Major/minor key objects with full chord/scale data |
| `@tonaljs/mode` | Greek modes (ionian, dorian, phrygian, etc.) |
| `@tonaljs/progression` | Roman numeral chord progressions |
| `@tonaljs/roman-numeral` | Parse roman numeral symbols (I, IV, V7, etc.) |
| `@tonaljs/pcset` | Pitch class set operations and comparison |
| `@tonaljs/voicing` | Chord voicings with range constraints |
| `@tonaljs/voice-leading` | Transitions between voicings |
| `@tonaljs/voicing-dictionary` | Named voicing collections |
| `@tonaljs/rhythm-pattern` | Rhythmic pattern utilities |
| `@tonaljs/time-signature` | Parse "4/4", "6/8" etc. |
| `@tonaljs/duration-value` | Note duration values (whole, half, quarter...) |
| `@tonaljs/abc-notation` | Parse ABC notation |
| `@tonaljs/range` | Note ranges (e.g. all notes between C2 and C5) |
| `@tonaljs/collection` | Shuffle, permutations, rotate |
| `@tonaljs/core` | Low-level pitch math |

#### Key API Examples

```typescript
import { Note, Interval, Scale, Chord, Key, Mode, Progression } from "tonal";

// Notes
Note.midi("C4");                    // => 60
Note.freq("A4");                    // => 440
Note.transpose("C4", "5P");         // => "G4"
Note.enharmonic("Db4");             // => "C#4"

// Intervals
Interval.semitones("5P");           // => 7
Interval.distance("C4", "G4");      // => "5P"
Interval.add("3M", "3m");           // => "5P"

// Scales
Scale.get("C major").notes;         // => ["C", "D", "E", "F", "G", "A", "B"]
Scale.get("C dorian").notes;        // => ["C", "D", "Eb", "F", "G", "A", "Bb"]
Scale.get("A melodic minor").notes; // => ["A", "B", "C", "D", "E", "F#", "G#"]
Scale.degrees("C major")(1);        // => "C"
Scale.degrees("C major")(5);        // => "G"
Scale.scaleChords("C major");       // => ["CM", "Dm", "Em", "FM", "GM", "Am", "Bdim"]

// Chords
Chord.get("Cmaj7").notes;           // => ["C", "E", "G", "B"]
Chord.get("Cmaj7").name;            // => "C major seventh"
Chord.get("Cm7b5").intervals;       // => ["1P", "3m", "5d", "7m"]
Chord.detect(["C", "E", "G", "B"]); // => ["Cmaj7", "CM7"]

// Keys
Key.majorKey("C");
// => {
//   tonic: "C", type: "major",
//   scale: ["C","D","E","F","G","A","B"],
//   triads: ["CM","Dm","Em","FM","GM","Am","Bdim"],
//   chords: ["CM7","Dm7","Em7","FM7","G7","Am7","Bm7b5"],
//   chordScales: ["C major","D dorian","E phrygian","F lydian","G mixolydian","A minor","B locrian"],
//   chordsHarmonicFunction: ["T","SD","T","SD","D","T","D"]
// }

Key.minorKey("A");
// => natural, harmonic, melodic variants with full chord sets

// Modes
Mode.get("dorian");
// => { name: "dorian", modeNum: 1, alt: -2, ... }

// Progressions
Progression.fromRomanNumerals("C major", ["I", "IVmaj7", "V7", "I"]);
// => ["CM", "FMaj7", "G7", "CM"]
```

#### What's Notably Good
- The `Key.majorKey()` and `Key.minorKey()` return objects give you chords, scales, harmonic functions, and modal chord scales all in one call — genuinely useful for app logic.
- `Chord.detect()` is solid for identifying chords from note sets.
- Voice leading module is unique among music theory libs — most ignore it entirely.
- Active GitHub, good issues response time, v6 is clean.

#### What's Missing in Tonal
- No audio — it doesn't touch Float32Arrays or AudioBuffers
- No BPM, no pitch detection, no frequency analysis
- No MIDI file reading/writing
- Scale "fit" scoring — given a set of notes, rank which keys/scales match best (partial support via `pcset` but not a clean API)
- No chord progression generation (just parsing/translation)
- No Nashville Number System support (closely related to roman numerals but distinct)
- Rhythm beyond time signatures and duration values is thin

---

## Tier 2: Notable Alternatives and Specialists

### teoria
- **npm**: `teoria`
- **GitHub**: saebekassebil/teoria — ~400 stars
- **Status**: Not actively maintained (no npm releases recently)
- **Style**: OOP / method chaining, not functional

teoria was the pre-tonal default. It uses a class-based, chainable API — the opposite of tonal's functional style. Still works, still has solid jazz chord parsing.

```javascript
const note = teoria.note("C4");
const chord = teoria.chord("Cm7b5");
chord.notes(); // => [Note, Note, Note, Note]

const scale = teoria.scale("C", "major");
scale.notes(); // => [Note, ...]
scale.simple(); // => ["C", "D", "E", "F", "G", "A", "B"]
```

What teoria does differently:
- Solfège support built in (do, re, mi...) — useful for educational apps
- `note.solfege(scale)` — returns the solfège name of a note within a scale
- Advanced jazz chord parsing: parses "Ab#5b9", "F(#11)" correctly
- `chord.dominant()`, `chord.subdominant()` — music theory helpers not in tonal
- Helmholtz notation support alongside scientific notation

Good for: educational apps, jazz, solfège. Not for new projects without careful consideration of the maintenance status.

---

### sharp11
- **npm**: `sharp11`
- **GitHub**: jsrmath/sharp11 — 349 stars
- **Weekly downloads**: ~3-4 (essentially dead from usage standpoint)
- **Status**: Unmaintained (no npm releases in 12+ months)
- **Jazz focus**: this is its core value proposition

sharp11 is fascinating because it's the only library with explicit jazz-centric features:
- Chord-scale relationships: given a chord, return all scales that "work" over it
- Complex chord symbol parsing: `"CmM9#11"` → notes C Eb G B D F#
- Cadential analysis
- Integration with `sharp11-improv` (jazz improv generation), `sharp11-jza` (probabilistic harmony modeling), `sharp11-irb` (1000+ jazz standards)

```javascript
const s11 = require("sharp11");
const chord = s11.chord.create("CmM7");
chord.identify("B", "C", "Eb", "G"); // => "CmM7/B" (handles inversions)

// Scale-over-chord logic — unique to sharp11
const scales = chord.scales(); // ordered list of scales that fit
```

For jazz-specific work this library has no real peer in the npm space. But it's dead weight from a maintenance perspective.

---

### musictheoryjs
- **npm**: `musictheoryjs`
- **GitHub**: Zachacious/MusicTheoryJS
- **Version**: 2.0.2
- **License**: ISC
- **Status**: Low activity

OOP-based with a different angle: it includes an `Instrument` class that knows about tunings, and can calculate note frequencies and MIDI keys relative to instrument tuning. ~70 scale templates, ~40+ chord templates.

```javascript
const { Note, Scale, Chord, Instrument } = require("musictheoryjs");
const guitar = new Instrument({ tuning: [40, 45, 50, 55, 59, 64] });
guitar.noteFrequency(0, 0); // => frequency for open low E
```

The Instrument abstraction is genuinely interesting — tonal and teoria ignore this. But the library's overall depth is shallow compared to tonal.

---

### chord-symbol
- **npm**: `chord-symbol`
- **GitHub**: no-chris/chord-symbol
- **Version**: 4.0.0 (last published ~3 years ago)
- **Weekly downloads**: ~7 dependents

Self-described as "the definitive chord symbol parser and renderer." The test suite contains 37,000+ distinct chord symbol strings. Its sole focus is normalizing and rendering chord symbols — not generating music or doing theory math.

```javascript
import { chordParserFactory, chordRendererFactory } from "chord-symbol";

const parseChord = chordParserFactory();
const renderChord = chordRendererFactory();

const parsed = parseChord("Cm7");
// => { input: "Cm7", normalized: {...}, intervals: ["1", "b3", "5", "b7"], notes: ["C","Eb","G","Bb"] }

renderChord(parsed); // => "Cmi7" (normalized)
```

Key differentiator: pipe-and-filter architecture — you can inject custom parsing/rendering filters. Handles "Cm7", "CMINOR7", "C7min", "C7mi" all as the same chord.

Good for: chord display, normalization, parsing user-entered chord names. Not a theory engine.

---

### chord-magic
- **npm**: `chord-magic`
- **GitHub**: nolanlawson/chord-magic
- **Version**: 2.1.1
- **Weekly downloads**: ~61
- **Status**: Inactive

Parse, transpose, pretty-print chord names. Simpler than chord-symbol but more focused on transposition.

```javascript
import { parse, transpose, prettyPrint } from "chord-magic";
const chord = parse("Am7"); 
const transposed = transpose(chord, 2); // up 2 semitones
prettyPrint(transposed); // => "Bm7"
```

---

### ChordSheetJS
- **npm**: `chordsheetjs`
- **GitHub**: martijnversluis/ChordSheetJS
- **Weekly downloads**: ~669
- **Status**: Active, well-maintained

This is about chord sheet documents (song lyrics with chord names above them), not music theory. It parses, formats, and renders chord sheets in ChordPro, ChordsOverWords, and UltimateGuitar formats. Includes a PDF formatter.

```javascript
import { ChordProParser, HtmlFormatter } from "chordsheetjs";
const parser = new ChordProParser();
const song = parser.parse("{title: Imagine}\n[C]Imagine there's no [G]heaven");
const formatter = new HtmlFormatter();
console.log(formatter.format(song));
```

Solid, actively maintained. Not music theory — more "guitar tab / lead sheet" processing.

---

## Tier 3: BPM / Tempo Detection

All of these deal with audio buffers (Float32Array, AudioBuffer), not note names.

### realtime-bpm-analyzer
- **npm**: `realtime-bpm-analyzer`
- **Weekly downloads**: ~600-1000
- **Version**: 5.0.5 (last published ~3 days ago as of research date)
- **Status**: Actively maintained
- **Dependency free**: yes, pure TypeScript

The most complete BPM package. Works with WebAudio API, files, streams, microphone input. Zero dependencies.

```typescript
import { createRealTimeBpmProcessor, getBiquadFilter } from "realtime-bpm-analyzer";

const analyzer = await createRealTimeBpmProcessor(audioContext);
analyzer.port.onmessage = (event) => {
  if (event.data.message === "BPM") {
    console.log("BPM:", event.data.result.bpm);
  }
};
```

Good for: real-time DJ tools, audio players, live detection.

---

### web-audio-beat-detector
- **npm**: `web-audio-beat-detector`
- **GitHub**: chrisguttandin/web-audio-beat-detector
- **Weekly downloads**: ~963
- **Algorithm**: Joe Sullivan's method (energy-based)
- **Limitations**: Works best for electronic/4-on-the-floor music

```typescript
import { analyze, guess } from "web-audio-beat-detector";

// analyze returns a Promise<number> (BPM)
const bpm = await analyze(audioBuffer);

// guess — same but faster, less accurate
const bpm = await guess(audioBuffer);
```

Simple, clean API. BPM range defaults to 90–180, configurable via `tempoSettings`. Not complex algorithms, but good practical results for common electronic music.

---

### music-tempo
- **npm**: `music-tempo`
- **GitHub**: killercrush/music-tempo
- **Algorithm**: Beatroot (Simon Dixon)
- **Output**: tempo value + array of beat timestamps in seconds

```javascript
const MusicTempo = require("music-tempo");
const mt = new MusicTempo(pcmFloat32Array);
console.log(mt.tempo);  // BPM
console.log(mt.beats);  // [0.532, 1.064, 1.596, ...]
```

Unique: returns beat timestamps, not just BPM. Useful if you need beat-synchronized events.

---

### bpm-detective
- **npm**: `bpm-detective`
- **Status**: Stable, simple

Older, simpler. Uses the Web Audio API. Less active than realtime-bpm-analyzer.

---

## Tier 4: Pitch / Note Detection from Audio

### pitchfinder
- **npm**: `pitchfinder`
- **GitHub**: peterkhayes/pitchfinder
- **Status**: Maintained (updated December 2025)
- **Environment**: Browser + Node.js
- **Input**: Float32Array

The reference pitch detection package. Offers multiple algorithms:

| Algorithm | Speed | Accuracy | Notes |
|---|---|---|---|
| YIN | Fast | Best balance — occasional wild errors | Standard choice |
| McLeod (MPM) | Fast | Better on lower frequencies | |
| AMDF | Slow | ±2% but consistent | Good for noisy signals |
| Dynamic Wavelet | Very fast | Struggles with low frequencies | |

```javascript
import Pitchfinder from "pitchfinder";

const detectPitch = Pitchfinder.YIN({ sampleRate: 44100 });
const pitch = detectPitch(float32Array); // Hz or null

// Pitch series from audio with rhythm quantization
const frequencies = Pitchfinder.frequencies(detectPitch, float32Array, {
  tempo: 130,
  quantization: 4,
});
```

`Pitchfinder.frequencies()` is a useful higher-level helper — converts a buffer into an array of notes at quantized time positions.

---

### node-pitchfinder
- **npm**: `node-pitchfinder`
- **GitHub**: cristovao-trevisan/node-pitchfinder
- **Notes**: Native C++ addon version of pitchfinder — significantly faster but Node-only, no browser

---

### pitchy
- **npm**: `pitchy`
- **GitHub**: ianprime0509/pitchy
- **Algorithm**: McLeod Pitch Method with parabolic interpolation
- **Distribution**: Pure ES module (v4+)
- **Target**: Real-time tuners

```typescript
import { PitchDetector } from "pitchy";

const detector = PitchDetector.forFloat32Array(bufferSize);
const [pitch, clarity] = detector.findPitch(float32Array, sampleRate);
// pitch in Hz, clarity 0-1 (higher = more confident)
```

The `clarity` score is genuinely useful — lets you gate on confidence before acting on a detected pitch. Clean API, good for instrument tuners.

---

## Tier 5: Heavy Audio Analysis (WebAssembly)

### essentia.js
- **npm**: `essentia.js`
- **GitHub**: MTG/essentia.js — Music Technology Group, UPF Barcelona
- **Version**: 0.1.3 (last published ~4 years ago)
- **Backend**: WebAssembly (Emscripten-compiled C++)
- **Scope**: Comprehensive MIR (Music Information Retrieval)

The nuclear option. Wraps the full Essentia C++ library via WASM. Can do everything: BPM, key detection, pitch, chroma, MFCC, beat positions, chord detection, predominant melody, loudness, onset detection, spectral features.

```javascript
import Essentia from "essentia.js";
const essentia = new Essentia(EssentiaWASM);

// Key detection
const keyData = essentia.KeyExtractor(audioVector);
// => { key: "C", scale: "major", strength: 0.87 }

// BPM
const bpmData = essentia.PercivalBpmEstimator(audioVector);
// => { bpm: 128 }

// Chroma
const chroma = essentia.Chromagram(audioVector);
```

The catch: 4 years without an update. The WASM binary is large. Initialization is async and heavyweight. But for server-side Node.js MIR tasks where you need serious accuracy, nothing else in npm comes close.

---

### meyda
- **npm**: `meyda`
- **GitHub**: meyda/meyda
- **Version**: 5.6.3 (last published ~2 years ago)
- **Status**: Stable but slow development
- **34 dependents** in npm registry

Real-time audio feature extraction. Lighter than essentia.js, no WASM. Works with Web Audio API or plain JS arrays.

Features it can extract: `amplitudeSpectrum`, `buffer`, `chroma`, `complexSpectrum`, `energy`, `loudness`, `mfcc`, `perceptualSharpness`, `perceptualSpread`, `powerSpectrum`, `rms`, `spectralCentroid`, `spectralFlatness`, `spectralFlux`, `spectralKurtosis`, `spectralRolloff`, `spectralSkewness`, `spectralSlope`, `spectralSpread`, `zcr`

The `chroma` feature is music-theory-relevant: returns a 12-element array representing the energy distribution across the 12 pitch classes (C, C#, D, ..., B). This is the input most key-detection algorithms need.

```javascript
import Meyda from "meyda";

const analyzer = Meyda.createMeydaAnalyzer({
  audioContext,
  source: sourceNode,
  bufferSize: 512,
  featureExtractors: ["chroma", "rms", "loudness"],
  callback: (features) => {
    console.log(features.chroma); // [0.1, 0.05, 0.8, ...] — 12 values
  },
});
analyzer.start();
```

---

## Tier 6: Musical Key Detection from Audio

This is the most fragmented area. No clean "here's your key" npm package exists that's both accurate and maintained.

### The options:

**key-finder-web + key-finder-wasm** (GitHub: dogayuksel/webKeyFinder)
- Two packages working together
- WASM-based, browser-only
- Krumhansl-Kessler key profiles with chroma analysis
- Not published to npm as a clean public package

**keyfinder-js** (`keyfinder-js` on npm)
- Thin JS wrapper, minimal

**Via essentia.js**
- `KeyExtractor` algorithm — the most accurate option, but heavyweight

**DIY via meyda chroma + math**
- Extract chroma frames with meyda, run Krumhansl-Kessler profile matching
- This is what most custom implementations do
- No clean npm package for the matching step alone

**The gap**: There is no well-maintained, lightweight npm package that takes an AudioBuffer and returns `{ key: "A", mode: "minor", confidence: 0.85, camelot: "8A" }`. This is a real hole.

---

## Tier 7: MIDI File Parsing

### @tonejs/midi
- **npm**: `@tonejs/midi`
- **GitHub**: Tonejs/Midi
- **Status**: Active
- Read and write MIDI files; parses to JSON with notes, timing, tracks, instruments

```typescript
import { Midi } from "@tonejs/midi";
const midi = await Midi.fromUrl("song.mid");
midi.tracks.forEach(track => {
  track.notes.forEach(note => {
    console.log(note.name, note.time, note.duration, note.velocity);
  });
});
```

Clean, TypeScript-native. The standard choice for MIDI file work.

---

### midi-parser-js
- **npm**: `midi-parser-js`
- Converts MIDI binary to a JSON object at a lower level than @tonejs/midi
- Browser + Node

---

## Tier 8: Notation Rendering

These are visualization-layer tools, not music theory engines.

### vexflow
- **npm**: `vexflow`
- **GitHub**: vexflow/vexflow — TypeScript, active
- **Version**: 5.0.0
- **33 dependents**
- Renders music notation to HTML Canvas or SVG
- The standard for in-browser sheet music rendering

### abcjs
- **npm**: `abcjs`
- **GitHub**: paulrosen/abcjs
- Renders ABC notation format in the browser
- v6.0.0

---

## Tier 9: Microtonal / Alternate Tuning Systems

### tune (abbernie/tune)
- **GitHub**: abbernie/tune (not sure of npm package name)
- 3,000+ historical tunings from the Scala tuning archive
- Input: MIDI note numbers → Output: frequency in any temperament
- Supports just intonation, meantone, historical temperaments

```javascript
const Tune = require("tune");
const tune = new Tune();
tune.loadScale("pythagorean");
tune.tonicize(60); // set C4 as tonic
tune.note(67);     // G4 in pythagorean tuning → exact Hz
```

### microtonal-utils (GitHub: m-yac/microtonal-utils)
- Interval arithmetic for microtonal intervals
- Niche but technically correct

---

## Popularity Summary

| Package | Weekly Downloads | Status |
|---|---|---|
| `tonal` | ~6,800 | Active |
| `@tonaljs/chord-detect` | ~8,400 | Active |
| `web-audio-beat-detector` | ~963 | Active |
| `realtime-bpm-analyzer` | ~600-1000 | Active |
| `chordsheetjs` | ~669 | Active |
| `pitchfinder` | Low hundreds | Maintained |
| `chord-magic` | ~61 | Inactive |
| `meyda` | <100 | Slow |
| `sharp11` | ~3-4 | Dead |
| `teoria` | Low | Unmaintained |
| `musictheoryjs` | Unknown | Low activity |
| `chord-symbol` | ~7 dependents | Inactive |
| `essentia.js` | Low | Stale |

---

## What's Actually Missing

After going through the whole space, these gaps stand out:

### 1. Musical Key Detection from Audio — Clean npm Package
There is no maintained, standalone npm package that does: `AudioBuffer → { key, mode, confidence, camelotCode }`. You can assemble it from meyda (chroma) + math, or use essentia.js (stale), but nobody has wrapped this into a clean, actively maintained package. High demand (DJs, music apps, playlist tools) and nothing to install.

### 2. Scale/Key Fitting from a Note Set
Given an array of notes that appear in a piece — rank which keys/scales they most likely belong to. tonal's `pcset` gives you the building blocks but there's no `whichKey(["C","E","G","B","D"])` function that returns a ranked match list with scores. The Krumhansl-Kessler algorithm applied to symbolic note data (not audio chroma) is absent.

### 3. Chord Progression Analysis / Functional Harmony
Given a sequence of chords, label the harmonic function (tonic/subdominant/dominant), detect cadences (perfect authentic, deceptive, half), identify secondary dominants, borrowed chords. tonal has `chordsHarmonicFunction` in the key object, but there's no module for analyzing a progression sequence end-to-end.

### 4. Nashville Number System
NNS is used heavily in country, gospel, and session musician contexts. It's closely related to roman numerals but not identical (no quality symbols, flat and sharp degrees, split bars). No npm package supports it.

### 5. Camelot Wheel / Harmonic Mixing
DJs use the Camelot wheel (1A–12B) to identify harmonically compatible keys for mixing. No npm package does: `{ key: "A major" } → { camelot: "11B", compatible: ["10B","12B","11A"] }`. It's a trivial mapping table but it's just not published anywhere cleanly.

### 6. Beat Grid / Downbeat Detection
BPM packages tell you tempo. `music-tempo` gives you beat timestamps. But none of them give you a proper beat grid with confidence scores, downbeat identification, or time signature inference. DJs and DAWs need this.

### 7. Chord Progression Generation from Rules
No npm package for generative rule-based progressions (e.g., "generate a 4-bar ii-V-I in Bb major with a tritone substitution in bar 3"). AI tools do this, but there's no deterministic rule engine in npm for it.

### 8. Voice Leading Validation
tonal has voicing and voice-leading modules, but there's no package that analyzes a set of chord voicings and tells you things like "this has parallel fifths" or "this voice crossing is awkward." Music theory pedagogical tools need this.

### 9. Real-time Node.js Pitch → Note Name Pipeline
pitchfinder and pitchy give you Hz. But there's no clean package for the full pipeline: `Float32Array → Hz → note name + octave + cents deviation` with configurable tuning reference. You have to assemble it yourself from a pitch detector + `Midi.fromFreq()` from tonal.

### 10. Rhythm / Meter Analysis
There is essentially nothing in npm for rhythmic analysis beyond time signature parsing. No package for: syncopation detection, polyrhythm identification, rhythmic pattern matching, groove quantization analysis. This is a deep hole.

---

## API Design Patterns — What the Space Uses

Looking across all these packages, a few patterns emerge:

**The functional/immutable pattern** (tonal): `Scale.get("C major")` returns a plain object. Functions take values, return values. No mutation. Works well for composability, easy to use with TypeScript. Tonal landed on this and it's the right call.

**The OOP/chaining pattern** (teoria, sharp11): `teoria.note("C4").interval("3m").note()`. Feels fluent but harder to tree-shake, harder to type correctly, harder to test.

**The dictionary-first pattern** (chord-symbol, chord-magic): Primary concern is normalization — accept any string representation of a chord, output canonical form. Useful but narrow.

**The audio-buffer-in pattern** (pitchfinder, pitchy, meyda, essentia.js): Takes `Float32Array` + `sampleRate`. Returns analysis result synchronously or as Promise. Very consistent across all audio packages.

**The gap between audio and theory**: Every audio package stops at "here's your Hz value" or "here's your chroma vector." Every theory package starts at "here's your note name." Nobody owns the bridge.

---

## Recommendations for This SDK

1. **Use tonal as the theory foundation.** Don't reimplement intervals, scales, key objects. Import from tonal.

2. **Use pitchy for any pitch detection work.** Clean API, `clarity` score, McLeod algorithm, well-maintained.

3. **Use realtime-bpm-analyzer for BPM.** Most actively maintained, zero dependencies, TypeScript.

4. **Build the key detection bridge.** `meyda chroma` → Krumhansl-Kessler correlation → tonal key name. This is missing from npm and would be genuinely valuable to open source.

5. **Build the Camelot wheel mapping.** 24-entry lookup table — trivial to implement, genuinely useful.

6. **Don't touch essentia.js for production.** WASM bundle size + 4-year staleness = liability. Build what you need with lighter primitives.

7. **For MIDI file work, use @tonejs/midi.** It's the clear standard.
