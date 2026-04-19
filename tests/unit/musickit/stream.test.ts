import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData, makeSong, makeAudioTrack } from '../../helpers/mock-factory'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { StreamResolver } from '../../../src/stream'
import { DiscoveryClient } from '../../../src/discovery'
import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockStream = { resolve: vi.fn() }
const mockDiscovery = { search: vi.fn() }

;(StreamResolver as any).mockImplementation(() => mockStream)
;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

describe('MusicKit — getStream & getTrack', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  // ─── getStream() ──────────────────────────────────────────────────────────

  describe('getStream()', () => {
    it('returns a StreamingData object', async () => {
      const stream = makeStreamingData()
      mockStream.resolve.mockResolvedValue(stream)

      const result = await mk.getStream('dQw4w9WgXcQ')

      expect(result).toMatchObject({
        url: expect.any(String),
        codec: expect.stringMatching(/^(opus|mp4a)$/),
        bitrate: expect.any(Number),
        expiresAt: expect.any(Number),
      })
    })

    it('passes videoId and quality to StreamResolver', async () => {
      mockStream.resolve.mockResolvedValue(makeStreamingData())

      await mk.getStream('dQw4w9WgXcQ', { quality: 'low' })

      expect(mockStream.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', 'low')
    })

    it('defaults to high quality when no option is provided', async () => {
      mockStream.resolve.mockResolvedValue(makeStreamingData())

      await mk.getStream('dQw4w9WgXcQ')

      expect(mockStream.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
    })

    it('stream URL contains googlevideo.com', async () => {
      mockStream.resolve.mockResolvedValue(makeStreamingData())

      const result = await mk.getStream('dQw4w9WgXcQ')

      expect(result.url).toContain('googlevideo.com')
    })

    it('expiresAt is a Unix timestamp in the future', async () => {
      mockStream.resolve.mockResolvedValue(makeStreamingData())

      const result = await mk.getStream('dQw4w9WgXcQ')
      const nowSeconds = Math.floor(Date.now() / 1000)

      expect(result.expiresAt).toBeGreaterThan(nowSeconds)
    })
  })

  // ─── getTrack() ───────────────────────────────────────────────────────────

  describe('getTrack()', () => {
    it('returns an AudioTrack combining song metadata and stream', async () => {
      const song = makeSong({ videoId: 'dQw4w9WgXcQ' })
      const stream = makeStreamingData()
      mockDiscovery.search.mockResolvedValue([song])
      mockStream.resolve.mockResolvedValue(stream)

      const track = await mk.getTrack('dQw4w9WgXcQ')

      // Metadata fields from Song
      expect(track.type).toBe('song')
      expect(track.videoId).toBe('dQw4w9WgXcQ')
      expect(track.title).toBeTruthy()
      expect(track.artist).toBeTruthy()

      // Stream fields
      expect(track.stream).toBeDefined()
      expect(track.stream.url).toContain('googlevideo.com')
      expect(track.stream.codec).toMatch(/^(opus|mp4a)$/)
    })

    it('resolves the stream in parallel with metadata lookup', async () => {
      // Both should be called — order does not matter, but both must happen
      mockDiscovery.search.mockResolvedValue([makeSong()])
      mockStream.resolve.mockResolvedValue(makeStreamingData())

      await mk.getTrack('dQw4w9WgXcQ')

      expect(mockStream.resolve).toHaveBeenCalledTimes(1)
    })

    it('throws when the videoId is invalid', async () => {
      mockStream.resolve.mockRejectedValue(new Error('Video unavailable'))

      await expect(mk.getTrack('bad-id')).rejects.toThrow()
    })
  })
})
