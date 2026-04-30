import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromBetterLyrics, BETTER_LYRICS_BASE } from '../../../src/lyrics/better-lyrics'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STANDARD_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00.500" end="00:03.200">
        <span begin="00:00.500" end="00:00.900">Is</span>
        <span begin="00:00.900" end="00:01.300">this</span>
        <span begin="00:01.300" end="00:01.700">the</span>
        <span begin="00:01.700" end="00:02.500">real</span>
        <span begin="00:02.500" end="00:03.200">life</span>
      </p>
      <p begin="00:03.500" end="00:06.800">
        <span begin="00:03.500" end="00:03.900">Is</span>
        <span begin="00:03.900" end="00:04.300">this</span>
        <span begin="00:04.300" end="00:04.700">just</span>
        <span begin="00:04.700" end="00:05.500">fantasy</span>
      </p>
    </div>
  </body>
</tt>`

// TTML where p/@begin uses HH:MM:SS.fff and span/@begin uses bare seconds
const MIXED_FORMAT_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:01:05.000" end="00:01:08.000">
        <span begin="65.000" end="65.800">Hello</span>
        <span begin="65.800" end="66.500">world</span>
      </p>
    </div>
  </body>
</tt>`

const BARE_SECONDS_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="12.45" end="15.00">
        <span begin="12.45" end="13.20">Bare</span>
        <span begin="13.20" end="14.00">seconds</span>
      </p>
    </div>
  </body>
</tt>`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200) {
  const ok = status >= 200 && status < 300
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response)
}

function ttmlResponse(ttml: string) {
  return { ttml }
}

beforeEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchFromBetterLyrics', () => {

  describe('standard TTML with word timings', () => {
    it('returns non-null result with two lines', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result).not.toBeNull()
      expect(result!.synced).toHaveLength(2)
    })

    it('populates words on each line', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result!.synced![0].words).toHaveLength(5)
      expect(result!.synced![1].words).toHaveLength(4)
    })

    it('sets correct word text on first line', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      const words = result!.synced![0].words!
      expect(words.map(w => w.text)).toEqual(['Is', 'this', 'the', 'real', 'life'])
    })

    it('sets correct line text as words joined by spaces', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result!.synced![0].text).toBe('Is this the real life')
      expect(result!.synced![1].text).toBe('Is this just fantasy')
    })

    it('sets correct line time from p/@begin', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result!.synced![0].time).toBeCloseTo(0.5)
      expect(result!.synced![1].time).toBeCloseTo(3.5)
    })

    it('sets correct word time and duration', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      const firstWord = result!.synced![0].words![0]
      expect(firstWord.time).toBeCloseTo(0.5)
      expect(firstWord.duration).toBeCloseTo(0.4)
      expect(firstWord.text).toBe('Is')
    })

    it('builds plain text as lines joined by newlines', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 210, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result!.plain).toBe('Is this the real life\nIs this just fantasy')
    })
  })

  describe('MM:SS.fff timestamp parsing', () => {
    it('parses 00:00.500 → 0.5 seconds', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', undefined, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result!.synced![0].time).toBeCloseTo(0.5)
    })

    it('parses 00:03.500 → 3.5 seconds', async () => {
      const result = await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', undefined, mockFetch(ttmlResponse(STANDARD_TTML)))
      expect(result!.synced![1].time).toBeCloseTo(3.5)
    })
  })

  describe('HH:MM:SS.fff and bare seconds in mixed format', () => {
    it('parses HH:MM:SS.fff on p/@begin correctly', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch(ttmlResponse(MIXED_FORMAT_TTML)))
      expect(result).not.toBeNull()
      expect(result!.synced![0].time).toBeCloseTo(65) // 1 min 5 sec
    })

    it('parses bare-second span timestamps correctly', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch(ttmlResponse(MIXED_FORMAT_TTML)))
      const words = result!.synced![0].words!
      expect(words[0].time).toBeCloseTo(65)
      expect(words[0].duration).toBeCloseTo(0.8)
      expect(words[1].time).toBeCloseTo(65.8)
    })
  })

  describe('bare seconds p/@begin', () => {
    it('parses begin="12.45" → 12.45 seconds', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch(ttmlResponse(BARE_SECONDS_TTML)))
      expect(result).not.toBeNull()
      expect(result!.synced![0].time).toBeCloseTo(12.45)
    })

    it('word durations are correct with bare seconds', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch(ttmlResponse(BARE_SECONDS_TTML)))
      const words = result!.synced![0].words!
      expect(words[0].text).toBe('Bare')
      expect(words[0].duration).toBeCloseTo(0.75)
      expect(words[1].text).toBe('seconds')
    })
  })

  describe('empty / malformed input', () => {
    it('returns null when ttml field is missing from response', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch({ other: 'data' }))
      expect(result).toBeNull()
    })

    it('returns null when ttml is an empty string', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch({ ttml: '' }))
      expect(result).toBeNull()
    })

    it('returns null when ttml has no parseable p elements', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch({ ttml: '<tt><body><div></div></body></tt>' }))
      expect(result).toBeNull()
    })

    it('returns null when ttml is completely malformed XML-like text', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch({ ttml: 'not xml at all <<<>>>' }))
      expect(result).toBeNull()
    })
  })

  describe('non-200 responses', () => {
    it('returns null on HTTP 404', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch({}, 404))
      expect(result).toBeNull()
    })

    it('returns null on HTTP 500', async () => {
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, mockFetch({}, 500))
      expect(result).toBeNull()
    })

    it('returns null when fetch throws a network error', async () => {
      const throwingFetch = vi.fn().mockRejectedValueOnce(new Error('network error'))
      const result = await fetchFromBetterLyrics('Artist', 'Title', undefined, throwingFetch as unknown as typeof fetch)
      expect(result).toBeNull()
    })
  })

  describe('URL construction', () => {
    it('includes duration param when provided', async () => {
      const fetchFn = mockFetch(ttmlResponse(STANDARD_TTML))
      await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', 354.7, fetchFn)
      const calledUrl = (fetchFn.mock.calls[0] as unknown[])[0] as string
      expect(calledUrl).toContain(`${BETTER_LYRICS_BASE}/getLyrics`)
      expect(calledUrl).toContain('d=355') // Math.round(354.7)
    })

    it('omits duration param when not provided', async () => {
      const fetchFn = mockFetch(ttmlResponse(STANDARD_TTML))
      await fetchFromBetterLyrics('Queen', 'Bohemian Rhapsody', undefined, fetchFn)
      const calledUrl = (fetchFn.mock.calls[0] as unknown[])[0] as string
      expect(calledUrl).not.toContain('d=')
    })

    it('URL-encodes artist and title', async () => {
      const fetchFn = mockFetch(ttmlResponse(STANDARD_TTML))
      await fetchFromBetterLyrics('AC/DC', 'Back in Black', undefined, fetchFn)
      const calledUrl = (fetchFn.mock.calls[0] as unknown[])[0] as string
      expect(calledUrl).toContain('a=AC%2FDC')
    })
  })
})
