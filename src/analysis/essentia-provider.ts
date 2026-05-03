/**
 * EssentiaAnalysisProvider — audio analysis via essentia.js WASM.
 *
 * Gotchas baked in from the Wave-1 spike (essentia-spike-report.md):
 *
 * 1. TS defs for RhythmExtractor2013 are WRONG. Runtime keys are
 *    `ticks` / `estimates` / `bpmIntervals`, NOT `beats_position` /
 *    `bpm_estimates` / `bpm_intervals`. We read the raw output as `any`.
 *
 * 2. Half-tempo correction: if BPM > 120 AND BPM/2 ∈ [50, 95], divide by 2.
 *    This fixes We Will Rock You (~163 BPM raw → ~81 BPM correct).
 *
 * 3. KeyExtractor returns flats (`Ab`). Spec mandates sharps. We normalise
 *    all 5 flat tonic values at the boundary before any Camelot lookup.
 *
 * 4. KeyExtractor actual runtime key for the scale is `scale`, NOT `mode`.
 *
 * 5. OnsetRate is hard-wired to 44 100 Hz internally. The audio passed in
 *    MUST be at 44 100 Hz — callers (the integration layer) are responsible
 *    for decoding at that rate. If the provided `sampleRate` differs we throw
 *    rather than silently produce wrong timestamps.
 *
 * 6. Every WASM `VectorFloat` MUST be `.delete()`'d in a `try/finally` or
 *    the WASM heap leaks on long-running servers.
 */

import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { keyToCamelot } from './camelot'
import { safeParseAnalysis } from './schema'
import type { Analysis, AnalysisProvider } from './types'

// ─── Flat → sharp normalisation ───────────────────────────────────────────────

const FLAT_TO_SHARP: Record<string, string> = {
  Ab: 'G#',
  Bb: 'A#',
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
}

export function normalizeFlatToSharp(key: string): string {
  return FLAT_TO_SHARP[key] ?? key
}

// ─── Valid sharp tonics (matches the Tonic union in types.ts) ─────────────────

const SHARP_TONICS = new Set([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
])

// ─── PCM fetching ─────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44_100

/**
 * Fetches audio for a videoId and decodes it to mono Float32 PCM at 44 100 Hz.
 * Uses yt-dlp piped through ffmpeg, exactly as the spike proved.
 *
 * @returns Object with the Float32Array of samples and duration in seconds.
 */
async function fetchPCM(
  videoId: string,
  cookiesPath?: string,
): Promise<{ float32: Float32Array; durationSec: number }> {
  const cookiesArgs = cookiesPath ? ['--cookies', cookiesPath] : []

  const ytdlp = spawn('yt-dlp', [
    '--no-playlist',
    ...cookiesArgs,
    '-f', 'bestaudio',
    '-o', '-',
    '--quiet',
    `https://music.youtube.com/watch?v=${videoId}`,
  ])

  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-ac', '1',       // mono — essentia expects mono input
    '-ar', String(SAMPLE_RATE),  // 44 100 Hz — required by OnsetRate
    '-f', 'f32le',    // float32 little-endian — maps directly to Float32Array
    'pipe:1',
  ])

  ytdlp.stderr.resume()
  ffmpeg.stderr.resume()

  // pipeline() handles backpressure; plain .pipe() can drop data under load.
  pipeline(ytdlp.stdout, ffmpeg.stdin).catch(() => {})

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    ffmpeg.stdout.on('end', () => {
      const buf = Buffer.concat(chunks)
      const nSamples = buf.byteLength / 4  // f32le = 4 bytes per sample
      const float32 = new Float32Array(nSamples)
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
      for (let i = 0; i < nSamples; i++) {
        float32[i] = dv.getFloat32(i * 4, /* littleEndian= */ true)
      }
      resolve({ float32, durationSec: nSamples / SAMPLE_RATE })
    })

    ffmpeg.on('error', (e: Error) =>
      reject(new Error(`ffmpeg spawn error: ${e.message}`)))
    ytdlp.on('error', (e: Error) =>
      reject(new Error(`yt-dlp spawn error: ${e.message}`)))
    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`))
    })
    ytdlp.on('close', () => {
      ffmpeg.stdin.end()
    })
  })
}

// ─── Essentia instance type (avoid importing the module at type-level) ────────

export interface EssentiaInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arrayToVector(arr: Float32Array): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vectorToArray(vec: any): Float32Array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RhythmExtractor2013(...args: unknown[]): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OnsetRate(signal: unknown): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  KeyExtractor(...args: unknown[]): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RMS(signal: unknown): any
}

// ─── EssentiaAnalysisProvider ─────────────────────────────────────────────────

export class EssentiaAnalysisProvider implements AnalysisProvider {
  readonly name = 'essentia'

  private _essentia: EssentiaInstance | null = null
  private readonly _injected: EssentiaInstance | null

  /**
   * @param essentiaInstance Optional pre-initialised essentia instance for DI
   *   (used in unit tests so we never touch real WASM there).
   * @param cookiesPath Optional path to a Netscape cookies file passed to yt-dlp.
   */
  constructor(essentiaInstance?: EssentiaInstance, private readonly cookiesPath?: string) {
    this._injected = essentiaInstance ?? null
  }

  private getEssentia(): EssentiaInstance {
    if (this._injected) return this._injected
    if (this._essentia) return this._essentia

    // Lazy-load essentia.js so it's not required unless analyze() is actually called.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EssentiaWASM, Essentia } = require('essentia.js')
    this._essentia = new Essentia(EssentiaWASM) as EssentiaInstance
    return this._essentia
  }

  /**
   * Analyse the given audio buffer and return an `Analysis`.
   *
   * The `audio` parameter must be mono Float32 PCM at 44 100 Hz encoded as f32le.
   * If you pass raw bytes from yt-dlp/ffmpeg, this is already the case when
   * ffmpeg is invoked with `-ac 1 -ar 44100 -f f32le`.
   *
   * When `audio` is empty (length 0) the method falls back to fetching audio
   * directly via yt-dlp + ffmpeg using `videoId` — this is the primary path
   * used by the integration layer and integration tests.
   */
  async analyze(videoId: string, audio: Uint8Array): Promise<Analysis> {
    const essentia = this.getEssentia()

    let float32: Float32Array
    let durationSec: number

    if (audio.length === 0) {
      // No pre-fetched audio — go get it ourselves.
      const fetched = await fetchPCM(videoId, this.cookiesPath)
      float32 = fetched.float32
      durationSec = fetched.durationSec
    } else {
      // Caller provided raw f32le bytes — wrap them.
      const nSamples = audio.byteLength / 4
      float32 = new Float32Array(nSamples)
      const dv = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
      for (let i = 0; i < nSamples; i++) {
        float32[i] = dv.getFloat32(i * 4, /* littleEndian= */ true)
      }
      durationSec = nSamples / SAMPLE_RATE
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let signalVec: any = null

    try {
      signalVec = essentia.arrayToVector(float32)

      const tempo = this._extractTempo(essentia, signalVec)
      const onsets = this._extractOnsets(essentia, signalVec)
      const key = this._extractKey(essentia, signalVec)
      const energy = this._extractEnergy(essentia, signalVec, float32)

      const raw: Analysis = {
        videoId,
        duration: durationSec,
        tempo,
        onsets,
        key,
        energy,
        sections: null,
        analyzedAt: new Date().toISOString(),
      }

      const validated = safeParseAnalysis(raw)
      if (!validated) {
        throw new Error(
          `EssentiaAnalysisProvider: output failed schema validation for videoId=${videoId}. ` +
          `Raw output: ${JSON.stringify({ bpm: raw.tempo.bpm, tonic: raw.key?.tonic, mode: raw.key?.mode })}`,
        )
      }

      return validated
    } finally {
      signalVec?.delete()
    }
  }

  // ─── Rhythm extraction ────────────────────────────────────────────────────

  private _extractTempo(
    essentia: EssentiaInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signalVec: any,
  ): Analysis['tempo'] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ticksVec: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let estimatesVec: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bpmIntervalsVec: any = null

    try {
      // NOTE: Field names differ from the TS defs — use `as any` and access
      //       the real runtime fields: ticks / estimates / bpmIntervals.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = essentia.RhythmExtractor2013(signalVec, 208, 'multifeature', 40)

      ticksVec = r.ticks           // TS defs say 'beats_position' — WRONG
      estimatesVec = r.estimates   // TS defs say 'bpm_estimates'  — WRONG
      bpmIntervalsVec = r.bpmIntervals  // TS defs say 'bpm_intervals' — WRONG

      const rawBpm: number = r.bpm
      const rawConfidence: number = r.confidence  // range: [0, ~5.32]

      const beatGrid = Array.from(essentia.vectorToArray(ticksVec)) as number[]

      // Half-tempo correction: RhythmExtractor2013 with multifeature mode can
      // detect double-tempo for sparse-beat songs (e.g. We Will Rock You at
      // ~163 BPM when the real tempo is ~81 BPM). Heuristic from the spike:
      // if raw BPM > 120 AND the halved value falls in [50, 95], halve it.
      let bpm = rawBpm
      if (rawBpm > 120) {
        const half = rawBpm / 2
        if (half >= 50 && half <= 95) {
          bpm = half
        }
      }

      // Normalise confidence to [0, 1]. The observed maximum from the spike
      // was ~5.32, which matches the BeatTrackerMultiFeature documentation.
      const confidence = Math.min(1, Math.max(0, rawConfidence / 5.32))

      return { bpm, confidence, beatGrid }
    } finally {
      ticksVec?.delete()
      estimatesVec?.delete()
      bpmIntervalsVec?.delete()
    }
  }

  // ─── Onset extraction ─────────────────────────────────────────────────────

  private _extractOnsets(
    essentia: EssentiaInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signalVec: any,
  ): number[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let onsetsVec: any = null

    try {
      // OnsetRate is hard-wired to 44 100 Hz internally. The signal MUST be
      // at that rate or timestamps will be off by a factor of ~1.088 (48k/44.1k).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = essentia.OnsetRate(signalVec)
      onsetsVec = r.onsets
      return Array.from(essentia.vectorToArray(onsetsVec)) as number[]
    } finally {
      onsetsVec?.delete()
    }
  }

  // ─── Key extraction ───────────────────────────────────────────────────────

  private _extractKey(
    essentia: EssentiaInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signalVec: any,
  ): Analysis['key'] {
    try {
      // Using `bgate` profile: outperforms default `temperley` for pop/rock.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = essentia.KeyExtractor(
        signalVec,
        /* averageDetuningCorrection */ true,
        /* frameSize              */ 4096,
        /* hopSize                */ 4096,
        /* hpcpSize               */ 36,
        /* maxFrequency           */ 5000,
        /* maximumSpectralPeaks   */ 60,
        /* minFrequency           */ 25,
        /* pcpThreshold           */ 0.2,
        /* profileType            */ 'bgate',
        /* sampleRate             */ SAMPLE_RATE,
        /* spectralPeaksThreshold */ 0.0001,
        /* tuningFrequency        */ 440,
        /* weightType             */ 'cosine',
        /* windowType             */ 'hann',
      )

      // Normalise flats → sharps. Essentia may return Ab, Bb, Db, Eb, Gb.
      const rawTonic: string = r.key
      const tonic = normalizeFlatToSharp(rawTonic)

      // Guard: if normalisation still left a non-sharp value, bail gracefully.
      if (!SHARP_TONICS.has(tonic)) return null

      // r.scale is the actual runtime key; the TS defs incorrectly say r.mode.
      const scale: string = r.scale
      const mode: 'major' | 'minor' = scale === 'major' ? 'major' : 'minor'

      const tonicTyped = tonic as 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'
      const camelot = keyToCamelot(tonicTyped, mode)

      // r.strength is key detection confidence, already in [0, 1].
      const confidence: number = r.strength

      return { tonic: tonicTyped, mode, camelot, confidence }
    } catch {
      // If KeyExtractor fails for any reason, return null (not an analysis error).
      return null
    }
  }

  // ─── Energy extraction ────────────────────────────────────────────────────

  private _extractEnergy(
    essentia: EssentiaInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signalVec: any,
    float32: Float32Array,
  ): Analysis['energy'] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rmsResult: any = essentia.RMS(signalVec)
      const overall: number = rmsResult.rms

      // Compute RMS envelope at ~2 Hz (0.5 s frames).
      // Skip envelope for very short audio (< 1 s) to avoid noise.
      const frameSize = Math.floor(SAMPLE_RATE * 0.5)
      const nFrames = Math.floor((float32.length - frameSize) / frameSize) + 1

      if (nFrames < 1 || float32.length < frameSize) {
        return { overall }
      }

      const envelope: Array<{ t: number; rms: number }> = []
      for (let fi = 0; fi < nFrames; fi++) {
        const start = fi * frameSize
        const slice = float32.subarray(start, start + frameSize)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let frameVec: any = null
        try {
          frameVec = essentia.arrayToVector(slice)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r: any = essentia.RMS(frameVec)
          envelope.push({ t: fi * 0.5, rms: r.rms })
        } finally {
          frameVec?.delete()
        }
      }

      return { overall, envelope }
    } catch {
      return null
    }
  }
}
