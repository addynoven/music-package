import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RateLimiter } from '../../../src/rate-limiter'

describe('RateLimiter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // ─── minimum request gap ──────────────────────────────────────────────────

  describe('minimum request gap', () => {
    it('enforces 100 ms gap between consecutive requests on any endpoint', async () => {
      const limiter = new RateLimiter({}, 100)
      const t0 = Date.now()

      const p1 = limiter.throttle('search')
      const p2 = limiter.throttle('browse') // different endpoint — gap still applies
      await vi.runAllTimersAsync()
      await Promise.all([p1, p2])

      expect(Date.now() - t0).toBeGreaterThanOrEqual(100)
    })

    it('does not wait when enough time has already passed', async () => {
      const limiter = new RateLimiter({}, 100)
      await limiter.throttle('search')

      vi.advanceTimersByTime(200) // 200 ms passes — well past the gap

      expect(limiter.getWaitTime('search')).toBe(0)
    })
  })

  // ─── per-endpoint limits ──────────────────────────────────────────────────

  describe('per-endpoint token bucket', () => {
    it('allows 10 search requests per minute then throttles', async () => {
      const limiter = new RateLimiter({ search: 10 }, 0)

      for (let i = 0; i < 10; i++) {
        await limiter.throttle('search')
      }

      expect(limiter.getWaitTime('search')).toBeGreaterThan(0)
    })

    it('allows 5 stream requests per minute then throttles', async () => {
      const limiter = new RateLimiter({ stream: 5 }, 0)

      for (let i = 0; i < 5; i++) {
        await limiter.throttle('stream')
      }

      expect(limiter.getWaitTime('stream')).toBeGreaterThan(0)
    })

    it('allows 20 browse requests per minute then throttles', async () => {
      const limiter = new RateLimiter({ browse: 20 }, 0)

      for (let i = 0; i < 20; i++) {
        await limiter.throttle('browse')
      }

      expect(limiter.getWaitTime('browse')).toBeGreaterThan(0)
    })

    it('allows 30 autocomplete requests per minute then throttles', async () => {
      const limiter = new RateLimiter({ autocomplete: 30 }, 0)

      for (let i = 0; i < 30; i++) {
        await limiter.throttle('autocomplete')
      }

      expect(limiter.getWaitTime('autocomplete')).toBeGreaterThan(0)
    })

    it('does NOT throttle endpoint A because endpoint B is exhausted', async () => {
      const limiter = new RateLimiter({ search: 2, stream: 5 }, 0)

      // exhaust search
      await limiter.throttle('search')
      await limiter.throttle('search')
      expect(limiter.getWaitTime('search')).toBeGreaterThan(0)

      // stream is independent — should still be free
      expect(limiter.getWaitTime('stream')).toBe(0)
    })
  })

  // ─── bucket refill ────────────────────────────────────────────────────────

  describe('token bucket refill', () => {
    it('refills the bucket after 60 seconds', async () => {
      const limiter = new RateLimiter({ search: 2 }, 0)

      await limiter.throttle('search')
      await limiter.throttle('search')
      expect(limiter.getWaitTime('search')).toBeGreaterThan(0)

      vi.advanceTimersByTime(60_000)

      expect(limiter.getWaitTime('search')).toBe(0)
    })
  })

  // ─── custom limits ────────────────────────────────────────────────────────

  describe('custom rate limits from config', () => {
    it('honours a lower custom limit', async () => {
      const limiter = new RateLimiter({ search: 2 }, 0)

      await limiter.throttle('search')
      await limiter.throttle('search')

      expect(limiter.getWaitTime('search')).toBeGreaterThan(0)
    })

    it('honours a higher custom limit', async () => {
      const limiter = new RateLimiter({ search: 20 }, 0)

      for (let i = 0; i < 15; i++) {
        await limiter.throttle('search')
      }

      // 15 out of 20 — should still have capacity
      expect(limiter.getWaitTime('search')).toBe(0)
    })
  })
})

// ── weighted throttle ─────────────────────────────────────────────────────────

describe('weighted throttle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a weight-2 call consumes 2 tokens instead of 1', async () => {
    const limiter = new RateLimiter({ search: 5 }, 0)

    await limiter.throttle('search', undefined, 2)

    // 5 - 2 = 3 tokens remaining → still capacity
    expect(limiter.getWaitTime('search')).toBe(0)
    // consume remaining 3 with weight 1 each
    await limiter.throttle('search')
    await limiter.throttle('search')
    await limiter.throttle('search')
    // now exhausted
    expect(limiter.getWaitTime('search')).toBeGreaterThan(0)
  })

  it('weight defaults to 1 when not specified', async () => {
    const limiter = new RateLimiter({ search: 2 }, 0)

    await limiter.throttle('search')
    await limiter.throttle('search')

    expect(limiter.getWaitTime('search')).toBeGreaterThan(0)
  })

  it('a single heavy call exhausts the bucket when weight equals the limit', async () => {
    const limiter = new RateLimiter({ search: 3 }, 0)

    await limiter.throttle('search', undefined, 3)

    expect(limiter.getWaitTime('search')).toBeGreaterThan(0)
  })
})
