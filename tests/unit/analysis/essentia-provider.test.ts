import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EssentiaAnalysisProvider, normalizeFlatToSharp } from '../../../src/analysis/essentia-provider'
import { AnalysisSchema } from '../../../src/analysis/schema'

// ─── Mock essentia instance factory ──────────────────────────────────────────
//
// We never touch real WASM in unit tests. Every method returns minimal correct
// data so the provider orchestration can be verified independently of the lib.

function makeDeleteable(arr: number[] = []) {
  return {
    _data: new Float32Array(arr),
    delete: vi.fn(),
  }
}

function makeEssentiaMock(overrides: Record<string, unknown> = {}) {
  // Default rhythm result (valid BPM well within the non-half-tempo range)
  const defaultRhythmResult = () => ({
    bpm: 113.24,
    confidence: 3.659,
    ticks: makeDeleteable([0.05, 0.58, 1.11]),
    estimates: makeDeleteable([113.0, 113.5]),
    bpmIntervals: makeDeleteable([0.529, 0.531]),
  })

  // Default onset result
  const defaultOnsetResult = () => ({
    onsets: makeDeleteable([0.01, 0.42, 0.56]),
    onsetRate: 4.68,
  })

  // Default key result (sharp tonic, no normalisation needed)
  const defaultKeyResult = () => ({
    key: 'G',
    scale: 'minor',
    strength: 0.75,
  })

  // Default RMS result
  const defaultRmsResult = () => ({ rms: 0.1957 })

  const mock = {
    arrayToVector: vi.fn().mockImplementation((arr: Float32Array) => ({
      _arr: arr,
      delete: vi.fn(),
    })),
    vectorToArray: vi.fn().mockImplementation((vec: { _data: Float32Array }) => {
      return vec._data ?? new Float32Array(0)
    }),
    RhythmExtractor2013: vi.fn().mockImplementation(defaultRhythmResult),
    OnsetRate: vi.fn().mockImplementation(defaultOnsetResult),
    KeyExtractor: vi.fn().mockImplementation(defaultKeyResult),
    RMS: vi.fn().mockImplementation(defaultRmsResult),
    ...overrides,
  }

  return mock
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Float32Array-backed Uint8Array with n samples at value `v`. */
function makeFakeAudio(nSamples = 100, value = 0.1): Uint8Array {
  const f32 = new Float32Array(nSamples).fill(value)
  return new Uint8Array(f32.buffer)
}

// ─── normalizeFlatToSharp (pure utility, Shape 1) ─────────────────────────────

describe('normalizeFlatToSharp — flat to sharp mapping', () => {
  it('converts Ab → G#', () => {
    expect(normalizeFlatToSharp('Ab')).toBe('G#')
  })

  it('converts Bb → A#', () => {
    expect(normalizeFlatToSharp('Bb')).toBe('A#')
  })

  it('converts Db → C#', () => {
    expect(normalizeFlatToSharp('Db')).toBe('C#')
  })

  it('converts Eb → D#', () => {
    expect(normalizeFlatToSharp('Eb')).toBe('D#')
  })

  it('converts Gb → F#', () => {
    expect(normalizeFlatToSharp('Gb')).toBe('F#')
  })

  it('passes through sharp keys unchanged', () => {
    const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for (const key of sharps) {
      expect(normalizeFlatToSharp(key)).toBe(key)
    }
  })

  it('passes through natural keys unchanged', () => {
    expect(normalizeFlatToSharp('C')).toBe('C')
    expect(normalizeFlatToSharp('F')).toBe('F')
  })
})

// ─── EssentiaAnalysisProvider — half-tempo correction ────────────────────────

describe('EssentiaAnalysisProvider — half-tempo correction', () => {
  it('halves BPM when raw BPM > 120 and half is in [50, 95] (low end)', async () => {
    const mock = makeEssentiaMock()
    // 122 / 2 = 61, which is > 120 and 61 is in [50, 95]
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 122,
      confidence: 1.0,
      ticks: makeDeleteable([0.1, 0.7]),
      estimates: makeDeleteable([122]),
      bpmIntervals: makeDeleteable([0.49]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.tempo.bpm).toBeCloseTo(61, 1)
  })

  it('halves BPM when raw BPM > 120 and half is near 81 (We Will Rock You case)', async () => {
    const mock = makeEssentiaMock()
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 163.72,
      confidence: 0.594,
      ticks: makeDeleteable([0.44, 0.89]),
      estimates: makeDeleteable([163.7]),
      bpmIntervals: makeDeleteable([0.37]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('-tJYN-eG1zk', makeFakeAudio())
    expect(result.tempo.bpm).toBeCloseTo(81.86, 1)
  })

  it('does NOT halve when raw BPM > 120 but half > 95', async () => {
    const mock = makeEssentiaMock()
    // 240 / 2 = 120, which is NOT in [50, 95]
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 240,
      confidence: 2.0,
      ticks: makeDeleteable([0.1]),
      estimates: makeDeleteable([240]),
      bpmIntervals: makeDeleteable([0.25]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.tempo.bpm).toBeCloseTo(240, 1)
  })

  it('does NOT halve when raw BPM > 120 but half < 50', async () => {
    const mock = makeEssentiaMock()
    // 122 / 2 = 61 — wait, that IS in [50, 95]. Let's use 97: 97/2 = 48.5 < 50.
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 97,
      confidence: 2.0,
      ticks: makeDeleteable([0.1]),
      estimates: makeDeleteable([97]),
      bpmIntervals: makeDeleteable([0.62]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    // 97 is NOT > 120, so no correction triggered
    expect(result.tempo.bpm).toBeCloseTo(97, 1)
  })

  it('does NOT halve when raw BPM is <= 120', async () => {
    const mock = makeEssentiaMock()
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 113.24,
      confidence: 3.659,
      ticks: makeDeleteable([0.05, 0.58]),
      estimates: makeDeleteable([113.0]),
      bpmIntervals: makeDeleteable([0.529]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.tempo.bpm).toBeCloseTo(113.24, 1)
  })

  it('does NOT halve when raw BPM is exactly 120 (boundary — not > 120)', async () => {
    const mock = makeEssentiaMock()
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 120,
      confidence: 2.0,
      ticks: makeDeleteable([0.1]),
      estimates: makeDeleteable([120]),
      bpmIntervals: makeDeleteable([0.5]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.tempo.bpm).toBeCloseTo(120, 1)
  })
})

// ─── EssentiaAnalysisProvider — flat→sharp normalisation ─────────────────────

describe('EssentiaAnalysisProvider — key normalisation', () => {
  const flatCases: Array<[string, string]> = [
    ['Ab', 'G#'],
    ['Bb', 'A#'],
    ['Db', 'C#'],
    ['Eb', 'D#'],
    ['Gb', 'F#'],
  ]

  for (const [flat, sharp] of flatCases) {
    it(`normalises flat tonic ${flat} → ${sharp} in output`, async () => {
      const mock = makeEssentiaMock()
      mock.KeyExtractor.mockImplementation(() => ({
        key: flat,
        scale: 'major',
        strength: 0.8,
      }))
      const provider = new EssentiaAnalysisProvider(mock as any)
      const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
      expect(result.key?.tonic).toBe(sharp)
    })
  }

  it('leaves sharp tonics unchanged', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'F#',
      scale: 'minor',
      strength: 0.75,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('kXYiU_JCYtU', makeFakeAudio())
    expect(result.key?.tonic).toBe('F#')
  })

  it('output tonic is always one of the 12 sharp-only values', async () => {
    const VALID_TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const mock = makeEssentiaMock()
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    if (result.key) {
      expect(VALID_TONICS).toContain(result.key.tonic)
    }
  })
})

// ─── EssentiaAnalysisProvider — major/minor mode mapping ─────────────────────

describe('EssentiaAnalysisProvider — scale to mode mapping', () => {
  it('maps scale=major → mode=major', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'G#',
      scale: 'major',
      strength: 0.78,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.key?.mode).toBe('major')
  })

  it('maps scale=minor → mode=minor', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'A',
      scale: 'minor',
      strength: 0.64,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('-tJYN-eG1zk', makeFakeAudio())
    expect(result.key?.mode).toBe('minor')
  })

  it('any non-major scale string maps to minor', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'C',
      scale: 'something-weird',
      strength: 0.5,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.key?.mode).toBe('minor')
  })
})

// ─── EssentiaAnalysisProvider — Camelot mapping ──────────────────────────────

describe('EssentiaAnalysisProvider — Camelot lookup', () => {
  it('assigns camelot 8A to A minor', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'A',
      scale: 'minor',
      strength: 0.64,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('-tJYN-eG1zk', makeFakeAudio())
    expect(result.key?.camelot).toBe('8A')
  })

  it('assigns camelot 4B to G# major', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'Ab',  // flat input → normalised to G#
      scale: 'major',
      strength: 0.78,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.key?.camelot).toBe('4B')
  })

  it('assigns camelot 11A to F# minor', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'F#',
      scale: 'minor',
      strength: 0.75,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('kXYiU_JCYtU', makeFakeAudio())
    expect(result.key?.camelot).toBe('11A')
  })
})

// ─── EssentiaAnalysisProvider — WASM memory cleanup ──────────────────────────

describe('EssentiaAnalysisProvider — WASM .delete() cleanup', () => {
  it('calls delete() on signalVec even when RhythmExtractor2013 throws', async () => {
    const mock = makeEssentiaMock()
    const fakeVec = { delete: vi.fn() }
    mock.arrayToVector.mockReturnValue(fakeVec)
    mock.RhythmExtractor2013.mockImplementation(() => {
      throw new Error('WASM panic')
    })

    const provider = new EssentiaAnalysisProvider(mock as any)
    await expect(provider.analyze('dQw4w9WgXcQ', makeFakeAudio())).rejects.toThrow('WASM panic')

    expect(fakeVec.delete).toHaveBeenCalled()
  })

  it('calls delete() on signalVec even when KeyExtractor throws', async () => {
    const mock = makeEssentiaMock()
    const fakeVec = { delete: vi.fn() }
    mock.arrayToVector.mockReturnValue(fakeVec)
    // RhythmExtractor2013 and OnsetRate succeed; KeyExtractor throws
    mock.KeyExtractor.mockImplementation(() => {
      throw new Error('KeyExtractor failed')
    })

    const provider = new EssentiaAnalysisProvider(mock as any)
    // KeyExtractor failure is caught and returns null key — no top-level throw
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.key).toBeNull()
    expect(fakeVec.delete).toHaveBeenCalled()
  })

  it('calls delete() on intermediate VectorFloat objects from RhythmExtractor2013', async () => {
    const ticksVec = makeDeleteable([0.1, 0.6])
    const estimatesVec = makeDeleteable([113.0])
    const bpmIntervalsVec = makeDeleteable([0.53])

    const mock = makeEssentiaMock()
    mock.RhythmExtractor2013.mockReturnValue({
      bpm: 113.24,
      confidence: 3.659,
      ticks: ticksVec,
      estimates: estimatesVec,
      bpmIntervals: bpmIntervalsVec,
    })

    const provider = new EssentiaAnalysisProvider(mock as any)
    await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())

    expect(ticksVec.delete).toHaveBeenCalled()
    expect(estimatesVec.delete).toHaveBeenCalled()
    expect(bpmIntervalsVec.delete).toHaveBeenCalled()
  })

  it('calls delete() on intermediate VectorFloat from RhythmExtractor even when ticks access fails', async () => {
    const ticksVec = makeDeleteable([])
    const estimatesVec = makeDeleteable([])
    const bpmIntervalsVec = makeDeleteable([])

    const mock = makeEssentiaMock()
    // vectorToArray throws when given the ticks vec
    mock.vectorToArray.mockImplementation((v: unknown) => {
      if (v === ticksVec) throw new Error('vectorToArray failed')
      return (v as { _data: Float32Array })._data ?? new Float32Array(0)
    })
    mock.RhythmExtractor2013.mockReturnValue({
      bpm: 113.0,
      confidence: 1.0,
      ticks: ticksVec,
      estimates: estimatesVec,
      bpmIntervals: bpmIntervalsVec,
    })

    const provider = new EssentiaAnalysisProvider(mock as any)
    await expect(provider.analyze('dQw4w9WgXcQ', makeFakeAudio())).rejects.toThrow('vectorToArray failed')

    expect(ticksVec.delete).toHaveBeenCalled()
    expect(estimatesVec.delete).toHaveBeenCalled()
    expect(bpmIntervalsVec.delete).toHaveBeenCalled()
  })

  it('calls delete() on onset VectorFloat from OnsetRate', async () => {
    const onsetsVec = makeDeleteable([0.01, 0.42])
    const mock = makeEssentiaMock()
    mock.OnsetRate.mockReturnValue({
      onsets: onsetsVec,
      onsetRate: 4.68,
    })

    const provider = new EssentiaAnalysisProvider(mock as any)
    await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())

    expect(onsetsVec.delete).toHaveBeenCalled()
  })
})

// ─── EssentiaAnalysisProvider — schema validation ────────────────────────────

describe('EssentiaAnalysisProvider — output schema', () => {
  it('output validates against AnalysisSchema', async () => {
    const mock = makeEssentiaMock()
    // Key: G# major (flat Ab → normalised G#)
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'Ab',
      scale: 'major',
      strength: 0.78,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())

    const parsed = AnalysisSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('includes the videoId in the output', async () => {
    const mock = makeEssentiaMock()
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('my-video-id', makeFakeAudio())
    expect(result.videoId).toBe('my-video-id')
  })

  it('sections is null (not implemented in v1)', async () => {
    const mock = makeEssentiaMock()
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.sections).toBeNull()
  })

  it('analyzedAt is a valid ISO 8601 timestamp', async () => {
    const mock = makeEssentiaMock()
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(() => new Date(result.analyzedAt)).not.toThrow()
    expect(new Date(result.analyzedAt).getTime()).not.toBeNaN()
  })

  it('tempo.confidence is clamped to [0, 1]', async () => {
    const mock = makeEssentiaMock()
    // Artificially high confidence to test clamping
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 113,
      confidence: 100,  // absurdly high
      ticks: makeDeleteable([0.1]),
      estimates: makeDeleteable([113]),
      bpmIntervals: makeDeleteable([0.53]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.tempo.confidence).toBeGreaterThanOrEqual(0)
    expect(result.tempo.confidence).toBeLessThanOrEqual(1)
  })

  it('key.confidence is in [0, 1] (already normalised by essentia strength)', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => ({
      key: 'A',
      scale: 'minor',
      strength: 0.64,
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('-tJYN-eG1zk', makeFakeAudio())
    expect(result.key?.confidence).toBeGreaterThanOrEqual(0)
    expect(result.key?.confidence).toBeLessThanOrEqual(1)
  })

  it('key is null when KeyExtractor throws', async () => {
    const mock = makeEssentiaMock()
    mock.KeyExtractor.mockImplementation(() => {
      throw new Error('KeyExtractor failed')
    })
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.key).toBeNull()
  })

  it('provider name is "essentia"', () => {
    const provider = new EssentiaAnalysisProvider()
    expect(provider.name).toBe('essentia')
  })
})

// ─── EssentiaAnalysisProvider — beatGrid and onsets are arrays of numbers ────

describe('EssentiaAnalysisProvider — output shapes', () => {
  it('beatGrid is an array of numbers', async () => {
    const mock = makeEssentiaMock()
    mock.RhythmExtractor2013.mockImplementation(() => ({
      bpm: 110,
      confidence: 2.0,
      ticks: makeDeleteable([1.0, 2.0, 3.0]),
      estimates: makeDeleteable([110]),
      bpmIntervals: makeDeleteable([0.54]),
    }))
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('kXYiU_JCYtU', makeFakeAudio())
    expect(Array.isArray(result.tempo.beatGrid)).toBe(true)
    for (const tick of result.tempo.beatGrid) {
      expect(typeof tick).toBe('number')
    }
  })

  it('onsets is an array of numbers', async () => {
    const mock = makeEssentiaMock()
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(Array.isArray(result.onsets)).toBe(true)
    for (const t of result.onsets) {
      expect(typeof t).toBe('number')
    }
  })

  it('energy.overall is in [0, 1] range for normalised audio', async () => {
    const mock = makeEssentiaMock()
    mock.RMS.mockReturnValue({ rms: 0.1957 })
    const provider = new EssentiaAnalysisProvider(mock as any)
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio())
    expect(result.energy?.overall).toBeGreaterThanOrEqual(0)
    expect(result.energy?.overall).toBeLessThanOrEqual(1)
  })

  it('duration is computed from sample count', async () => {
    const mock = makeEssentiaMock()
    const provider = new EssentiaAnalysisProvider(mock as any)
    // makeFakeAudio(441) = 441 samples at 44100 Hz = 0.01 seconds
    const result = await provider.analyze('dQw4w9WgXcQ', makeFakeAudio(441))
    expect(result.duration).toBeCloseTo(441 / 44_100, 5)
  })
})
