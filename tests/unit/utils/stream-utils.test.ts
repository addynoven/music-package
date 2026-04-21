import { describe, it, expect, vi, afterEach } from 'vitest'
import { isStreamExpired } from '../../../src/utils/stream-utils'
import type { StreamingData } from '../../../src/models'

function makeStream(expiresAt: number): StreamingData {
  return { url: 'https://stream.example.com/audio', codec: 'opus', bitrate: 160_000, expiresAt }
}

const NOW_SECONDS = 1_700_000_000

afterEach(() => vi.useRealTimers())

describe('isStreamExpired', () => {
  it('returns false when stream has more than 5 minutes remaining', () => {
    vi.setSystemTime(NOW_SECONDS * 1000)
    const stream = makeStream(NOW_SECONDS + 600) // 10 min remaining
    expect(isStreamExpired(stream)).toBe(false)
  })

  it('returns true when stream has already expired', () => {
    vi.setSystemTime(NOW_SECONDS * 1000)
    const stream = makeStream(NOW_SECONDS - 1) // 1 second past expiry
    expect(isStreamExpired(stream)).toBe(true)
  })

  it('returns true when stream expires within 5 minutes (safety buffer)', () => {
    vi.setSystemTime(NOW_SECONDS * 1000)
    const stream = makeStream(NOW_SECONDS + 240) // 4 min remaining — within buffer
    expect(isStreamExpired(stream)).toBe(true)
  })

  it('returns false when stream expires exactly at the 5-minute boundary', () => {
    vi.setSystemTime(NOW_SECONDS * 1000)
    const stream = makeStream(NOW_SECONDS + 300) // exactly 5 min — not yet stale
    expect(isStreamExpired(stream)).toBe(false)
  })
})
