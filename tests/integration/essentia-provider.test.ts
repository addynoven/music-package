/**
 * Integration — EssentiaAnalysisProvider with real essentia.js + real audio.
 *
 * This test fetches audio for 3 well-known YouTube Music tracks via yt-dlp,
 * runs the full essentia.js analysis pipeline, and validates BPM / key /
 * Camelot against the calibrated spec values from the Wave-1 spike.
 *
 * What's real: essentia.js WASM, yt-dlp audio fetch, ffmpeg PCM decode.
 * What's mocked: nothing — this is a full end-to-end pipeline test.
 *
 * Tolerance bands are from essentia-spike-report.md (actual measured values):
 *   We Will Rock You  — raw BPM 163.72 → corrected 81.86 (±2 of 81)
 *   Never Gonna Give  — raw BPM 113.24 (±2 of 113)
 *   Numb              — raw BPM 110.06 (±2 of 110)
 *
 * Known stable IDs used:
 *   videoId  -tJYN-eG1zk  — Queen "We Will Rock You" (half-tempo correction test)
 *   videoId  dQw4w9WgXcQ  — Rick Astley "Never Gonna Give You Up" (flat→sharp test: Ab→G#)
 *   videoId  kXYiU_JCYtU  — Linkin Park "Numb" (F# minor, 11A)
 *
 * Run with: RUN_INTEGRATION=1 pnpm test:integration
 */

import { describe, it, expect } from 'vitest'
import { EssentiaAnalysisProvider } from '../../src/analysis/essentia-provider'
import { AnalysisSchema } from '../../src/analysis/schema'

const SKIP = !process.env.RUN_INTEGRATION

// ─── Spec fixtures ────────────────────────────────────────────────────────────

const SPEC = [
  {
    videoId: '-tJYN-eG1zk',
    label: 'Queen — We Will Rock You',
    bpmRange: [79, 83] as [number, number],
    tonic: 'A',
    mode: 'minor' as const,
    camelot: '8A',
  },
  {
    videoId: 'dQw4w9WgXcQ',
    label: 'Rick Astley — Never Gonna Give You Up',
    bpmRange: [111, 115] as [number, number],
    tonic: 'G#',
    mode: 'major' as const,
    camelot: '4B',
  },
  {
    videoId: 'kXYiU_JCYtU',
    label: 'Linkin Park — Numb',
    bpmRange: [108, 112] as [number, number],
    tonic: 'F#',
    mode: 'minor' as const,
    camelot: '11A',
  },
]

// ─── Shared provider instance (lazy WASM load, one per test run) ──────────────

const provider = new EssentiaAnalysisProvider()

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)('Integration — EssentiaAnalysisProvider', () => {
  for (const spec of SPEC) {
    describe(spec.label, () => {
      // analyze() with empty audio triggers internal yt-dlp fetch at 44 100 Hz
      let result: Awaited<ReturnType<typeof provider.analyze>>

      it('analyzes without error', async () => {
        result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result).toBeDefined()
      }, 60_000)  // full fetch + analysis can take up to 20s; give 60s budget

      it(`BPM is within spec tolerance [${spec.bpmRange[0]}, ${spec.bpmRange[1]}]`, async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result.tempo.bpm).toBeGreaterThanOrEqual(spec.bpmRange[0])
        expect(result.tempo.bpm).toBeLessThanOrEqual(spec.bpmRange[1])
      }, 60_000)

      it(`key tonic is ${spec.tonic}`, async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result.key?.tonic).toBe(spec.tonic)
      }, 60_000)

      it(`key mode is ${spec.mode}`, async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result.key?.mode).toBe(spec.mode)
      }, 60_000)

      it(`camelot is ${spec.camelot}`, async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result.key?.camelot).toBe(spec.camelot)
      }, 60_000)

      it('output validates against AnalysisSchema', async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        const parsed = AnalysisSchema.safeParse(result)
        expect(parsed.success).toBe(true)
      }, 60_000)

      it('beat grid is non-empty', async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result.tempo.beatGrid.length).toBeGreaterThan(50)
      }, 60_000)

      it('onsets are non-empty', async () => {
        if (!result) result = await provider.analyze(spec.videoId, new Uint8Array(0))
        expect(result.onsets.length).toBeGreaterThan(50)
      }, 60_000)
    })
  }
})
