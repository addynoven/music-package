import { describe, it, expect, vi, beforeEach } from 'vitest'
import { YouTubeSubtitleLyricsProvider } from '../../../src/lyrics/youtube-subtitle'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal youtubei.js TranscriptSegment-shaped object.
 * The real class has a `type` static, but instances expose `type` via the
 * YTNode prototype — we replicate that with a plain object property.
 */
function makeSegment(startMs: number, text: string) {
  return {
    type: 'TranscriptSegment',
    start_ms: String(startMs),
    end_ms: String(startMs + 3000),
    snippet: { toString: () => text },
  }
}

/**
 * Builds a TranscriptSectionHeader node (should be ignored by the provider).
 */
function makeSectionHeader(text: string) {
  return {
    type: 'TranscriptSectionHeader',
    start_ms: '0',
    end_ms: '1000',
    snippet: { toString: () => text },
  }
}

/**
 * Builds a mock TranscriptInfo with the full nested structure:
 *   .transcript.content.body.initial_segments
 */
function makeTranscriptInfo(segments: unknown[]) {
  return {
    transcript: {
      content: {
        body: {
          initial_segments: segments,
        },
      },
    },
  }
}

/**
 * Creates a mock Innertube instance whose `music.getInfo()` returns an object
 * with a `getTranscript()` that resolves to the given TranscriptInfo.
 */
function makeYt(transcriptInfo: unknown) {
  const getTranscript = vi.fn().mockResolvedValue(transcriptInfo)
  const getInfo = vi.fn().mockResolvedValue({ getTranscript })
  return {
    music: { getInfo },
    _getInfo: getInfo,
    _getTranscript: getTranscript,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => vi.restoreAllMocks())

describe('YouTubeSubtitleLyricsProvider', () => {

  describe('provider metadata', () => {
    it('has name "youtube-subtitle"', () => {
      const yt = makeYt(makeTranscriptInfo([]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)
      expect(provider.name).toBe('youtube-subtitle')
    })
  })

  describe('no videoId', () => {
    it('returns null immediately without calling yt when videoId is undefined', async () => {
      const yt = makeYt(makeTranscriptInfo([]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', 200)

      expect(result).toBeNull()
      expect(yt._getInfo).not.toHaveBeenCalled()
    })

    it('returns null when videoId is an empty string', async () => {
      const yt = makeYt(makeTranscriptInfo([]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      // Empty string is falsy — treated the same as undefined
      const result = await provider.fetch('Artist', 'Title', 200, undefined, '')

      expect(result).toBeNull()
      expect(yt._getInfo).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('calls music.getInfo with the provided videoId', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Hello world'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      await provider.fetch('Artist', 'Title', undefined, undefined, 'dQw4w9WgXcQ')

      expect(yt._getInfo).toHaveBeenCalledOnce()
      expect(yt._getInfo).toHaveBeenCalledWith('dQw4w9WgXcQ')
    })

    it('returns a Lyrics object with correct synced lines from segments', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Never gonna give you up'),
        makeSegment(8000, 'Never gonna let you down'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up', undefined, undefined, 'dQw4w9WgXcQ')

      expect(result).not.toBeNull()
      expect(result!.synced).toHaveLength(2)
    })

    it('converts start_ms to seconds correctly', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Never gonna give you up'),
        makeSegment(8500, 'Never gonna let you down'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up', undefined, undefined, 'dQw4w9WgXcQ')

      expect(result!.synced![0].time).toBeCloseTo(5.0)
      expect(result!.synced![1].time).toBeCloseTo(8.5)
    })

    it('sets text correctly on each line', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Never gonna give you up'),
        makeSegment(8000, 'Never gonna let you down'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up', undefined, undefined, 'dQw4w9WgXcQ')

      expect(result!.synced![0].text).toBe('Never gonna give you up')
      expect(result!.synced![1].text).toBe('Never gonna let you down')
    })

    it('does not set words property (segment-level only)', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Never gonna give you up'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced![0].words).toBeUndefined()
    })

    it('builds plain text by joining lines with newlines', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Never gonna give you up'),
        makeSegment(8000, 'Never gonna let you down'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up', undefined, undefined, 'dQw4w9WgXcQ')

      expect(result!.plain).toBe('Never gonna give you up\nNever gonna let you down')
    })
  })

  describe('filtering noise segments', () => {
    it('filters out [Music] segments', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(0, '[Music]'),
        makeSegment(5000, 'Hello world'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(1)
      expect(result!.synced![0].text).toBe('Hello world')
    })

    it('filters out (music) case-insensitively', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(0, '(MUSIC)'),
        makeSegment(5000, 'Some lyrics'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(1)
    })

    it('filters out [Applause] segments', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(5000, 'Great song line'),
        makeSegment(8000, '[Applause]'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(1)
      expect(result!.synced![0].text).toBe('Great song line')
    })

    it('filters out [Laughter] segments', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(0, '[Laughter]'),
        makeSegment(5000, 'Actual lyrics'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(1)
    })

    it('filters out bare ♪ segments', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(0, '♪'),
        makeSegment(5000, 'Lyrics line'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(1)
    })

    it('filters out empty-text segments', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(0, '   '),
        makeSegment(5000, 'Actual lyrics'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(1)
      expect(result!.synced![0].text).toBe('Actual lyrics')
    })

    it('filters out TranscriptSectionHeader nodes', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSectionHeader('Section 1'),
        makeSegment(5000, 'Song line one'),
        makeSegment(8000, 'Song line two'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result!.synced).toHaveLength(2)
      expect(result!.synced![0].text).toBe('Song line one')
    })
  })

  describe('all-filtered / empty transcript → null', () => {
    it('returns null when initial_segments is empty', async () => {
      const yt = makeYt(makeTranscriptInfo([]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })

    it('returns null when all segments are noise', async () => {
      const yt = makeYt(makeTranscriptInfo([
        makeSegment(0, '[Music]'),
        makeSegment(3000, '[Applause]'),
        makeSegment(6000, '♪'),
      ]))
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })

    it('returns null when transcript.content is null', async () => {
      const yt = makeYt({
        transcript: { content: null },
      })
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })

    it('returns null when transcript.content.body is null', async () => {
      const yt = makeYt({
        transcript: { content: { body: null } },
      })
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })
  })

  describe('error handling', () => {
    it('returns null when getTranscript throws', async () => {
      const getTranscript = vi.fn().mockRejectedValue(new Error('transcript unavailable'))
      const getInfo = vi.fn().mockResolvedValue({ getTranscript })
      const yt = { music: { getInfo }, _getInfo: getInfo }
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })

    it('returns null when getInfo throws', async () => {
      const getInfo = vi.fn().mockRejectedValue(new Error('video unavailable'))
      const yt = { music: { getInfo }, _getInfo: getInfo }
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })

    it('returns null when getInfo throws a non-Error value', async () => {
      const getInfo = vi.fn().mockRejectedValue('string error')
      const yt = { music: { getInfo }, _getInfo: getInfo }
      const provider = new YouTubeSubtitleLyricsProvider(yt as any)

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid123')

      expect(result).toBeNull()
    })
  })
})
