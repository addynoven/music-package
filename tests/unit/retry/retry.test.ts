import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RetryEngine, HttpError } from '../../../src/retry'

describe('RetryEngine', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // ─── success path ─────────────────────────────────────────────────────────

  describe('successful requests', () => {
    it('returns the result on first attempt', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn().mockResolvedValue('result')

      expect(await engine.execute(fn, 'search')).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('returns the result on the second attempt when first fails', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fluke'))
        .mockResolvedValue('ok')

      const promise = engine.execute(fn, 'search')
      await vi.runAllTimersAsync()

      expect(await promise).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  // ─── exponential backoff ──────────────────────────────────────────────────

  describe('exponential backoff', () => {
    it('retries exactly maxAttempts times then throws', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn().mockRejectedValue(new Error('Network error'))

      const promise = engine.execute(fn, 'search')
      promise.catch(() => {})
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('uses delays of 1 s → 2 s between retries', async () => {
      const delays: number[] = []
      const engine = new RetryEngine({
        maxAttempts: 3,
        backoffBase: 1_000,
        onRetry: (_attempt, delay) => delays.push(delay),
      })
      const fn = vi.fn().mockRejectedValue(new Error('fail'))

      const promise = engine.execute(fn, 'search')
      promise.catch(() => {})
      await vi.runAllTimersAsync()
      await promise.catch(() => {})

      expect(delays).toEqual([1_000, 2_000])
    })

    it('caps delay at backoffMax', async () => {
      const delays: number[] = []
      const engine = new RetryEngine({
        maxAttempts: 5,
        backoffBase: 1_000,
        backoffMax: 3_000,
        onRetry: (_, delay) => delays.push(delay),
      })
      const fn = vi.fn().mockRejectedValue(new Error('fail'))

      const promise = engine.execute(fn, 'search')
      promise.catch(() => {})
      await vi.runAllTimersAsync()
      await promise.catch(() => {})

      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(3_000)
      }
    })
  })

  // ─── 429 handling ─────────────────────────────────────────────────────────

  describe('429 — Too Many Requests', () => {
    it('waits 60 s then retries', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn()
        .mockRejectedValueOnce(new HttpError(429, 'Too Many Requests'))
        .mockResolvedValue('ok')
      const onRateLimited = vi.fn()

      const promise = engine.execute(fn, 'search', { onRateLimited })
      await vi.advanceTimersByTimeAsync(60_000)

      expect(await promise).toBe('ok')
      expect(onRateLimited).toHaveBeenCalledWith(60_000)
    })

    it('counts the 60 s pause as a separate wait — does not consume a retry slot', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn()
        .mockRejectedValueOnce(new HttpError(429, 'Too Many Requests'))
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue('final')

      const promise = engine.execute(fn, 'search', { onRateLimited: vi.fn() })
      await vi.runAllTimersAsync()

      expect(await promise).toBe('final')
    })
  })

  // ─── 403 handling ─────────────────────────────────────────────────────────

  describe('403 — Forbidden', () => {
    it('calls onForbidden then retries once', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const onForbidden = vi.fn().mockResolvedValue(undefined)
      const fn = vi.fn()
        .mockRejectedValueOnce(new HttpError(403, 'Forbidden'))
        .mockResolvedValue('ok')

      const result = await engine.execute(fn, 'search', { onForbidden })

      expect(result).toBe('ok')
      expect(onForbidden).toHaveBeenCalledTimes(1)
    })

    it('throws after the second 403 — does not loop forever', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const onForbidden = vi.fn().mockResolvedValue(undefined)
      const fn = vi.fn().mockRejectedValue(new HttpError(403, 'Forbidden'))

      const promise = engine.execute(fn, 'search', { onForbidden })
      promise.catch(() => {})
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow()
      // Only retried once after the 403, not in an infinite loop
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  // ─── non-retryable errors ─────────────────────────────────────────────────

  describe('non-retryable status codes', () => {
    it('does not retry on 404', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn().mockRejectedValue(new HttpError(404, 'Not Found'))

      await expect(engine.execute(fn, 'stream')).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('does not retry on 410 (video removed)', async () => {
      const engine = new RetryEngine({ maxAttempts: 3, backoffBase: 1_000 })
      const fn = vi.fn().mockRejectedValue(new HttpError(410, 'Gone'))

      await expect(engine.execute(fn, 'stream')).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
