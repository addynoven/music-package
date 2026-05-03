import { describe, it, expect } from 'vitest'
import { AnalysisSchema, safeParseAnalysis } from '../../../src/analysis/schema'

// ─── fixtures ─────────────────────────────────────────────────────────────────

/** Verbatim example object from the spec (require_for_the_game.md). */
const specExample = {
  videoId: '-tJYN-eG1zk',
  duration: 122.4,
  tempo: {
    bpm: 81.3,
    confidence: 0.87,
    beatGrid: [0.21, 0.95, 1.69, 2.43, 3.17],
  },
  onsets: [0.12, 0.21, 0.34, 0.95, 1.04, 1.69],
  key: {
    tonic: 'A',
    mode: 'minor',
    camelot: '8A',
    confidence: 0.74,
  },
  energy: {
    overall: 0.62,
    envelope: [
      { t: 0.0, rms: 0.12 },
      { t: 0.5, rms: 0.34 },
      { t: 1.0, rms: 0.41 },
    ],
  },
  sections: [
    { start: 0.0,  end: 18.5,  label: 'intro',  loudness: 0.18 },
    { start: 18.5, end: 60.2,  label: 'verse',  loudness: 0.45 },
    { start: 60.2, end: 96.0,  label: 'chorus', loudness: 0.72 },
    { start: 96.0, end: 122.4, label: 'outro',  loudness: 0.40 },
  ],
  analyzedAt: '2026-05-03T00:00:00Z',
}

/** Minimal valid Analysis — only required fields; optional nullable ones set to null. */
const minimalAnalysis = {
  videoId: '-tJYN-eG1zk',
  duration: 122.4,
  tempo: {
    bpm: 81.3,
    confidence: 0.87,
    beatGrid: [0.21, 0.95, 1.69],
  },
  onsets: [0.12, 0.21],
  key: null,
  energy: null,
  sections: null,
  analyzedAt: '2026-05-03T00:00:00Z',
}

// ─── AnalysisSchema — full spec example ───────────────────────────────────────

describe('AnalysisSchema — full spec example', () => {
  it('accepts the verbatim spec example object', () => {
    const result = AnalysisSchema.safeParse(specExample)
    expect(result.success).toBe(true)
  })
})

// ─── AnalysisSchema — minimal (required fields only) ─────────────────────────

describe('AnalysisSchema — minimal valid object', () => {
  it('accepts when only required fields are present and optionals are null', () => {
    const result = AnalysisSchema.safeParse(minimalAnalysis)
    expect(result.success).toBe(true)
  })

  it('key accepts null', () => {
    const result = AnalysisSchema.safeParse({ ...specExample, key: null })
    expect(result.success).toBe(true)
  })

  it('energy accepts null', () => {
    const result = AnalysisSchema.safeParse({ ...specExample, energy: null })
    expect(result.success).toBe(true)
  })

  it('sections accepts null', () => {
    const result = AnalysisSchema.safeParse({ ...specExample, sections: null })
    expect(result.success).toBe(true)
  })
})

// ─── AnalysisSchema — required field failures ─────────────────────────────────

describe('AnalysisSchema — required field validation', () => {
  it('rejects missing tempo.bpm', () => {
    const { bpm: _, ...tempoWithoutBpm } = specExample.tempo
    const result = AnalysisSchema.safeParse({ ...specExample, tempo: tempoWithoutBpm })
    expect(result.success).toBe(false)
  })

  it('rejects missing tempo.beatGrid', () => {
    const { beatGrid: _, ...tempoWithoutGrid } = specExample.tempo
    const result = AnalysisSchema.safeParse({ ...specExample, tempo: tempoWithoutGrid })
    expect(result.success).toBe(false)
  })

  it('rejects missing onsets', () => {
    const { onsets: _, ...withoutOnsets } = specExample
    const result = AnalysisSchema.safeParse(withoutOnsets)
    expect(result.success).toBe(false)
  })
})

// ─── AnalysisSchema — Key field validation ────────────────────────────────────

describe('AnalysisSchema — Key validation', () => {
  it('rejects invalid tonic "Bb" (flats are not allowed, sharps only)', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      key: { ...specExample.key, tonic: 'Bb' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid mode "dorian"', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      key: { ...specExample.key, mode: 'dorian' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid camelot "13A" (only 1–12 are valid)', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      key: { ...specExample.key, camelot: '13A' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid camelot A values (1A–12A)', () => {
    for (let n = 1; n <= 12; n++) {
      const result = AnalysisSchema.safeParse({
        ...specExample,
        key: { ...specExample.key, camelot: `${n}A` },
      })
      expect(result.success, `expected ${n}A to be valid`).toBe(true)
    }
  })

  it('accepts all valid camelot B values (1B–12B)', () => {
    for (let n = 1; n <= 12; n++) {
      const result = AnalysisSchema.safeParse({
        ...specExample,
        key: { ...specExample.key, camelot: `${n}B` },
      })
      expect(result.success, `expected ${n}B to be valid`).toBe(true)
    }
  })
})

// ─── AnalysisSchema — confidence range [0, 1] ─────────────────────────────────

describe('AnalysisSchema — confidence range', () => {
  it('rejects tempo.confidence below 0', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      tempo: { ...specExample.tempo, confidence: -0.1 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects tempo.confidence above 1', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      tempo: { ...specExample.tempo, confidence: 1.01 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects key.confidence below 0', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      key: { ...specExample.key, confidence: -0.01 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects key.confidence above 1', () => {
    const result = AnalysisSchema.safeParse({
      ...specExample,
      key: { ...specExample.key, confidence: 1.5 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts confidence at boundary values 0 and 1', () => {
    const atZero = AnalysisSchema.safeParse({
      ...specExample,
      tempo: { ...specExample.tempo, confidence: 0 },
      key: { ...specExample.key, confidence: 0 },
    })
    expect(atZero.success).toBe(true)

    const atOne = AnalysisSchema.safeParse({
      ...specExample,
      tempo: { ...specExample.tempo, confidence: 1 },
      key: { ...specExample.key, confidence: 1 },
    })
    expect(atOne.success).toBe(true)
  })
})

// ─── safeParseAnalysis helper ─────────────────────────────────────────────────

describe('safeParseAnalysis', () => {
  it('returns the analysis when valid', () => {
    const result = safeParseAnalysis(specExample)
    expect(result).not.toBeNull()
    expect(result!.videoId).toBe('-tJYN-eG1zk')
    expect(result!.tempo.bpm).toBe(81.3)
  })

  it('returns null when invalid', () => {
    expect(safeParseAnalysis({ videoId: 'x', duration: 10 })).toBeNull()
  })
})
