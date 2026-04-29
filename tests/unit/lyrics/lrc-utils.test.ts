import { describe, it, expect } from 'vitest'
import { parseLrc, getActiveLine, getActiveLineIndex, formatTimestamp } from '../../../src/lyrics/lrc-utils'

const SAMPLE_LRC = `[00:17.73] Never gonna give you up
[00:20.15] Never gonna let you down
[00:22.57] Never gonna run around and desert you
[00:25.00] Never gonna make you cry`

const PARSED = [
  { time: 17.73, text: 'Never gonna give you up' },
  { time: 20.15, text: 'Never gonna let you down' },
  { time: 22.57, text: 'Never gonna run around and desert you' },
  { time: 25.00, text: 'Never gonna make you cry' },
]

// ── parseLrc ──────────────────────────────────────────────────────────────────

describe('parseLrc', () => {
  it('parses standard [mm:ss.xx] timestamps', () => {
    const result = parseLrc(SAMPLE_LRC)
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ time: 17.73, text: 'Never gonna give you up' })
    expect(result[1]).toEqual({ time: 20.15, text: 'Never gonna let you down' })
  })

  it('converts minutes correctly (1:00.00 → 60 seconds)', () => {
    const result = parseLrc('[01:00.00] One minute')
    expect(result[0].time).toBe(60)
  })

  it('skips lines without a timestamp', () => {
    const lrc = '[00:10.00] Line one\nNo timestamp here\n[00:20.00] Line two'
    expect(parseLrc(lrc)).toHaveLength(2)
  })

  it('skips empty lyric lines (instrumental gaps)', () => {
    const lrc = '[00:10.00] Line one\n[00:15.00] \n[00:20.00] Line two'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(2)
    expect(result.map(l => l.text)).not.toContain('')
  })

  it('returns empty array for empty input', () => {
    expect(parseLrc('')).toEqual([])
  })

  it('returns empty array when no valid timestamps found', () => {
    expect(parseLrc('just some text\nno brackets here')).toEqual([])
  })

  it('handles LRC metadata tags by skipping them', () => {
    const lrc = '[ti:Rick Roll]\n[ar:Rick Astley]\n[00:17.73] Never gonna give you up'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Never gonna give you up')
  })
})

// ── getActiveLineIndex ────────────────────────────────────────────────────────

describe('getActiveLineIndex', () => {
  it('returns -1 before the first line starts', () => {
    expect(getActiveLineIndex(PARSED, 0)).toBe(-1)
  })

  it('returns -1 for empty lines array', () => {
    expect(getActiveLineIndex([], 10)).toBe(-1)
  })

  it('returns 0 at exactly the first timestamp', () => {
    expect(getActiveLineIndex(PARSED, 17.73)).toBe(0)
  })

  it('returns the last passed timestamp during its window', () => {
    expect(getActiveLineIndex(PARSED, 19)).toBe(0)
    expect(getActiveLineIndex(PARSED, 21)).toBe(1)
  })

  it('advances to the next line at its exact timestamp', () => {
    expect(getActiveLineIndex(PARSED, 20.15)).toBe(1)
  })

  it('returns the last index when past the final line', () => {
    expect(getActiveLineIndex(PARSED, 999)).toBe(3)
  })
})

// ── getActiveLine ─────────────────────────────────────────────────────────────

describe('getActiveLine', () => {
  it('returns null before the first line starts', () => {
    expect(getActiveLine(PARSED, 0)).toBeNull()
  })

  it('returns null for empty lines array', () => {
    expect(getActiveLine([], 10)).toBeNull()
  })

  it('returns the correct line object', () => {
    const line = getActiveLine(PARSED, 21)
    expect(line).toEqual({ time: 20.15, text: 'Never gonna let you down' })
  })

  it('returns the last line when past the end', () => {
    const line = getActiveLine(PARSED, 999)
    expect(line).toEqual({ time: 25.00, text: 'Never gonna make you cry' })
  })
})

// ── formatTimestamp ───────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats sub-minute seconds', () => {
    expect(formatTimestamp(17.73)).toBe('[00:17.73]')
  })

  it('formats exactly one minute', () => {
    expect(formatTimestamp(60)).toBe('[01:00.00]')
  })

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(125.5)).toBe('[02:05.50]')
  })

  it('formats zero', () => {
    expect(formatTimestamp(0)).toBe('[00:00.00]')
  })

  it('zero-pads single-digit minutes and seconds', () => {
    expect(formatTimestamp(65.07)).toBe('[01:05.07]')
  })

  it('handles large values (over an hour)', () => {
    expect(formatTimestamp(3661.9)).toBe('[61:01.90]')
  })
})
