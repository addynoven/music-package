import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromSimpMusic } from '../../../src/lyrics/simpmusic'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LRC_FIXTURE = '[00:01.50]Hello world\n[00:03.20]Goodbye world'

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    videoId: 'dQw4w9WgXcQ',
    syncedLyrics: LRC_FIXTURE,
    plainLyric: 'Hello world\nGoodbye world',
    ...overrides,
  }
}

function makeResponse(item: Record<string, unknown> | null = makeItem()) {
  return { success: true, data: item ? [item] : [] }
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type FetchMock = ReturnType<typeof vi.fn>

function makeFetchFn(...responses: Array<{ ok: boolean; body: unknown }>): FetchMock {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      json: () => Promise.resolve(r.body),
    } as unknown as Response)
  }
  return fn
}

function ok(body: unknown) { return { ok: true, body } }
function fail()            { return { ok: false, body: {} } }

beforeEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchFromSimpMusic', () => {
  it('happy path: synced + plain from search → returns Lyrics with both', async () => {
    const fetchFn = makeFetchFn(ok(makeResponse()))

    const result = await fetchFromSimpMusic('Rick Astley', 'Never Gonna Give You Up', 213, fetchFn)

    expect(result).not.toBeNull()
    expect(result!.plain).toBe('Hello world\nGoodbye world')
    expect(result!.synced).toHaveLength(2)
    expect(result!.synced![0]).toMatchObject({ time: 1.5, text: 'Hello world' })
    expect(result!.synced![1]).toMatchObject({ time: 3.2, text: 'Goodbye world' })
    // No word-level timing from SimpMusic
    expect(result!.synced![0].words).toBeUndefined()
  })

  it('search succeeds → only one fetch call made (no videoId fallback)', async () => {
    const fetchFn = makeFetchFn(ok(makeResponse()))

    await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn, 'some-video-id')

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('search returns no syncedLyric, videoId fallback succeeds → uses fallback result', async () => {
    // Search returns item with only plainLyric and no syncedLyrics
    const searchItem = makeItem({ syncedLyrics: null, plainLyric: null })
    const fallbackItem = makeItem({ syncedLyrics: LRC_FIXTURE, plainLyric: 'Hello world\nGoodbye world' })

    const fetchFn = makeFetchFn(
      ok(makeResponse(searchItem)),
      ok(makeResponse(fallbackItem)),
    )

    const result = await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn, 'dQw4w9WgXcQ')

    expect(result).not.toBeNull()
    expect(result!.synced).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('search fails (non-2xx), videoId fallback also fails → null', async () => {
    const fetchFn = makeFetchFn(fail(), fail())

    const result = await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn, 'some-id')

    expect(result).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('no videoId provided, search fails → null (no second attempt)', async () => {
    const fetchFn = makeFetchFn(fail())

    const result = await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn)

    expect(result).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('plain-only response (no syncedLyrics) → returns Lyrics with synced: null', async () => {
    const item = makeItem({ syncedLyrics: null, plainLyric: 'Hello world\nGoodbye world' })
    const fetchFn = makeFetchFn(ok(makeResponse(item)))

    const result = await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn)

    expect(result).not.toBeNull()
    expect(result!.plain).toBe('Hello world\nGoodbye world')
    expect(result!.synced).toBeNull()
  })

  it('network throw → null', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('network error'))

    const result = await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn)

    expect(result).toBeNull()
  })

  it('search returns empty data array, videoId fallback has synced → uses fallback', async () => {
    const emptyResponse = { success: true, data: [] }
    const fallbackItem = makeItem()
    const fetchFn = makeFetchFn(ok(emptyResponse), ok(makeResponse(fallbackItem)))

    const result = await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn, 'dQw4w9WgXcQ')

    expect(result).not.toBeNull()
    expect(result!.synced).toHaveLength(2)
  })

  it('constructs correct search URL with title+artist query', async () => {
    const fetchFn = makeFetchFn(ok(makeResponse()))

    await fetchFromSimpMusic('Rick Astley', 'Never Gonna Give You Up', undefined, fetchFn)

    const calledUrl = (fetchFn.mock.calls[0] as [string])[0]
    expect(calledUrl).toContain('/v1/search?q=')
    expect(calledUrl).toContain('Never%20Gonna%20Give%20You%20Up')
    expect(calledUrl).toContain('Rick%20Astley')
    expect(calledUrl).toContain('limit=1')
  })

  it('constructs correct videoId URL for fallback', async () => {
    // Search returns empty, fallback succeeds
    const emptyResponse = { success: true, data: [] }
    const fallbackItem = makeItem()
    const fetchFn = makeFetchFn(ok(emptyResponse), ok(makeResponse(fallbackItem)))

    await fetchFromSimpMusic('Artist', 'Title', undefined, fetchFn, 'dQw4w9WgXcQ')

    const fallbackUrl = (fetchFn.mock.calls[1] as [string])[0]
    expect(fallbackUrl).toContain('/v1/dQw4w9WgXcQ')
  })
})
