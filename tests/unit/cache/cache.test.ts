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
})
