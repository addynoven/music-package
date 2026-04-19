import type { RateLimitConfig } from '../models'

const WINDOW_MS = 60_000

interface Bucket {
  tokens: number
  limit: number
  windowStart: number
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private lastRequestAt = 0
  private readonly minGapMs: number
  private readonly limits: Required<RateLimitConfig>

  constructor(limits: RateLimitConfig = {}, minGapMs = 100) {
    this.minGapMs = minGapMs
    this.limits = {
      search: limits.search ?? 10,
      browse: limits.browse ?? 20,
      stream: limits.stream ?? 5,
      autocomplete: limits.autocomplete ?? 30,
    }
  }

  async throttle(endpoint: string, onLimited?: (endpoint: string, waitMs: number) => void): Promise<void> {
    const waited = await this.enforceMinGap()
    if (waited > 0) onLimited?.(endpoint, waited)
    this.consumeToken(endpoint)
  }

  getWaitTime(endpoint: string): number {
    const bucket = this.getBucket(endpoint)
    this.refillIfNeeded(bucket)
    if (bucket.tokens > 0) return 0
    return bucket.windowStart + WINDOW_MS - Date.now()
  }

  private async enforceMinGap(): Promise<number> {
    const wait = this.lastRequestAt + this.minGapMs - Date.now()
    if (wait > 0) {
      await delay(wait)
      this.lastRequestAt = Date.now()
      return wait
    }
    this.lastRequestAt = Date.now()
    return 0
  }

  private consumeToken(endpoint: string): void {
    const bucket = this.getBucket(endpoint)
    this.refillIfNeeded(bucket)
    if (bucket.tokens > 0) bucket.tokens--
  }

  private getBucket(endpoint: string): Bucket {
    if (!this.buckets.has(endpoint)) {
      const limit = (this.limits as Record<string, number>)[endpoint] ?? 10
      this.buckets.set(endpoint, { tokens: limit, limit, windowStart: Date.now() })
    }
    return this.buckets.get(endpoint)!
  }

  private refillIfNeeded(bucket: Bucket): void {
    if (Date.now() >= bucket.windowStart + WINDOW_MS) {
      bucket.tokens = bucket.limit
      bucket.windowStart = Date.now()
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
