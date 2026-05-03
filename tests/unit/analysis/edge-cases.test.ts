import { describe, it, expect } from 'vitest'
import { AnalysisSchema } from '../../../src/analysis/schema'
import type { Analysis, AnalysisProvider } from '../../../src/analysis/types'

// ─── fixtures ─────────────────────────────────────────────────────────────────

const base: Analysis = {
  videoId: '-tJYN-eG1zk',
  duration: 122.4,
  tempo: {
    bpm: 81.3,
    confidence: 0.87,
    beatGrid: [0.21, 0.95, 1.69, 2.43, 3.17],
  },
  onsets: [0.12, 0.21, 0.34, 0.95],
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
    ],
  },
  sections: [
    { start: 0.0, end: 18.5, label: 'intro', loudness: 0.18 },
  ],
  analyzedAt: '2026-05-03T00:00:00Z',
}

// ─── tempo.bpm — numeric edge cases ──────────────────────────────────────────
//
// Zod v3 z.number() DOES reject NaN and Infinity (they fail typeof + isFinite
// checks internally). It does NOT reject negative numbers or zero — that
// requires explicit .positive() / .nonnegative().
//
// Schema gaps that need fixing in a follow-up PR:
//   - bpm should be positive (> 0): z.number().positive()
//   - duration should be positive (> 0): z.number().positive()
//   - beatGrid/onsets element timestamps should be nonnegative (≥ 0):
//     z.array(z.number().nonnegative())
//   - analyzedAt should not be empty: z.string().min(1) or .datetime()

describe('AnalysisSchema — tempo.bpm numeric edge cases', () => {
  it('rejects NaN bpm (Zod z.number() excludes NaN)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, bpm: NaN },
    })
    expect(result.success).toBe(false)
  })

  it('rejects Infinity bpm (Zod z.number() excludes Infinity)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, bpm: Infinity },
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative bpm (must be positive — rhythm-game cannot function with negative BPM)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, bpm: -1 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero bpm (must be positive — zero BPM means no beats, unusable for beat-sync)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, bpm: 0 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts a very high but physically plausible bpm like 300', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, bpm: 300 },
    })
    expect(result.success).toBe(true)
  })
})

// ─── duration — numeric edge cases ───────────────────────────────────────────
//
// SCHEMA GAP: duration uses z.number() with no .positive() constraint.
//   Zero-duration audio is meaningless; negative duration is impossible.
//   TODO: AnalysisSchema.duration → z.number().positive()

describe('AnalysisSchema — duration numeric edge cases', () => {
  it('rejects zero duration (must be positive — zero-duration track has nothing to analyse)', () => {
    const result = AnalysisSchema.safeParse({ ...base, duration: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative duration (must be positive — negative duration is physically impossible)', () => {
    const result = AnalysisSchema.safeParse({ ...base, duration: -5 })
    expect(result.success).toBe(false)
  })
})

// ─── tempo.beatGrid — array element edge cases ────────────────────────────────

describe('AnalysisSchema — tempo.beatGrid element edge cases', () => {
  it('rejects beatGrid containing NaN (Zod z.number() excludes NaN)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, beatGrid: [0.21, NaN, 1.69] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects beatGrid with a negative timestamp (beat at t < 0 is before track start — meaningless for timing)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, beatGrid: [-0.5, 0.21, 1.69] },
    })
    expect(result.success).toBe(false)
  })

  it('accepts an empty beatGrid (silent track legitimately has no beats)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, beatGrid: [] },
    })
    expect(result.success).toBe(true)
  })

  it('accepts an unsorted beatGrid (schema does not enforce ordering — intentional)', () => {
    // Ordering is a consumer concern; Zod does not and should not enforce it.
    const result = AnalysisSchema.safeParse({
      ...base,
      tempo: { ...base.tempo, beatGrid: [3.17, 0.21, 1.69, 2.43, 0.95] },
    })
    expect(result.success).toBe(true)
  })
})

// ─── onsets — array element edge cases ───────────────────────────────────────

describe('AnalysisSchema — onsets element edge cases', () => {
  it('rejects onsets containing NaN (Zod z.number() excludes NaN)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      onsets: [0.12, NaN, 0.95],
    })
    expect(result.success).toBe(false)
  })

  it('accepts an empty onsets array (silent / non-percussive track)', () => {
    const result = AnalysisSchema.safeParse({ ...base, onsets: [] })
    expect(result.success).toBe(true)
  })
})

// ─── energy.envelope — array element edge cases ───────────────────────────────

describe('AnalysisSchema — energy.envelope element edge cases', () => {
  it('rejects energy.envelope containing an EnergyPoint with NaN rms (Zod z.number() excludes NaN)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      energy: {
        overall: 0.62,
        envelope: [
          { t: 0.0, rms: NaN },
          { t: 0.5, rms: 0.34 },
        ],
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts energy.envelope as undefined (optional field)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      energy: { overall: 0.62 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts energy.envelope as an empty array', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      energy: { overall: 0.62, envelope: [] },
    })
    expect(result.success).toBe(true)
  })
})

// ─── tonic / mode / camelot — string case sensitivity ─────────────────────────

describe('AnalysisSchema — Key string case sensitivity', () => {
  it('rejects lowercase tonic "a" (must be uppercase)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      key: { ...base.key!, tonic: 'a' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects tonic with trailing whitespace "A " (exact enum match required)', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      key: { ...base.key!, tonic: 'A ' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects mode "Major" with capital M (must be lowercase "major")', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      key: { ...base.key!, mode: 'Major' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects camelot "1a" with lowercase suffix (must be uppercase "1A")', () => {
    const result = AnalysisSchema.safeParse({
      ...base,
      key: { ...base.key!, camelot: '1a' },
    })
    expect(result.success).toBe(false)
  })
})

// ─── videoId — string edge cases ──────────────────────────────────────────────

describe('AnalysisSchema — videoId string edge cases', () => {
  it('rejects empty string videoId (min(1) enforced)', () => {
    const result = AnalysisSchema.safeParse({ ...base, videoId: '' })
    expect(result.success).toBe(false)
  })
})

// ─── analyzedAt — timestamp edge cases ────────────────────────────────────────
//
// analyzedAt uses z.string() (not z.string().datetime()).
// A date-only string like '2026-05-03' passes — the schema is deliberately
// permissive here, trading strict validation for flexibility.
//
// SCHEMA GAP: z.string() with no .min(1) accepts an empty string for analyzedAt.
// TODO: analyzedAt → z.string().min(1) at minimum; ideally z.string().datetime()

describe('AnalysisSchema — analyzedAt edge cases', () => {
  it('accepts a date-only string "2026-05-03" (schema uses z.string(), not z.string().datetime())', () => {
    const result = AnalysisSchema.safeParse({ ...base, analyzedAt: '2026-05-03' })
    expect(result.success).toBe(true)
  })

  it('rejects empty string analyzedAt (must be non-empty — z.string().min(1) enforced)', () => {
    const result = AnalysisSchema.safeParse({ ...base, analyzedAt: '' })
    expect(result.success).toBe(false)
  })
})

// ─── structural / type-safety edge cases ─────────────────────────────────────

describe('AnalysisSchema — structural edge cases', () => {
  it('strips extra unknown fields (schema uses default Zod .strip() behavior, not .strict())', () => {
    // Design choice: the schema does not call .strict(), so extra keys are silently
    // removed from the parsed output. This is Zod's default strip behavior.
    const result = AnalysisSchema.safeParse({
      ...base,
      unknownField: 'this should be stripped',
      nested: { also: 'stripped' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).unknownField).toBeUndefined()
    }
  })

  it('rejects when the required tempo object is replaced with null', () => {
    const result = AnalysisSchema.safeParse({ ...base, tempo: null })
    expect(result.success).toBe(false)
  })

  it('rejects when the required tempo object is replaced with a plain number', () => {
    const result = AnalysisSchema.safeParse({ ...base, tempo: 81.3 })
    expect(result.success).toBe(false)
  })

  it('rejects when a nullable field (key) receives a non-object non-null value', () => {
    const result = AnalysisSchema.safeParse({ ...base, key: 'A minor' })
    expect(result.success).toBe(false)
  })
})

// ─── AnalysisProvider — consumer interface ────────────────────────────────────

describe('AnalysisProvider — consumer interface', () => {
  it('accepts a stub implementation that satisfies the interface', async () => {
    const validOutput: Analysis = {
      videoId: '-tJYN-eG1zk',
      duration: 122.4,
      tempo: {
        bpm: 81.3,
        confidence: 0.87,
        beatGrid: [0.21, 0.95, 1.69],
      },
      onsets: [0.12, 0.21],
      key: {
        tonic: 'A',
        mode: 'minor',
        camelot: '8A',
        confidence: 0.74,
      },
      energy: { overall: 0.62 },
      sections: null,
      analyzedAt: '2026-05-03T00:00:00Z',
    }

    const stub: AnalysisProvider = {
      name: 'stub',
      analyze: async (_videoId: string, _audio: Uint8Array) => validOutput,
    }

    const result = await stub.analyze('-tJYN-eG1zk', new Uint8Array([1, 2, 3]))
    expect(result.videoId).toBe('-tJYN-eG1zk')
    expect(result.tempo.bpm).toBe(81.3)
    expect(result.sections).toBeNull()

    // Output from the stub validates cleanly against the schema
    const parsed = AnalysisSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('accepts a stub that returns all nullable optional fields as null', async () => {
    const minimalOutput: Analysis = {
      videoId: 'dQw4w9WgXcQ',
      duration: 212.0,
      tempo: {
        bpm: 120,
        confidence: 0.91,
        beatGrid: [0.0, 0.5, 1.0],
      },
      onsets: [],
      key: null,
      energy: null,
      sections: null,
      analyzedAt: '2026-05-03T12:00:00Z',
    }

    const stub: AnalysisProvider = {
      name: 'minimal-stub',
      analyze: async () => minimalOutput,
    }

    const result = await stub.analyze('dQw4w9WgXcQ', new Uint8Array())
    expect(result.key).toBeNull()
    expect(result.energy).toBeNull()
    expect(result.sections).toBeNull()

    const parsed = AnalysisSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})
