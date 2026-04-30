import { describe, it, expect, vi } from 'vitest'
import { fetchFromKuGou } from '../../../src/lyrics/kugou'

// base64 of: [00:01.00]Hello world\n[00:03.00]Goodbye world\n
const FIXTURE_B64 = 'WzAwOjAxLjAwXUhlbGxvIHdvcmxkClswMDowMy4wMF1Hb29kYnllIHdvcmxkCg=='

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function makeSearchResponse(songs: unknown[]) {
  return makeResponse({ data: { info: songs } })
}

function makeCandidatesResponse(candidates: unknown[]) {
  return makeResponse({ candidates })
}

function makeDownloadResponse(b64: string) {
  return makeResponse({ content: b64 })
}

function makeSong(hash: string, duration: number) {
  return { hash, songname: 'Test Song', singername: 'Test Artist', duration }
}

function makeCandidate(id: string, accesskey: string) {
  return { id, accesskey }
}

describe('fetchFromKuGou', () => {
  it('happy path: returns Lyrics with synced lines from valid base64 LRC', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([makeSong('abc123', 200)]))
      .mockResolvedValueOnce(makeCandidatesResponse([makeCandidate('1', 'key1')]))
      .mockResolvedValueOnce(makeDownloadResponse(FIXTURE_B64))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).not.toBeNull()
    expect(result!.synced).not.toBeNull()
    expect(result!.synced).toHaveLength(2)
    expect(result!.synced![0]).toMatchObject({ time: 1.0, text: 'Hello world' })
    expect(result!.synced![1]).toMatchObject({ time: 3.0, text: 'Goodbye world' })
    expect(result!.plain).toBe('Hello world\nGoodbye world')
  })

  it('returns null when search returns empty info array', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([]))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).toBeNull()
  })

  it('returns null when candidates array is empty', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([makeSong('abc123', 200)]))
      .mockResolvedValueOnce(makeCandidatesResponse([]))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).toBeNull()
  })

  it('returns null when download request fails (non-2xx)', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([makeSong('abc123', 200)]))
      .mockResolvedValueOnce(makeCandidatesResponse([makeCandidate('1', 'key1')]))
      .mockResolvedValueOnce(makeResponse({}, false))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).toBeNull()
  })

  it('multi-timestamp line emits one LyricLine per timestamp', async () => {
    // [00:01.00][00:30.00]text → two entries
    const lrc = '[00:01.00][00:30.00]Hello world\n'
    const b64 = Buffer.from(lrc).toString('base64')

    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([makeSong('abc123', 200)]))
      .mockResolvedValueOnce(makeCandidatesResponse([makeCandidate('1', 'key1')]))
      .mockResolvedValueOnce(makeDownloadResponse(b64))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).not.toBeNull()
    expect(result!.synced).toHaveLength(2)
    expect(result!.synced![0]).toMatchObject({ time: 1.0, text: 'Hello world' })
    expect(result!.synced![1]).toMatchObject({ time: 30.0, text: 'Hello world' })
  })

  it('duration filter: only picks song within 5s tolerance, rejects song off by 30s', async () => {
    // duration = 200s; song1 is at 202s (within 5s), song2 is at 230s (off by 30s)
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([
        makeSong('close_hash', 202),
        makeSong('far_hash', 230),
      ]))
      .mockResolvedValueOnce(makeCandidatesResponse([makeCandidate('1', 'key1')]))
      .mockResolvedValueOnce(makeDownloadResponse(FIXTURE_B64))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).not.toBeNull()
    // Confirm it used close_hash (the second search call should have close_hash in URL)
    const lyricSearchCall = fetchFn.mock.calls[1][0] as string
    expect(lyricSearchCall).toContain('close_hash')
    expect(lyricSearchCall).not.toContain('far_hash')
  })

  it('duration filter: returns null when no song is within 5s of provided duration', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([
        makeSong('far_hash', 230),
        makeSong('also_far', 160),
      ]))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).toBeNull()
  })

  it('all returned LyricLines have words: undefined', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeSearchResponse([makeSong('abc123', 200)]))
      .mockResolvedValueOnce(makeCandidatesResponse([makeCandidate('1', 'key1')]))
      .mockResolvedValueOnce(makeDownloadResponse(FIXTURE_B64))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).not.toBeNull()
    for (const line of result!.synced!) {
      expect(line.words).toBeUndefined()
    }
  })

  it('returns null when search request fails (non-2xx)', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeResponse({}, false))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('network error'))

    const result = await fetchFromKuGou('Artist', 'Title', 200, fetchFn)

    expect(result).toBeNull()
  })
})
