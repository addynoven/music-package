import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/cache')

import { execFile } from 'node:child_process'
import { StreamResolver } from '../../../src/stream'
import { Cache } from '../../../src/cache'

;(Cache as any).TTL = { STREAM: 21600 }

function ytdlpJson(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    url: 'https://rr5---sn-test.googlevideo.com/videoplayback?expire=9999999999',
    acodec: 'opus',
    abr: 160,
    filesize: 3456789,
    ...overrides,
  })
}

function mockExecSuccess(json: string) {
  ;(execFile as any).mockImplementation(
    (_cmd: string, _args: string[], cb: Function) => cb(null, json, ''),
  )
}

function mockExecFailure(stderr = 'ERROR: Video unavailable', code = 1) {
  const err = Object.assign(new Error('yt-dlp exited'), { stderr, code })
  ;(execFile as any).mockImplementation(
    (_cmd: string, _args: string[], cb: Function) => cb(err, '', stderr),
  )
}

function makeMockCache() {
  return {
    get: vi.fn<[string], any>().mockReturnValue(null),
    set: vi.fn(),
    isUrlExpired: vi.fn().mockReturnValue(false),
    close: vi.fn(),
  }
}

describe('StreamResolver — yt-dlp backend', () => {
  let mockCache: ReturnType<typeof makeMockCache>
  let resolver: StreamResolver

  beforeEach(() => {
    vi.clearAllMocks()
    mockCache = makeMockCache()
    resolver = new StreamResolver(mockCache as any)
  })

  // ─── yt-dlp invocation ────────────────────────────────────────────────────

  describe('yt-dlp invocation', () => {
    it('calls execFile with yt-dlp, --dump-json, and --no-playlist', async () => {
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('dQw4w9WgXcQ')

      expect(execFile).toHaveBeenCalledWith(
        'yt-dlp',
        expect.arrayContaining(['--dump-json', '--no-playlist']),
        expect.any(Function),
      )
    })

    it('includes the YouTube Music URL with the videoId', async () => {
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('dQw4w9WgXcQ')

      const args: string[] = (execFile as any).mock.calls[0][1]
      expect(args.some((a) => a.includes('dQw4w9WgXcQ'))).toBe(true)
    })

    it('passes bestaudio format selector for high quality', async () => {
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('dQw4w9WgXcQ', 'high')

      const args: string[] = (execFile as any).mock.calls[0][1]
      expect(args.some((a) => a.startsWith('bestaudio'))).toBe(true)
    })

    it('passes worstaudio format selector for low quality', async () => {
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('dQw4w9WgXcQ', 'low')

      const args: string[] = (execFile as any).mock.calls[0][1]
      expect(args.some((a) => a.startsWith('worstaudio'))).toBe(true)
    })

    it('does NOT use youtubei.js — resolves purely via yt-dlp', async () => {
      mockExecSuccess(ytdlpJson())
      await resolver.resolve('dQw4w9WgXcQ')
      expect(execFile).toHaveBeenCalledWith('yt-dlp', expect.any(Array), expect.any(Function))
    })
  })

  // ─── JSON parsing ─────────────────────────────────────────────────────────

  describe('JSON parsing → StreamingData fields', () => {
    async function resolveWith(json: Record<string, any>) {
      mockExecSuccess(JSON.stringify(json))
      return resolver.resolve('dQw4w9WgXcQ')
    }

    it('returns the url from JSON output as-is', async () => {
      const url = 'https://rr5---sn-test.googlevideo.com/videoplayback?expire=9999999999'
      const result = await resolveWith({ url, acodec: 'opus', abr: 160 })
      expect(result.url).toBe(url)
    })

    it('maps acodec "opus" → codec "opus"', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        abr: 160,
      })
      expect(result.codec).toBe('opus')
    })

    it('maps acodec "mp4a.40.2" → codec "mp4a"', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'mp4a.40.2',
        abr: 128,
      })
      expect(result.codec).toBe('mp4a')
    })

    it('converts abr (kbps) to bitrate in bps', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        abr: 160,
      })
      expect(result.bitrate).toBe(160_000)
    })

    it('falls back to tbr when abr is absent', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        tbr: 128,
      })
      expect(result.bitrate).toBe(128_000)
    })

    it('extracts expiresAt from the URL expire param', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        abr: 160,
      })
      expect(result.expiresAt).toBe(9999999999)
    })

    it('sets expiresAt to 0 when URL has no expire param', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback',
        acodec: 'opus',
        abr: 160,
      })
      expect(result.expiresAt).toBe(0)
    })

    it('includes sizeBytes from filesize', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        abr: 160,
        filesize: 3456789,
      })
      expect(result.sizeBytes).toBe(3456789)
    })

    it('falls back to filesize_approx when filesize is absent', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        abr: 160,
        filesize_approx: 2000000,
      })
      expect(result.sizeBytes).toBe(2000000)
    })

    it('omits sizeBytes when neither filesize nor filesize_approx is present', async () => {
      const result = await resolveWith({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        acodec: 'opus',
        abr: 160,
      })
      expect(result.sizeBytes).toBeUndefined()
    })
  })

  // ─── cache behavior ───────────────────────────────────────────────────────

  describe('cache behavior', () => {
    it('returns cached data without calling execFile', async () => {
      const cached = {
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
        codec: 'opus' as const,
        bitrate: 160_000,
        expiresAt: 9999999999,
      }
      mockCache.get.mockReturnValue(cached)
      mockCache.isUrlExpired.mockReturnValue(false)

      const result = await resolver.resolve('dQw4w9WgXcQ')

      expect(result).toBe(cached)
      expect(execFile).not.toHaveBeenCalled()
    })

    it('re-resolves via yt-dlp when cached URL is expired', async () => {
      mockCache.get.mockReturnValue({
        url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=0',
        codec: 'opus' as const,
        bitrate: 160_000,
        expiresAt: 0,
      })
      mockCache.isUrlExpired.mockReturnValue(true)
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('dQw4w9WgXcQ')

      expect(execFile).toHaveBeenCalledTimes(1)
    })

    it('stores the fresh result in the cache with the correct key', async () => {
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('dQw4w9WgXcQ', 'high')

      expect(mockCache.set).toHaveBeenCalledWith(
        'stream:dQw4w9WgXcQ:high',
        expect.objectContaining({ url: expect.any(String) }),
        expect.any(Number),
      )
    })

    it('uses separate cache keys for high vs low quality', async () => {
      mockExecSuccess(ytdlpJson())

      await resolver.resolve('abc', 'high')
      await resolver.resolve('abc', 'low')

      const keys: string[] = mockCache.set.mock.calls.map((c: any[]) => c[0])
      expect(keys).toContain('stream:abc:high')
      expect(keys).toContain('stream:abc:low')
    })
  })

  // ─── error handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws when yt-dlp exits with a non-zero code and no stdout', async () => {
      mockExecFailure('ERROR: Video unavailable')

      await expect(resolver.resolve('dQw4w9WgXcQ')).rejects.toThrow()
    })

    it('succeeds when yt-dlp exits with code 1 but stdout has valid JSON (no JS runtime warning)', async () => {
      // yt-dlp 2026+ exits 1 with a JS-runtime warning but still writes valid JSON to stdout.
      // This happens on data-center IPs where YouTube forces a JS challenge.
      const err = Object.assign(new Error('yt-dlp exited'), {
        stderr: 'WARNING: [youtube] No supported JavaScript runtime could be found.',
        code: 1,
      })
      ;(execFile as any).mockImplementation(
        (_cmd: string, _args: string[], cb: Function) => cb(err, ytdlpJson(), err.stderr),
      )

      const result = await resolver.resolve('dQw4w9WgXcQ')
      expect(result.url).toBeTruthy()
    })

    it('does not cache a failed resolution', async () => {
      mockExecFailure()

      await resolver.resolve('dQw4w9WgXcQ').catch(() => {})

      expect(mockCache.set).not.toHaveBeenCalled()
    })

    it('includes the stderr message in the thrown error', async () => {
      mockExecFailure('Sign in to confirm your age')

      await expect(resolver.resolve('dQw4w9WgXcQ')).rejects.toThrow('Sign in to confirm your age')
    })
  })
})
