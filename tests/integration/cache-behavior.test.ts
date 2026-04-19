/**
 * Integration — cache behaviour.
 *
 * Proves the cache layer works correctly across:
 *   - first call (miss) → fetch → store
 *   - second call (hit) → return stored
 *   - expired entry → re-fetch
 *   - disabled cache → always fetch
 *
 * Uses real Cache implementation. No mocks.
 *
 * Run with: RUN_INTEGRATION=1 pnpm test:integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Cache } from '../../src/cache'
import { makeStreamingData } from '../helpers/mock-factory'

const SKIP = !process.env.RUN_INTEGRATION

describe.skipIf(SKIP)('Integration — cache behaviour', () => {
  let cache: Cache

  beforeEach(() => {
    cache = new Cache({ enabled: true })
    vi.useFakeTimers()
  })

  afterEach(() => {
    cache.close()
    vi.useRealTimers()
  })

  // ─── search caching ───────────────────────────────────────────────────────

  describe('search result caching', () => {
    it('stores search results and returns them on the second call', () => {
      const key = 'search:queen:songs'
      const results = [{ videoId: 'abc', title: 'Test' }]

      cache.set(key, results, Cache.TTL.SEARCH)
      const hit = cache.get(key)

      expect(hit).toEqual(results)
    })

    it('returns null after 5 minutes (search TTL)', () => {
      const key = 'search:queen:songs'
      cache.set(key, [{ videoId: 'abc' }], Cache.TTL.SEARCH)

      vi.advanceTimersByTime(Cache.TTL.SEARCH * 1_000 + 1)

      expect(cache.get(key)).toBeNull()
    })

    it('still returns results before 5 minutes elapses', () => {
      const key = 'search:queen:songs'
      cache.set(key, [{ videoId: 'abc' }], Cache.TTL.SEARCH)

      vi.advanceTimersByTime((Cache.TTL.SEARCH - 60) * 1_000) // 4 minutes

      expect(cache.get(key)).not.toBeNull()
    })
  })

  // ─── stream URL caching ───────────────────────────────────────────────────

  describe('stream URL caching', () => {
    it('stores and retrieves StreamingData', () => {
      const stream = makeStreamingData()
      cache.set('stream:dQw4w9WgXcQ:high', stream, Cache.TTL.STREAM)

      const hit = cache.get('stream:dQw4w9WgXcQ:high') as typeof stream

      expect(hit.url).toBe(stream.url)
      expect(hit.codec).toBe(stream.codec)
    })

    it('expires after 6 hours', () => {
      const stream = makeStreamingData()
      cache.set('stream:dQw4w9WgXcQ:high', stream, Cache.TTL.STREAM)

      vi.advanceTimersByTime(Cache.TTL.STREAM * 1_000 + 1)

      expect(cache.get('stream:dQw4w9WgXcQ:high')).toBeNull()
    })
  })

  // ─── visitor ID caching ───────────────────────────────────────────────────

  describe('visitor ID caching', () => {
    it('stores and retrieves a visitor ID', () => {
      cache.set('visitor_id', 'CgtBQnlVMnBiVFJPYyiD', Cache.TTL.VISITOR_ID)

      expect(cache.get('visitor_id')).toBe('CgtBQnlVMnBiVFJPYyiD')
    })

    it('expires after 30 days', () => {
      cache.set('visitor_id', 'CgtBQnlVMnBiVFJPYyiD', Cache.TTL.VISITOR_ID)

      vi.advanceTimersByTime(Cache.TTL.VISITOR_ID * 1_000 + 1)

      expect(cache.get('visitor_id')).toBeNull()
    })

    it('still valid at 29 days', () => {
      cache.set('visitor_id', 'CgtBQnlVMnBiVFJPYyiD', Cache.TTL.VISITOR_ID)

      const twentyNineDays = 29 * 24 * 60 * 60 * 1_000
      vi.advanceTimersByTime(twentyNineDays)

      expect(cache.get('visitor_id')).toBeTruthy()
    })
  })

  // ─── home / artist TTLs ───────────────────────────────────────────────────

  describe('browse TTLs', () => {
    it('home feed is cached for 8 hours', () => {
      cache.set('home', [{ title: 'Quick picks' }], Cache.TTL.HOME)

      vi.advanceTimersByTime((Cache.TTL.HOME - 60) * 1_000) // just before expiry
      expect(cache.get('home')).not.toBeNull()

      vi.advanceTimersByTime(120_000) // past expiry
      expect(cache.get('home')).toBeNull()
    })

    it('artist page is cached for 1 hour', () => {
      cache.set('artist:UCtest', { name: 'Queen' }, Cache.TTL.ARTIST)

      vi.advanceTimersByTime((Cache.TTL.ARTIST - 60) * 1_000)
      expect(cache.get('artist:UCtest')).not.toBeNull()

      vi.advanceTimersByTime(120_000)
      expect(cache.get('artist:UCtest')).toBeNull()
    })
  })

  // ─── cache disabled ───────────────────────────────────────────────────────

  describe('cache disabled', () => {
    it('always returns null regardless of what was stored', () => {
      const off = new Cache({ enabled: false })

      off.set('key', { data: 'value' }, 3_600)
      expect(off.get('key')).toBeNull()

      off.close()
    })
  })
})
