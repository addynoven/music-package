import { describe, it, expect } from 'vitest'
import {
  MusicKitBaseError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  StreamError,
} from '../../../src/errors'

// ── Base class ────────────────────────────────────────────────────────────────

describe('MusicKitBaseError', () => {
  it('is an instance of Error', () => {
    const err = new MusicKitBaseError('something broke', 'GENERIC')
    expect(err).toBeInstanceOf(Error)
  })

  it('preserves message', () => {
    const err = new MusicKitBaseError('something broke', 'GENERIC')
    expect(err.message).toBe('something broke')
  })

  it('exposes code', () => {
    const err = new MusicKitBaseError('something broke', 'GENERIC')
    expect(err.code).toBe('GENERIC')
  })

  it('sets name to class name', () => {
    const err = new MusicKitBaseError('something broke', 'GENERIC')
    expect(err.name).toBe('MusicKitBaseError')
  })

  it('has a stack trace', () => {
    const err = new MusicKitBaseError('something broke', 'GENERIC')
    expect(err.stack).toBeDefined()
  })
})

// ── NotFoundError ─────────────────────────────────────────────────────────────

describe('NotFoundError', () => {
  it('is an instance of MusicKitBaseError', () => {
    const err = new NotFoundError('video not found', 'dQw4w9WgXcQ')
    expect(err).toBeInstanceOf(MusicKitBaseError)
  })

  it('is an instance of Error', () => {
    const err = new NotFoundError('video not found', 'dQw4w9WgXcQ')
    expect(err).toBeInstanceOf(Error)
  })

  it('has code NOT_FOUND', () => {
    const err = new NotFoundError('video not found', 'dQw4w9WgXcQ')
    expect(err.code).toBe('NOT_FOUND')
  })

  it('preserves message', () => {
    const err = new NotFoundError('video not found', 'dQw4w9WgXcQ')
    expect(err.message).toBe('video not found')
  })

  it('exposes the resource id', () => {
    const err = new NotFoundError('video not found', 'dQw4w9WgXcQ')
    expect(err.resourceId).toBe('dQw4w9WgXcQ')
  })

  it('sets name to NotFoundError', () => {
    const err = new NotFoundError('video not found', 'dQw4w9WgXcQ')
    expect(err.name).toBe('NotFoundError')
  })

  it('works without a resourceId', () => {
    const err = new NotFoundError('not found')
    expect(err.resourceId).toBeUndefined()
  })
})

// ── RateLimitError ────────────────────────────────────────────────────────────

describe('RateLimitError', () => {
  it('is an instance of MusicKitBaseError', () => {
    const err = new RateLimitError('too many requests')
    expect(err).toBeInstanceOf(MusicKitBaseError)
  })

  it('has code RATE_LIMITED', () => {
    const err = new RateLimitError('too many requests')
    expect(err.code).toBe('RATE_LIMITED')
  })

  it('sets name to RateLimitError', () => {
    const err = new RateLimitError('too many requests')
    expect(err.name).toBe('RateLimitError')
  })

  it('exposes retryAfter in ms when provided', () => {
    const err = new RateLimitError('too many requests', 5000)
    expect(err.retryAfterMs).toBe(5000)
  })

  it('retryAfter is undefined when not provided', () => {
    const err = new RateLimitError('too many requests')
    expect(err.retryAfterMs).toBeUndefined()
  })
})

// ── NetworkError ──────────────────────────────────────────────────────────────

describe('NetworkError', () => {
  it('is an instance of MusicKitBaseError', () => {
    const err = new NetworkError('connection refused')
    expect(err).toBeInstanceOf(MusicKitBaseError)
  })

  it('has code NETWORK_ERROR', () => {
    const err = new NetworkError('connection refused')
    expect(err.code).toBe('NETWORK_ERROR')
  })

  it('sets name to NetworkError', () => {
    const err = new NetworkError('connection refused')
    expect(err.name).toBe('NetworkError')
  })

  it('exposes statusCode when provided', () => {
    const err = new NetworkError('forbidden', 403)
    expect(err.statusCode).toBe(403)
  })

  it('statusCode is undefined when not provided', () => {
    const err = new NetworkError('connection refused')
    expect(err.statusCode).toBeUndefined()
  })

  it('wraps an original error when provided', () => {
    const original = new TypeError('fetch failed')
    const err = new NetworkError('request failed', undefined, original)
    expect(err.cause).toBe(original)
  })
})

// ── ValidationError ───────────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('is an instance of MusicKitBaseError', () => {
    const err = new ValidationError('invalid video id', 'videoId')
    expect(err).toBeInstanceOf(MusicKitBaseError)
  })

  it('has code VALIDATION_ERROR', () => {
    const err = new ValidationError('invalid video id', 'videoId')
    expect(err.code).toBe('VALIDATION_ERROR')
  })

  it('sets name to ValidationError', () => {
    const err = new ValidationError('invalid video id', 'videoId')
    expect(err.name).toBe('ValidationError')
  })

  it('exposes the field that failed validation', () => {
    const err = new ValidationError('invalid video id', 'videoId')
    expect(err.field).toBe('videoId')
  })
})

// ── StreamError ───────────────────────────────────────────────────────────────

describe('StreamError', () => {
  it('is an instance of MusicKitBaseError', () => {
    const err = new StreamError('cipher decode failed', 'dQw4w9WgXcQ')
    expect(err).toBeInstanceOf(MusicKitBaseError)
  })

  it('has code STREAM_ERROR', () => {
    const err = new StreamError('cipher decode failed', 'dQw4w9WgXcQ')
    expect(err.code).toBe('STREAM_ERROR')
  })

  it('sets name to StreamError', () => {
    const err = new StreamError('cipher decode failed', 'dQw4w9WgXcQ')
    expect(err.name).toBe('StreamError')
  })

  it('exposes the videoId', () => {
    const err = new StreamError('cipher decode failed', 'dQw4w9WgXcQ')
    expect(err.videoId).toBe('dQw4w9WgXcQ')
  })
})

// ── instanceof narrowing works across the hierarchy ───────────────────────────

describe('instanceof narrowing', () => {
  it('NotFoundError is not a RateLimitError', () => {
    const err = new NotFoundError('not found')
    expect(err).not.toBeInstanceOf(RateLimitError)
  })

  it('can catch any MusicKit error with a single instanceof check', () => {
    const errors: Error[] = [
      new NotFoundError('not found'),
      new RateLimitError('rate limited'),
      new NetworkError('network failed'),
      new ValidationError('bad input', 'query'),
      new StreamError('cipher failed', 'abc123'),
    ]
    for (const err of errors) {
      expect(err).toBeInstanceOf(MusicKitBaseError)
    }
  })
})
