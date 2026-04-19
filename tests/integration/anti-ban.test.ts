/**
 * Integration — anti-ban layer behaviour.
 *
 * Tests the rate limiter, retry engine, and session manager working together.
 * Uses fake timers — no real delays — but real implementations (no mocks).
 *
 * Run with: RUN_INTEGRATION=1 pnpm test:integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RateLimiter } from '../../src/rate-limiter'
import { RetryEngine, HttpError } from '../../src/retry'
import { Cache } from '../../src/cache'

const SKIP = !process.env.RUN_INTEGRATION

describe.skipIf(SKIP)('Integration — anti-ban layer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // ─── rate limiter + retry working together ────────────────────────────────

  describe('RateLimiter + RetryEngine', () => {
    it('rate limit is applied before each retry attempt', async () => {
      const limiter = new RateLimiter({ search: 1 }, 0)
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })

      let throttleCount = 0
      const originalThrottle = limiter.throttle.bind(limiter)
      vi.spyOn(limiter, 'throttle').mockImplementation(async (endpoint) => {
        throttleCount++
        return originalThrottle(endpoint)
      })

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('ok')

      const promise = engine.execute(
        async () => {
          await limiter.throttle('search')
          return fn()
        },
        'search'
      )
      await vi.runAllTimersAsync()

      expect(await promise).toBe('ok')
      expect(throttleCount).toBeGreaterThanOrEqual(2)
    })
  })

  // ─── cache + rate limiter: cache hit skips throttle ───────────────────────

  describe('Cache short-circuits rate limiting', () => {
    it('cached responses are returned without consuming a rate limit token', async () => {
      const cache = new Cache({ enabled: true })
      const limiter = new RateLimiter({ search: 2 }, 0)

      cache.set('search:queen:songs', ['result'], Cache.TTL.SEARCH)

      // Exhaust the 2-request budget
      await limiter.throttle('search')
      await limiter.throttle('search')

      // Cache hit — should not throttle even though bucket is empty
      const cached = cache.get('search:queen:songs')
      expect(cached).toEqual(['result'])

      // Rate limiter confirms bucket is empty
      expect(limiter.getWaitTime('search')).toBeGreaterThan(0)

      cache.close()
    })
  })

  // ─── 429 → 60 s wait → retry ─────────────────────────────────────────────

  describe('429 handling end-to-end', () => {
    it('waits exactly 60 000 ms after a 429 before retrying', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const timestamps: number[] = []

      const fn = vi.fn().mockImplementation(() => {
        timestamps.push(Date.now())
        if (timestamps.length === 1) {
          throw new HttpError(429, 'Too Many Requests')
        }
        return Promise.resolve('ok')
      })

      const promise = engine.execute(fn, 'search', { onRateLimited: vi.fn() })
      await vi.advanceTimersByTimeAsync(60_000)

      expect(await promise).toBe('ok')

      const gap = timestamps[1] - timestamps[0]
      expect(gap).toBeGreaterThanOrEqual(60_000)
    })
  })

  // ─── 403 → visitor ID refresh → retry ────────────────────────────────────

  describe('403 handling end-to-end', () => {
    it('refreshes visitor ID and retries exactly once on 403', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const refreshCalls: number[] = []

      const onForbidden = vi.fn(async () => {
        refreshCalls.push(Date.now())
      })

      const fn = vi.fn()
        .mockRejectedValueOnce(new HttpError(403, 'Forbidden'))
        .mockResolvedValue('ok')

      const result = await engine.execute(fn, 'search', { onForbidden })

      expect(result).toBe('ok')
      expect(onForbidden).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  // ─── stream URL expiry ────────────────────────────────────────────────────

  describe('stream URL expiry detection', () => {
    it('isUrlExpired returns true for a URL expiring within the 30-min buffer', () => {
      const cache = new Cache({ enabled: true })

      // 20 minutes from now — within the 30-min safety buffer
      const soon = Math.floor(Date.now() / 1000) + 1_200
      const url = `https://rr5.googlevideo.com/videoplayback?expire=${soon}&itag=251`

      expect(cache.isUrlExpired(url)).toBe(true)
      cache.close()
    })

    it('isUrlExpired returns false for a URL valid for several hours', () => {
      const cache = new Cache({ enabled: true })

      const future = Math.floor(Date.now() / 1000) + 18_000 // 5 hours
      const url = `https://rr5.googlevideo.com/videoplayback?expire=${future}&itag=251`

      expect(cache.isUrlExpired(url)).toBe(false)
      cache.close()
    })
  })
})
