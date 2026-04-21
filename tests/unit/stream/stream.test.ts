import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('youtubei.js/agnostic', () => ({
  Platform: { shim: null, load: vi.fn() },
}))

import { StreamResolver } from '../../../src/stream'
import { Cache } from '../../../src/cache'
import { makeStreamingData, makeExpiredStreamingData } from '../../helpers/mock-factory'
import { Platform } from 'youtubei.js/agnostic'

function makeFmt(bitrate = 160_000, codec = 'opus', url = 'https://rr5---sn-test.googlevideo.com/videoplayback?expire=9999999999') {
  return {
    has_audio: true,
    has_video: false,
    bitrate,
    mime_type: `audio/webm; codecs="${codec}"`,
    loudness_db: -7.2,
    content_length: '3456789',
    decipher: vi.fn().mockResolvedValue(url),
  }
}

function makeYt(formats: ReturnType<typeof makeFmt>[] = [makeFmt()]) {
  return {
    music: {
      getInfo: vi.fn().mockResolvedValue({ streaming_data: { adaptive_formats: formats } }),
    },
    session: { player: {} },
  }
}

describe('patchEvalIfNeeded', () => {
  it('calls Platform.load with a patched eval when shim has an eval function', () => {
    const mockLoad = vi.fn()
    ;(Platform as any).shim = { someField: true, eval: vi.fn() }
    ;(Platform as any).load = mockLoad

    new StreamResolver(new Cache({ enabled: false }), {} as any)

    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ eval: expect.any(Function) }))

    ;(Platform as any).shim = null
  })
})

describe('StreamResolver', () => {
  let cache: Cache
  let mockYt: ReturnType<typeof makeYt>
  let resolver: StreamResolver

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new Cache({ enabled: true })
    mockYt = makeYt()
    resolver = new StreamResolver(cache, mockYt as any)
  })

  afterEach(() => {
    cache.close()
  })

  describe('cache-first resolution', () => {
    it('returns cached StreamingData without calling getInfo', async () => {
      const cached = makeStreamingData()
      cache.set(`stream:dQw4w9WgXcQ:high`, cached, Cache.TTL.STREAM)

      const result = await resolver.resolve('dQw4w9WgXcQ', 'high')

      expect(result.url).toBe(cached.url)
      expect(mockYt.music.getInfo).not.toHaveBeenCalled()
    })

    it('fetches fresh data when the cached URL is expired', async () => {
      const expired = makeExpiredStreamingData()
      cache.set(`stream:dQw4w9WgXcQ:high`, expired, 1)

      await resolver.resolve('dQw4w9WgXcQ', 'high')

      expect(mockYt.music.getInfo).toHaveBeenCalledTimes(1)
    })

    it('caches the fresh result for subsequent calls', async () => {
      await resolver.resolve('dQw4w9WgXcQ', 'high')
      await resolver.resolve('dQw4w9WgXcQ', 'high')

      expect(mockYt.music.getInfo).toHaveBeenCalledTimes(1)
    })
  })

  describe('fresh resolution', () => {
    it('returns a StreamingData with the correct shape', async () => {
      const result = await resolver.resolve('dQw4w9WgXcQ')

      expect(result.url).toContain('googlevideo.com')
      expect(result.codec).toMatch(/^(opus|mp4a)$/)
      expect(result.bitrate).toBeGreaterThan(0)
      expect(result.expiresAt).toBeGreaterThan(0)
    })

    it('prefers Opus for high quality', async () => {
      const result = await resolver.resolve('dQw4w9WgXcQ', 'high')
      expect(result.codec).toBe('opus')
    })

    it('selects a lower bitrate format for low quality', async () => {
      const lowYt = makeYt([makeFmt(50_000)])
      const lowResolver = new StreamResolver(new Cache({ enabled: false }), lowYt as any)

      const result = await lowResolver.resolve('low-q', 'low')

      expect(result.bitrate).toBeLessThan(100_000)
    })
  })

  describe('error handling', () => {
    it('throws when the video does not exist', async () => {
      mockYt.music.getInfo.mockRejectedValue(new Error('Video unavailable'))

      await expect(resolver.resolve('bad-video-id')).rejects.toThrow()
    })

    it('does not cache failed resolutions', async () => {
      mockYt.music.getInfo.mockRejectedValue(new Error('fail'))

      await resolver.resolve('bad-id').catch(() => {})

      expect(cache.get('stream:bad-id:high')).toBeNull()
    })
  })

  describe('parseExpiry (URL without expire param)', () => {
    it('returns expiresAt of 0 for a URL with no expire parameter', async () => {
      const noExpireFmt = makeFmt(160_000, 'opus', 'https://rr5---sn.googlevideo.com/videoplayback')
      const noExpireYt = makeYt([noExpireFmt])
      const noExpireResolver = new StreamResolver(new Cache({ enabled: false }), noExpireYt as any)

      const result = await noExpireResolver.resolve('vid-no-expire', 'high')

      expect(result.expiresAt).toBe(0)
    })
  })

  describe('codec and optional fields', () => {
    it('returns mp4a codec when format mime type does not include opus', async () => {
      const mp4aFmt = makeFmt(128_000, 'mp4a.40.2')
      const mp4aYt = makeYt([mp4aFmt])
      const mp4aResolver = new StreamResolver(new Cache({ enabled: false }), mp4aYt as any)

      const result = await mp4aResolver.resolve('vid-mp4a', 'high')

      expect(result.codec).toBe('mp4a')
    })

    it('omits loudnessDb and sizeBytes when not present in the format', async () => {
      const minimalFmt = {
        has_audio: true,
        has_video: false,
        bitrate: 128_000,
        mime_type: 'audio/webm; codecs="opus"',
        decipher: vi.fn().mockResolvedValue('https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999'),
      }
      const minYt = makeYt([minimalFmt as any])
      const minResolver = new StreamResolver(new Cache({ enabled: false }), minYt as any)

      const result = await minResolver.resolve('vid-min', 'high')

      expect(result.loudnessDb).toBeUndefined()
      expect(result.sizeBytes).toBeUndefined()
    })

    it('includes sizeBytes and loudnessDb when present in the format', async () => {
      const result = await resolver.resolve('dQw4w9WgXcQ', 'high')

      expect(result.sizeBytes).toBe(3456789)
      expect(result.loudnessDb).toBe(-7.2)
    })
  })

  describe('quality options', () => {
    it('defaults to high quality when no option is given', async () => {
      const result = await resolver.resolve('dQw4w9WgXcQ')
      expect(result.bitrate).toBeGreaterThanOrEqual(100_000)
    })

    it('defaults to high quality when an unknown quality string is passed', async () => {
      const highFmt = makeFmt(160_000)
      const lowFmt = makeFmt(50_000)
      const localYt = makeYt([highFmt, lowFmt])
      const localResolver = new StreamResolver(new Cache({ enabled: false }), localYt as any)

      const result = await localResolver.resolve('vid', 'ultra' as any)

      expect(result.bitrate).toBe(160_000)
    })

    it('uses separate cache keys for high vs low quality', async () => {
      const highFmt = makeFmt(160_000)
      const lowFmt = makeFmt(50_000)
      const localYt = {
        music: {
          getInfo: vi.fn()
            .mockResolvedValueOnce({ streaming_data: { adaptive_formats: [highFmt] } })
            .mockResolvedValueOnce({ streaming_data: { adaptive_formats: [lowFmt] } }),
        },
        session: { player: {} },
      }
      const localResolver = new StreamResolver(cache, localYt as any)

      await localResolver.resolve('dQw4w9WgXcQ', 'high')
      await localResolver.resolve('dQw4w9WgXcQ', 'low')

      expect(localYt.music.getInfo).toHaveBeenCalledTimes(2)
    })
  })
})
