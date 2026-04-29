import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '../../../src/logger'

// ── routing ───────────────────────────────────────────────────────────────────

describe('Logger — routing to logHandler', () => {
  it('calls logHandler with the right level and message', () => {
    const handler = vi.fn()
    const log = new Logger({ logLevel: 'info', logHandler: handler })

    log.info('hello world')

    expect(handler).toHaveBeenCalledWith('info', 'hello world', undefined)
  })

  it('passes meta object as third argument when provided', () => {
    const handler = vi.fn()
    const log = new Logger({ logHandler: handler, logLevel: 'debug' })

    log.debug('connecting', { host: 'localhost', port: 3000 })

    expect(handler).toHaveBeenCalledWith('debug', 'connecting', { host: 'localhost', port: 3000 })
  })

  it('passes undefined meta when no meta given', () => {
    const handler = vi.fn()
    const log = new Logger({ logHandler: handler, logLevel: 'warn' })

    log.warn('something is off')

    expect(handler).toHaveBeenCalledWith('warn', 'something is off', undefined)
  })
})

// ── level filtering ───────────────────────────────────────────────────────────

describe('Logger — level filtering', () => {
  it('silent suppresses all output', () => {
    const handler = vi.fn()
    const log = new Logger({ logLevel: 'silent', logHandler: handler })

    log.error('critical')
    log.warn('warning')
    log.info('info')
    log.debug('debug')

    expect(handler).not.toHaveBeenCalled()
  })

  it('error level only allows error through', () => {
    const handler = vi.fn()
    const log = new Logger({ logLevel: 'error', logHandler: handler })

    log.error('fail')
    log.warn('warn')
    log.info('info')
    log.debug('debug')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('error', 'fail', undefined)
  })

  it('warn level allows error and warn through', () => {
    const handler = vi.fn()
    const log = new Logger({ logLevel: 'warn', logHandler: handler })

    log.error('fail')
    log.warn('warning')
    log.info('info')
    log.debug('debug')

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('info level allows error, warn, info through', () => {
    const handler = vi.fn()
    const log = new Logger({ logLevel: 'info', logHandler: handler })

    log.error('fail')
    log.warn('warning')
    log.info('info')
    log.debug('debug')

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('debug level allows everything through', () => {
    const handler = vi.fn()
    const log = new Logger({ logLevel: 'debug', logHandler: handler })

    log.error('fail')
    log.warn('warning')
    log.info('info')
    log.debug('debug')

    expect(handler).toHaveBeenCalledTimes(4)
  })

  it('defaults to warn level when logLevel is not specified', () => {
    const handler = vi.fn()
    const log = new Logger({ logHandler: handler })

    log.info('should be suppressed')
    log.debug('should be suppressed')
    log.warn('should pass')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('warn', 'should pass', undefined)
  })
})

// ── console fallback ──────────────────────────────────────────────────────────

describe('Logger — console fallback when no logHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('routes error to console.error', () => {
    const log = new Logger({ logLevel: 'error' })
    log.error('something failed')
    expect(console.error).toHaveBeenCalledWith('[error] something failed', '')
  })

  it('routes warn to console.warn', () => {
    const log = new Logger({ logLevel: 'warn' })
    log.warn('heads up')
    expect(console.warn).toHaveBeenCalledWith('[warn] heads up', '')
  })

  it('routes info to console.info', () => {
    const log = new Logger({ logLevel: 'info' })
    log.info('started')
    expect(console.info).toHaveBeenCalledWith('[info] started', '')
  })

  it('routes debug to console.debug', () => {
    const log = new Logger({ logLevel: 'debug' })
    log.debug('verbose detail')
    expect(console.debug).toHaveBeenCalledWith('[debug] verbose detail', '')
  })

  it('includes stringified meta in console output', () => {
    const log = new Logger({ logLevel: 'info' })
    log.info('event fired', { key: 'val' })
    expect(console.info).toHaveBeenCalledWith('[info] event fired', JSON.stringify({ key: 'val' }))
  })
})
