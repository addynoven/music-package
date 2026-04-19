const NON_RETRYABLE = new Set([404, 410])

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

interface RetryOptions {
  onRateLimited?: (waitMs: number) => void
  onForbidden?: () => Promise<void>
  onRetry?: (endpoint: string, attempt: number, reason: string) => void
}

interface RetryEngineConfig {
  maxAttempts: number
  backoffBase: number
  backoffMax?: number
  onRetry?: (attempt: number, delayMs: number) => void
}

export class RetryEngine {
  private readonly config: Required<RetryEngineConfig>

  constructor(config: RetryEngineConfig) {
    this.config = {
      backoffMax: config.backoffMax ?? 60_000,
      onRetry: config.onRetry ?? (() => {}),
      ...config,
    }
  }

  async execute<T>(
    fn: () => Promise<T>,
    _endpoint: string,
    options: RetryOptions = {},
  ): Promise<T> {
    let forbiddenRetried = false
    let attempt = 0

    while (attempt < this.config.maxAttempts) {
      try {
        return await fn()
      } catch (err) {
        if (err instanceof HttpError) {
          if (NON_RETRYABLE.has(err.statusCode)) throw err

          if (err.statusCode === 429) {
            const waitMs = 60_000
            options.onRateLimited?.(waitMs)
            await delay(waitMs)
            continue // 429 does not consume a retry slot
          }

          if (err.statusCode === 403) {
            if (forbiddenRetried) throw err
            forbiddenRetried = true
            await options.onForbidden?.()
            attempt++
            continue
          }
        }

        attempt++
        if (attempt >= this.config.maxAttempts) throw err

        const delayMs = Math.min(
          this.config.backoffBase * Math.pow(2, attempt - 1),
          this.config.backoffMax,
        )
        this.config.onRetry(attempt, delayMs)
        options.onRetry?.(_endpoint, attempt, (err as Error).message)
        await delay(delayMs)
      }
    }

    throw new Error('Max attempts reached')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
