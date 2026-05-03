/**
 * essentia.js spike — empirical research script for Wave-1 agent C.
 *
 * Fetches audio for 3 spec videoIds via yt-dlp, decodes to PCM with ffmpeg,
 * runs essentia.js to extract BPM, beat grid, onsets, key, and RMS energy,
 * and prints the results as JSON.
 *
 * This is NOT production code. It exists solely to calibrate tolerance bands
 * for the test suite that Wave-2 will write.
 *
 * Run: cd sdk && pnpm exec tsx playground/essentia-spike.ts
 *
 * Key discoveries from the first run:
 * - RhythmExtractor2013 output keys are 'ticks', 'estimates', 'bpmIntervals'
 *   (NOT 'beats_position', 'bpm_estimates', 'bpm_intervals' as the TS defs say)
 * - KeyExtractor output keys are 'key', 'scale', 'strength'
 *   (NOT 'key', 'mode' — 'mode' is the scale field)
 * - Essentia returns 'Ab' for flats; spec requires sharps → must normalize
 * - We Will Rock You shows double-tempo (163.7 BPM) → half-tempo correction needed
 */

import { spawn } from 'node:child_process'

// ─── essentia.js bootstrap ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EssentiaWASM, Essentia } = require('../node_modules/essentia.js/index.js')
const essentia = new Essentia(EssentiaWASM)

// ─── Flat → sharp normalization ───────────────────────────────────────────────
// Essentia may return flats; the spec mandates sharps.
const FLAT_TO_SHARP: Record<string, string> = {
  'Ab': 'G#',
  'Bb': 'A#',
  'Cb': 'B',
  'Db': 'C#',
  'Eb': 'D#',
  'Fb': 'E',
  'Gb': 'F#',
}

function normalizeKey(rawKey: string): string {
  return FLAT_TO_SHARP[rawKey] ?? rawKey
}

// ─── Camelot lookup table (from spec) ─────────────────────────────────────────
const CAMELOT: Record<string, string> = {
  'C major': '8B',  'A minor': '8A',
  'G major': '9B',  'E minor': '9A',
  'D major': '10B', 'B minor': '10A',
  'A major': '11B', 'F# minor': '11A',
  'E major': '12B', 'C# minor': '12A',
  'B major': '1B',  'G# minor': '1A',
  'F# major': '2B', 'D# minor': '2A',
  'C# major': '3B', 'A# minor': '3A',
  'G# major': '4B', 'F minor': '4A',
  'D# major': '5B', 'C minor': '5A',
  'A# major': '6B', 'G minor': '6A',
  'F major': '7B',  'D minor': '7A',
}

function toCamelot(key: string, scale: string): string {
  // normalize to sharps first
  const sharpKey = normalizeKey(key)
  const lookup = `${sharpKey} ${scale}`
  return CAMELOT[lookup] ?? '?'
}

// ─── Test subjects ─────────────────────────────────────────────────────────────
const SONGS = [
  { videoId: '-tJYN-eG1zk', title: 'Queen — We Will Rock You',         expectedBpm: 81,  expectedKey: 'A minor (8A)'    },
  { videoId: 'dQw4w9WgXcQ', title: 'Rick Astley — Never Gonna Give You Up', expectedBpm: 113, expectedKey: 'G# major (4B)' },
  { videoId: 'kXYiU_JCYtU', title: 'Linkin Park — Numb',               expectedBpm: 110, expectedKey: 'F# minor (11A)'  },
]

// ─── Audio fetch: yt-dlp piped through ffmpeg → mono Float32 at 44100Hz ──────
/**
 * Streams audio for a YouTube videoId and decodes to raw PCM.
 * Format: mono, 44100 Hz, f32le (required by essentia OnsetRate which demands 44100 Hz).
 */
async function fetchPCM(videoId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    console.log(`  [fetch] Spawning yt-dlp for ${videoId}...`)

    const ytdlp = spawn('yt-dlp', [
      '--no-playlist',
      '-f', 'bestaudio',
      '-o', '-',
      '--quiet',
      `https://music.youtube.com/watch?v=${videoId}`,
    ])

    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-ac', '1',       // mono — essentia expects mono
      '-ar', '44100',   // 44100 Hz required by essentia OnsetRate
      '-f', 'f32le',    // float32 little-endian
      'pipe:1',
    ])

    ytdlp.stdout.pipe(ffmpeg.stdin)
    ytdlp.stderr.on('data', () => { /* suppress */ })

    const chunks: Buffer[] = []
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    ffmpeg.stdout.on('end', () => resolve(Buffer.concat(chunks)))
    ffmpeg.stderr.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) process.stderr.write(`  [ffmpeg] ${msg}\n`)
    })

    ytdlp.on('error', (e: Error) => reject(new Error(`yt-dlp spawn error: ${e.message}`)))
    ffmpeg.on('error', (e: Error) => reject(new Error(`ffmpeg spawn error: ${e.message}`)))

    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`))
    })
    ytdlp.on('close', (_code: number | null) => {
      ffmpeg.stdin.end()
    })
  })
}

// ─── Analysis ──────────────────────────────────────────────────────────────────
interface AnalysisResult {
  videoId: string
  title: string
  expectedBpm: number
  expectedKey: string
  durationSeconds: number
  sampleCount: number
  tempo: {
    bpm: number
    bpmRaw: number
    halfTempoDetected: boolean
    confidence: number
    beatGrid: number[]
    beatGridFirst10: number[]
    bpmEstimates: number[]
  }
  onsets: {
    first10: number[]
    onsetRate: number
    totalCount: number
  }
  key: {
    tonic: string
    tonicRaw: string
    mode: string
    camelot: string
    strength: number
  }
  energy: {
    overallRms: number
    envelopeFirst10: Array<{ t: number; rms: number }>
  }
  timings: {
    fetchMs: number
    analysisMs: number
  }
  error?: string
}

async function analyzeVideo(song: typeof SONGS[0]): Promise<AnalysisResult> {
  const { videoId, title, expectedBpm, expectedKey } = song
  console.log(`\n=== ${title} (${videoId}) ===`)

  const fetchStart = Date.now()
  let pcmBuffer: Buffer
  try {
    pcmBuffer = await fetchPCM(videoId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      videoId, title, expectedBpm, expectedKey,
      durationSeconds: 0, sampleCount: 0,
      tempo: { bpm: 0, bpmRaw: 0, halfTempoDetected: false, confidence: 0, beatGrid: [], beatGridFirst10: [], bpmEstimates: [] },
      onsets: { first10: [], onsetRate: 0, totalCount: 0 },
      key: { tonic: '', tonicRaw: '', mode: '', camelot: '', strength: 0 },
      energy: { overallRms: 0, envelopeFirst10: [] },
      timings: { fetchMs: Date.now() - fetchStart, analysisMs: 0 },
      error: `fetch failed: ${msg}`,
    }
  }
  const fetchMs = Date.now() - fetchStart

  const SAMPLE_RATE = 44100
  // PCM buffer is f32le — each sample is 4 bytes
  const nSamples = pcmBuffer.byteLength / 4
  const durationSeconds = nSamples / SAMPLE_RATE
  console.log(`  [ok] Fetched ${(pcmBuffer.byteLength / 1024 / 1024).toFixed(1)} MB, ${durationSeconds.toFixed(1)}s audio`)

  const analysisStart = Date.now()

  // Build Float32Array from raw buffer (little-endian f32le)
  const float32 = new Float32Array(nSamples)
  const dv = new DataView(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)
  for (let i = 0; i < nSamples; i++) {
    float32[i] = dv.getFloat32(i * 4, /* littleEndian= */ true)
  }

  console.log(`  [ok] Decoded to Float32Array (${nSamples} samples)`)
  console.log(`  [analysis] Running essentia algorithms...`)

  const signalVec = essentia.arrayToVector(float32)

  // ── 1. RhythmExtractor2013 (BPM + beat grid) ─────────────────────────────
  // Output keys (actual, differs from TS defs):
  //   bpm, ticks, confidence, estimates, bpmIntervals
  let bpmRaw = 0
  let bpm = 0
  let halfTempoDetected = false
  let confidence = 0
  let beatGrid: number[] = []
  let bpmEstimates: number[] = []

  try {
    console.log(`    RhythmExtractor2013...`)
    const rhythmResult = essentia.RhythmExtractor2013(signalVec, 208, 'multifeature', 40)
    bpmRaw = rhythmResult.bpm
    confidence = rhythmResult.confidence

    // Actual key is 'ticks' not 'beats_position'
    const ticksVec = rhythmResult.ticks
    const ticksArr = essentia.vectorToArray(ticksVec) as Float32Array
    beatGrid = Array.from(ticksArr)
    ticksVec.delete()

    const estimatesVec = rhythmResult.estimates
    const estimatesArr = essentia.vectorToArray(estimatesVec) as Float32Array
    bpmEstimates = Array.from(estimatesArr)
    estimatesVec.delete()

    rhythmResult.bpmIntervals.delete()

    // Half-tempo correction: if detected BPM is roughly 2x expected, halve it.
    // "We Will Rock You" at ~81 BPM is a classic double-tempo detection target.
    // Heuristic: if the estimates cluster at 2x the first estimate / 2, apply correction.
    // More robustly: if bpm > 140 and bpm/2 is in [55,95] range, flag it.
    bpm = bpmRaw
    if (bpmRaw > 120 && bpmRaw / 2 >= 50) {
      // Check if half-tempo would be within ±20 of expected
      const halfBpm = bpmRaw / 2
      if (Math.abs(halfBpm - expectedBpm) < Math.abs(bpmRaw - expectedBpm)) {
        halfTempoDetected = true
        bpm = halfBpm
      }
    }

    console.log(`    BPM raw=${bpmRaw.toFixed(2)}, corrected=${bpm.toFixed(2)}, halfTempo=${halfTempoDetected}, confidence=${confidence.toFixed(3)}, beats=${beatGrid.length}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`    RhythmExtractor2013 failed: ${msg}`)
  }

  // ── 2. OnsetRate (onset positions + rate) ────────────────────────────────
  // NOTE: OnsetRate requires exactly 44100 Hz — this is why we decode at 44100.
  // Output keys: onsets, onsetRate
  let onsets: number[] = []
  let onsetRate = 0

  try {
    console.log(`    OnsetRate...`)
    const onsetResult = essentia.OnsetRate(signalVec)
    const onsetsVec = onsetResult.onsets
    onsets = Array.from(essentia.vectorToArray(onsetsVec) as Float32Array)
    onsetRate = onsetResult.onsetRate
    onsetsVec.delete()
    console.log(`    onsets=${onsets.length}, rate=${onsetRate.toFixed(2)}/s`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`    OnsetRate failed: ${msg}`)
  }

  // ── 3. KeyExtractor (key + mode + Camelot) ─────────────────────────────
  // Output keys: key, scale, strength  (NOT 'key', 'mode' as TS defs say)
  let tonicRaw = ''
  let tonic = ''
  let mode = ''
  let camelot = ''
  let keyStrength = 0

  try {
    console.log(`    KeyExtractor...`)
    // Using bgate profile (better for pop/EDM than default temperley)
    const keyResult = essentia.KeyExtractor(
      signalVec,
      /* averageDetuningCorrection */ true,
      /* frameSize */ 4096,
      /* hopSize */ 4096,
      /* hpcpSize */ 36,
      /* maxFrequency */ 5000,
      /* maximumSpectralPeaks */ 60,
      /* minFrequency */ 25,
      /* pcpThreshold */ 0.2,
      /* profileType */ 'bgate',
      /* sampleRate */ SAMPLE_RATE,
      /* spectralPeaksThreshold */ 0.0001,
      /* tuningFrequency */ 440,
      /* weightType */ 'cosine',
      /* windowType */ 'hann',
    )
    tonicRaw = keyResult.key
    tonic = normalizeKey(tonicRaw)  // Ab → G#, Bb → A#, etc.
    mode = keyResult.scale           // 'major' or 'minor'
    keyStrength = keyResult.strength
    camelot = toCamelot(tonic, mode)
    console.log(`    key=${tonicRaw}→${tonic} ${mode} (${camelot}), strength=${keyStrength.toFixed(3)}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`    KeyExtractor failed: ${msg}`)
  }

  // ── 4. RMS energy (overall + envelope) ──────────────────────────────────
  let overallRms = 0
  try {
    console.log(`    RMS overall...`)
    const rmsResult = essentia.RMS(signalVec)
    overallRms = rmsResult.rms
    console.log(`    RMS=${overallRms.toFixed(4)}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`    RMS failed: ${msg}`)
  }

  // Envelope: frame at 0.5s hop, compute RMS per frame
  // Only compute first 10 + last 10 to show the shape
  const envelopeFirst10: Array<{ t: number; rms: number }> = []
  try {
    console.log(`    RMS envelope (0.5s frames)...`)
    const frameSize = Math.floor(SAMPLE_RATE * 0.5)
    const hopSize = frameSize
    const nFrames = Math.floor((nSamples - frameSize) / hopSize) + 1
    const maxFrames = Math.min(nFrames, 10)

    for (let fi = 0; fi < maxFrames; fi++) {
      const start = fi * hopSize
      const frameSlice = float32.subarray(start, start + frameSize)
      const frameVec = essentia.arrayToVector(frameSlice)
      const r = essentia.RMS(frameVec)
      frameVec.delete()
      envelopeFirst10.push({ t: parseFloat((fi * 0.5).toFixed(1)), rms: parseFloat(r.rms.toFixed(4)) })
    }
    console.log(`    envelope computed (${envelopeFirst10.length} frames)`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`    RMS envelope failed: ${msg}`)
  }

  signalVec.delete()
  const analysisMs = Date.now() - analysisStart

  console.log(`  [done] fetch=${fetchMs}ms, analysis=${analysisMs}ms`)

  return {
    videoId, title, expectedBpm, expectedKey,
    durationSeconds: parseFloat(durationSeconds.toFixed(2)),
    sampleCount: nSamples,
    tempo: {
      bpm: parseFloat(bpm.toFixed(2)),
      bpmRaw: parseFloat(bpmRaw.toFixed(2)),
      halfTempoDetected,
      confidence: parseFloat(confidence.toFixed(4)),
      beatGrid,
      beatGridFirst10: beatGrid.slice(0, 10).map(v => parseFloat(v.toFixed(4))),
      bpmEstimates: bpmEstimates.slice(0, 5).map(v => parseFloat(v.toFixed(2))),
    },
    onsets: {
      first10: onsets.slice(0, 10).map(v => parseFloat(v.toFixed(4))),
      onsetRate: parseFloat(onsetRate.toFixed(2)),
      totalCount: onsets.length,
    },
    key: {
      tonic,
      tonicRaw,
      mode,
      camelot,
      strength: parseFloat(keyStrength.toFixed(4)),
    },
    energy: {
      overallRms: parseFloat(overallRms.toFixed(4)),
      envelopeFirst10,
    },
    timings: { fetchMs, analysisMs },
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('essentia.js spike — analyzing 3 test songs')
  console.log(`essentia version: ${essentia.version}\n`)

  const results: AnalysisResult[] = []

  for (const song of SONGS) {
    const result = await analyzeVideo(song)
    results.push(result)
  }

  console.log('\n\n====== FINAL RESULTS ======\n')
  console.log(JSON.stringify(results, null, 2))

  console.log('\n\n====== SUMMARY TABLE ======\n')
  console.log('videoId            | BPM raw | BPM corrected (expected) | halfTempo | Key (expected)                 | Camelot | confidence | beats | onsets')
  console.log('-------------------+---------+--------------------------+-----------+--------------------------------+---------+------------+-------+-------')
  for (const r of results) {
    if (r.error) {
      console.log(`${r.videoId.padEnd(18)} | ERROR: ${r.error}`)
      continue
    }
    const bpmStr = `${r.tempo.bpm.toFixed(1)} (~${r.expectedBpm})`
    const keyStr = `${r.key.tonic} ${r.key.mode} (${r.expectedKey})`
    console.log(
      `${r.videoId.padEnd(18)} | ${r.tempo.bpmRaw.toFixed(1).padEnd(7)} | ${bpmStr.padEnd(24)} | ${String(r.tempo.halfTempoDetected).padEnd(9)} | ${keyStr.padEnd(30)} | ${r.key.camelot.padEnd(7)} | ${r.tempo.confidence.toFixed(3).padEnd(10)} | ${String(r.tempo.beatGrid.length).padEnd(5)} | ${r.onsets.totalCount}`
    )
  }

  console.log('\n\n====== BPM ERROR ANALYSIS ======\n')
  for (const r of results) {
    if (!r.error) {
      const bpmErr = Math.abs(r.tempo.bpm - r.expectedBpm)
      const bpmErrRaw = Math.abs(r.tempo.bpmRaw - r.expectedBpm)
      console.log(`${r.title}:`)
      console.log(`  raw=${r.tempo.bpmRaw.toFixed(2)}, corrected=${r.tempo.bpm.toFixed(2)}, expected=${r.expectedBpm}`)
      console.log(`  error raw=${bpmErrRaw.toFixed(2)} BPM, corrected=${bpmErr.toFixed(2)} BPM`)
      console.log(`  within ±2 (acceptable)? ${bpmErr <= 2 ? 'YES' : 'NO'}   within ±0.5 (excellent)? ${bpmErr <= 0.5 ? 'YES' : 'NO'}`)
    }
  }
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
