import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromLrclib } from '../../../src/lyrics/lrclib'

const LRC_STRING = '[00:17.73] Never gonna give you up\n[00:20.15] Never gonna let you down'

function mockFetch(body: unknown, ok = true) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(body),
  } as any)
}

beforeEach(() => vi.restoreAllMocks())

describe('fetchFromLrclib', () => {
  it('returns plain and synced lyrics when both are present', async () => {
    mockFetch({ plainLyrics: 'Never gonna give you up\nNever gonna let you down', syncedLyrics: LRC_STRING })

    const result = await fetchFromLrclib('Rick Astley', 'Never Gonna Give You Up')

    expect(result).not.toBeNull()
    expect(result!.plain).toBe('Never gonna give you up\nNever gonna let you down')
    expect(result!.synced).toHaveLength(2)
    expect(result!.synced![0]).toMatchObject({ time: 17.73, text: 'Never gonna give you up' })
  })

  it('returns plain lyrics with synced: null when syncedLyrics is absent', async () => {
    mockFetch({ plainLyrics: 'Some plain lyrics' })

    const result = await fetchFromLrclib('Artist', 'Title')

    expect(result).not.toBeNull()
    expect(result!.plain).toBe('Some plain lyrics')
    expect(result!.synced).toBeNull()
  })

  it('trims whitespace from plainLyrics', async () => {
    mockFetch({ plainLyrics: '  line one\nline two  ' })

    const result = await fetchFromLrclib('Artist', 'Title')

    expect(result!.plain).toBe('line one\nline two')
  })

  it('returns null when the response is not ok', async () => {
    mockFetch({}, false)

    expect(await fetchFromLrclib('Artist', 'Title')).toBeNull()
  })

  it('returns null when plainLyrics is missing from the response', async () => {
    mockFetch({ syncedLyrics: LRC_STRING })

    expect(await fetchFromLrclib('Artist', 'Title')).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

    expect(await fetchFromLrclib('Artist', 'Title')).toBeNull()
  })
})
