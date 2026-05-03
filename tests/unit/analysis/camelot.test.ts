import { describe, it, expect } from 'vitest'
import { keyToCamelot } from '../../../src/analysis/camelot'

// ─── major keys (B suffix) ────────────────────────────────────────────────────

describe('keyToCamelot — major keys', () => {
  it('maps C major → 8B', () => {
    expect(keyToCamelot('C', 'major')).toBe('8B')
  })

  it('maps G major → 9B', () => {
    expect(keyToCamelot('G', 'major')).toBe('9B')
  })

  it('maps D major → 10B', () => {
    expect(keyToCamelot('D', 'major')).toBe('10B')
  })

  it('maps A major → 11B', () => {
    expect(keyToCamelot('A', 'major')).toBe('11B')
  })

  it('maps E major → 12B', () => {
    expect(keyToCamelot('E', 'major')).toBe('12B')
  })

  it('maps B major → 1B', () => {
    expect(keyToCamelot('B', 'major')).toBe('1B')
  })

  it('maps F# major → 2B', () => {
    expect(keyToCamelot('F#', 'major')).toBe('2B')
  })

  it('maps C# major → 3B', () => {
    expect(keyToCamelot('C#', 'major')).toBe('3B')
  })

  it('maps G# major → 4B', () => {
    expect(keyToCamelot('G#', 'major')).toBe('4B')
  })

  it('maps D# major → 5B', () => {
    expect(keyToCamelot('D#', 'major')).toBe('5B')
  })

  it('maps A# major → 6B', () => {
    expect(keyToCamelot('A#', 'major')).toBe('6B')
  })

  it('maps F major → 7B', () => {
    expect(keyToCamelot('F', 'major')).toBe('7B')
  })
})

// ─── minor keys (A suffix) ────────────────────────────────────────────────────

describe('keyToCamelot — minor keys', () => {
  it('maps A minor → 8A', () => {
    expect(keyToCamelot('A', 'minor')).toBe('8A')
  })

  it('maps E minor → 9A', () => {
    expect(keyToCamelot('E', 'minor')).toBe('9A')
  })

  it('maps B minor → 10A', () => {
    expect(keyToCamelot('B', 'minor')).toBe('10A')
  })

  it('maps F# minor → 11A', () => {
    expect(keyToCamelot('F#', 'minor')).toBe('11A')
  })

  it('maps C# minor → 12A', () => {
    expect(keyToCamelot('C#', 'minor')).toBe('12A')
  })

  it('maps G# minor → 1A', () => {
    expect(keyToCamelot('G#', 'minor')).toBe('1A')
  })

  it('maps D# minor → 2A', () => {
    expect(keyToCamelot('D#', 'minor')).toBe('2A')
  })

  it('maps A# minor → 3A', () => {
    expect(keyToCamelot('A#', 'minor')).toBe('3A')
  })

  it('maps F minor → 4A', () => {
    expect(keyToCamelot('F', 'minor')).toBe('4A')
  })

  it('maps C minor → 5A', () => {
    expect(keyToCamelot('C', 'minor')).toBe('5A')
  })

  it('maps G minor → 6A', () => {
    expect(keyToCamelot('G', 'minor')).toBe('6A')
  })

  it('maps D minor → 7A', () => {
    expect(keyToCamelot('D', 'minor')).toBe('7A')
  })
})

// ─── mode suffix invariant ────────────────────────────────────────────────────

describe('keyToCamelot — mode suffix invariant', () => {
  it('always returns B suffix for major keys', () => {
    const majorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'] as const
    for (const tonic of majorKeys) {
      expect(keyToCamelot(tonic, 'major')).toMatch(/B$/)
    }
  })

  it('always returns A suffix for minor keys', () => {
    const minorKeys = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D'] as const
    for (const tonic of minorKeys) {
      expect(keyToCamelot(tonic, 'minor')).toMatch(/A$/)
    }
  })

  it('relative major/minor share the same wheel number', () => {
    // C major and A minor are relative — both 8
    expect(keyToCamelot('C', 'major')).toBe('8B')
    expect(keyToCamelot('A', 'minor')).toBe('8A')
  })
})
