import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromLyricsOvh } from '../../../src/lyrics/lyrics-ovh'

function mockFetch(body: unknown, ok = true) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(body),
  } as any)
}

beforeEach(() => vi.restoreAllMocks())

describe('fetchFromLyricsOvh', () => {
  it('returns plain lyrics with synced: null on success', async () => {
    mockFetch({ lyrics: 'Never gonna give you up\nNever gonna let you down' })

    const result = await fetchFromLyricsOvh('Rick Astley', 'Never Gonna Give You Up')

    expect(result).not.toBeNull()
    expect(result!.plain).toBe('Never gonna give you up\nNever gonna let you down')
    expect(result!.synced).toBeNull()
  })

  it('trims whitespace from lyrics', async () => {
    mockFetch({ lyrics: '  line one\nline two  ' })

    const result = await fetchFromLyricsOvh('Artist', 'Title')

    expect(result!.plain).toBe('line one\nline two')
  })

  it('returns null when the response is not ok', async () => {
    mockFetch({}, false)

    expect(await fetchFromLyricsOvh('Artist', 'Title')).toBeNull()
  })

  it('returns null when lyrics field is missing', async () => {
    mockFetch({})

    expect(await fetchFromLyricsOvh('Artist', 'Title')).toBeNull()
  })

  it('returns null when lyrics is an empty string', async () => {
    mockFetch({ lyrics: '   ' })

    expect(await fetchFromLyricsOvh('Artist', 'Title')).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

    expect(await fetchFromLyricsOvh('Artist', 'Title')).toBeNull()
  })
})
