export class MusicKitBaseError extends Error {
  readonly code: string

  constructor(message: string, code: string, cause?: unknown) {
    super(message)
    this.name = 'MusicKitBaseError'
    this.code = code
    if (cause !== undefined) (this as any).cause = cause
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends MusicKitBaseError {
  readonly resourceId?: string

  constructor(message: string, resourceId?: string) {
    super(message, 'NOT_FOUND')
    this.name = 'NotFoundError'
    this.resourceId = resourceId
  }
}

export class RateLimitError extends MusicKitBaseError {
  readonly retryAfterMs?: number

  constructor(message: string, retryAfterMs?: number) {
    super(message, 'RATE_LIMITED')
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export class NetworkError extends MusicKitBaseError {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number, cause?: unknown) {
    super(message, 'NETWORK_ERROR', cause)
    this.name = 'NetworkError'
    this.statusCode = statusCode
  }
}

export class ValidationError extends MusicKitBaseError {
  readonly field: string

  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    this.field = field
  }
}

export class StreamError extends MusicKitBaseError {
  readonly videoId: string

  constructor(message: string, videoId: string, cause?: unknown) {
    super(message, 'STREAM_ERROR', cause)
    this.name = 'StreamError'
    this.videoId = videoId
  }
}
