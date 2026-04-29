import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Cache } from '../../../src/cache'

describe('Cache', () => {
  let cache: Cache

  beforeEach(() => {
    cache = new Cache({ enabled: true }) // in-memory SQLite
  })

  afterEach(() => {
    cache.close()
    vi.useRealTimers()
  })

  // ─── get / set ────────────────────────────────────────────────────────────

  describe('get / set', () => {
    it('returns null for a missing key', () => {
      expect(cache.get('missing')).toBeNull()
    })

    it('stores and retrieves a value', () => {
      cache.set('key', { title: 'Bohemian Rhapsody' }, 3600)
      expect(cache.get('key')).toEqual({ title: 'Bohemian Rhapsody' })
    })

    it('serialises and deserialises arrays', () => {
      cache.set('suggestions', ['a', 'b', 'c'], 300)
      expect(cache.get('suggestions')).toEqual(['a', 'b', 'c'])
    })

    it('returns null for an expired entry', () => {
      vi.useFakeTimers()
      cache.set('key', 'value', 1) // 1-second TTL
      vi.advanceTimersByTime(2_000)
      expect(cache.get('key')).toBeNull()
    })

    it('returns the value before TTL elapses', () => {
      vi.useFakeTimers()
      cache.set('key', 'value', 3600)
      vi.advanceTimersByTime(1_000)
      expect(cache.get('key')).toBe('value')
    })
  })

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes a stored entry', () => {
      cache.set('key', 'value', 3600)
      cache.delete('key')
      expect(cache.get('key')).toBeNull()
    })

    it('does not throw when deleting a missing key', () => {
      expect(() => cache.delete('never-existed')).not.toThrow()
    })
  })

  // ─── isUrlExpired ─────────────────────────────────────────────────────────

  describe('isUrlExpired', () => {
    it('returns true when the expire param is in the past', () => {
      const past = Math.floor(Date.now() / 1000) - 100
      const url = `https://rr5.googlevideo.com/videoplayback?expire=${past}&itag=251`
      expect(cache.isUrlExpired(url)).toBe(true)
    })

    it('returns false when the expire param is far in the future', () => {
      const future = Math.floor(Date.now() / 1000) + 21_600
      const url = `https://rr5.googlevideo.com/videoplayback?expire=${future}&itag=251`
      expect(cache.isUrlExpired(url)).toBe(false)
    })

    it('treats URLs expiring within the 30-minute buffer as expired', () => {
      // 1800 seconds = 30 minutes — we treat anything within this window as expired
      const soon = Math.floor(Date.now() / 1000) + 1_200 // 20 minutes — inside buffer
      const url = `https://rr5.googlevideo.com/videoplayback?expire=${soon}&itag=251`
      expect(cache.isUrlExpired(url)).toBe(true)
    })

    it('returns true for a URL with no expire param', () => {
      expect(cache.isUrlExpired('https://rr5.googlevideo.com/videoplayback?itag=251')).toBe(true)
    })
  })

  // ─── TTL constants ────────────────────────────────────────────────────────

  describe('TTL constants', () => {
    it('exposes STREAM TTL of 21 600 seconds (6 hours)', () => {
      expect(Cache.TTL.STREAM).toBe(21_600)
    })

    it('exposes SEARCH TTL of 300 seconds (5 minutes)', () => {
      expect(Cache.TTL.SEARCH).toBe(300)
    })

    it('exposes HOME TTL of 28 800 seconds (8 hours)', () => {
      expect(Cache.TTL.HOME).toBe(28_800)
    })

    it('exposes ARTIST TTL of 3 600 seconds (1 hour)', () => {
      expect(Cache.TTL.ARTIST).toBe(3_600)
    })

    it('exposes VISITOR_ID TTL of 2 592 000 seconds (30 days)', () => {
      expect(Cache.TTL.VISITOR_ID).toBe(2_592_000)
    })
  })

  // ─── disabled cache ───────────────────────────────────────────────────────

  describe('disabled cache', () => {
    it('always returns null when cache is disabled', () => {
      const off = new Cache({ enabled: false })
      off.set('key', 'value', 3600)
      expect(off.get('key')).toBeNull()
      off.close()
    })

    it('set() on a disabled cache is a no-op (no throw)', () => {
      const off = new Cache({ enabled: false })
      expect(() => off.set('key', 'value', 3600)).not.toThrow()
      off.close()
    })
  })

  // ── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('starts with zero hits and misses', () => {
      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })

    it('increments hits on a successful get', () => {
      cache.set('k', 'v', 60)
      cache.get('k')
      expect(cache.getStats().hits).toBe(1)
    })

    it('increments misses on a cache miss', () => {
      cache.get('nonexistent')
      expect(cache.getStats().misses).toBe(1)
    })

    it('increments misses on an expired entry', () => {
      cache.set('k', 'v', -1) // already expired
      cache.get('k')
      expect(cache.getStats().misses).toBe(1)
      expect(cache.getStats().hits).toBe(0)
    })

    it('tracks both hits and misses independently', () => {
      cache.set('a', 1, 60)
      cache.get('a') // hit
      cache.get('a') // hit
      cache.get('b') // miss
      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
    })

    it('returns keys count matching live entries', () => {
      cache.set('x', 1, 60)
      cache.set('y', 2, 60)
      expect(cache.getStats().keys).toBe(2)
    })

    it('returns zero stats when cache is disabled', () => {
      const disabled = new Cache({ enabled: false })
      const stats = disabled.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.keys).toBe(0)
    })
  })

  // ── sweep ───────────────────────────────────────────────────────────────────

  describe('sweep', () => {
    it('deletes expired entries and returns count removed', () => {
      cache.set('live', 'val', 60)
      cache.set('dead1', 'val', -1)
      cache.set('dead2', 'val', -1)

      const removed = cache.sweep()

      expect(removed).toBe(2)
      expect(cache.get('live')).not.toBeNull()
    })

    it('returns 0 when nothing is expired', () => {
      cache.set('a', 1, 60)
      cache.set('b', 2, 60)
      expect(cache.sweep()).toBe(0)
    })

    it('returns 0 on empty cache', () => {
      expect(cache.sweep()).toBe(0)
    })

    it('returns 0 when cache is disabled', () => {
      const disabled = new Cache({ enabled: false })
      expect(disabled.sweep()).toBe(0)
    })

    it('reduces keys count after sweep', () => {
      cache.set('a', 1, 60)
      cache.set('b', 2, -1) // expired
      cache.sweep()
      expect(cache.getStats().keys).toBe(1)
    })
  })
})
