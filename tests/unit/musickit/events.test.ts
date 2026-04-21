import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData, makeSong } from '../../helpers/mock-factory'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')
vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: class {
    readonly name = 'jiosaavn'
    canHandle() { return false }
    async search() { return { songs: [], albums: [], artists: [], playlists: [] } }
    async getStream() { throw new Error('not handled') }
    async getMetadata() { throw new Error('not handled') }
  },
}))

import { DiscoveryClient } from '../../../src/discovery'
import { StreamResolver } from '../../../src/stream'
import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockDiscovery = { autocomplete: vi.fn(), search: vi.fn() }
const mockStream = { resolve: vi.fn() }

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)
;(StreamResolver as any).mockImplementation(() => mockStream)

describe('MusicKit — events', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  // ─── on / off ─────────────────────────────────────────────────────────────

  describe('on() and off()', () => {
    it('on() registers a handler that fires when the event is emitted', async () => {
      const handler = vi.fn()
      mk.on('cacheHit', handler)

      // Trigger a cache hit by calling search twice (second call should be cached)
      mockDiscovery.search.mockResolvedValue([makeSong()])
      await mk.search('queen', { filter: 'songs' })
      await mk.search('queen', { filter: 'songs' }) // hits cache

      expect(handler).toHaveBeenCalled()
    })

    it('off() removes the handler so it no longer fires', async () => {
      const handler = vi.fn()
      mk.on('cacheHit', handler)
      mk.off('cacheHit', handler)

      mockDiscovery.search.mockResolvedValue([makeSong()])
      await mk.search('queen', { filter: 'songs' })
      await mk.search('queen', { filter: 'songs' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('does not throw when calling off() for an unregistered handler', () => {
      expect(() => mk.off('error', vi.fn())).not.toThrow()
    })
  })

  // ─── cacheHit event ───────────────────────────────────────────────────────

  describe('cacheHit event', () => {
    it('fires with the cache key and ttl remaining', async () => {
      const handler = vi.fn()
      mk.on('cacheHit', handler)

      mockDiscovery.search.mockResolvedValue([makeSong()])
      await mk.search('queen', { filter: 'songs' })
      await mk.search('queen', { filter: 'songs' }) // cache hit

      const [key, ttl] = handler.mock.calls[0]
      expect(typeof key).toBe('string')
      expect(typeof ttl).toBe('number')
      expect(ttl).toBeGreaterThan(0)
    })
  })

  // ─── cacheMiss event ──────────────────────────────────────────────────────

  describe('cacheMiss event', () => {
    it('fires on the first call to search (no cache yet)', async () => {
      const handler = vi.fn()
      mk.on('cacheMiss', handler)

      mockDiscovery.search.mockResolvedValue([makeSong()])
      await mk.search('queen', { filter: 'songs' })

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  // ─── rateLimited event ────────────────────────────────────────────────────

  describe('rateLimited event', () => {
    // RateLimiter is fully mocked in this file — move this to integration tests where the real limiter runs
    it.skip('fires when the rate limiter introduces a delay', async () => {
      const mk2 = new MusicKit({
        logLevel: 'silent',
        rateLimit: { search: 1 }, // very tight limit to force throttling
        minRequestGap: 0,
      })
      const handler = vi.fn()
      mk2.on('rateLimited', handler)

      mockDiscovery.search.mockResolvedValue([])
      await mk2.search('first')
      await mk2.search('second') // should hit the rate limit

      expect(handler).toHaveBeenCalled()
    })
  })

  // ─── error event ──────────────────────────────────────────────────────────

  describe('error event', () => {
    it('fires when a public API method throws', async () => {
      const handler = vi.fn()
      mk.on('error', handler)

      mockStream.resolve.mockRejectedValue(new Error('Video unavailable'))

      await mk.getStream('bad-id').catch(() => {})

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.any(String),
      }))
    })
  })

  // ─── multiple handlers ────────────────────────────────────────────────────

  describe('multiple handlers for same event', () => {
    it('calls all registered handlers', async () => {
      const h1 = vi.fn()
      const h2 = vi.fn()

      mk.on('cacheMiss', h1)
      mk.on('cacheMiss', h2)

      mockDiscovery.search.mockResolvedValue([])
      await mk.search('test', { filter: 'songs' })

      expect(h1).toHaveBeenCalled()
      expect(h2).toHaveBeenCalled()
    })
  })
})
