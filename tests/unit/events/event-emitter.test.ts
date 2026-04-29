import { describe, it, expect, vi } from 'vitest'
import { MusicKitEmitter } from '../../../src/events'

describe('MusicKitEmitter', () => {
  // ─── on / emit ────────────────────────────────────────────────────────────

  describe('on / emit', () => {
    it('calls the handler when the event is emitted', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.on('cacheHit', handler)
      emitter.emit('cacheHit', 'stream:dQw4w9WgXcQ', 3600)

      expect(handler).toHaveBeenCalledWith('stream:dQw4w9WgXcQ', 3600)
    })

    it('calls multiple handlers for the same event', () => {
      const emitter = new MusicKitEmitter()
      const h1 = vi.fn()
      const h2 = vi.fn()

      emitter.on('cacheHit', h1)
      emitter.on('cacheHit', h2)
      emitter.emit('cacheHit', 'key', 60)

      expect(h1).toHaveBeenCalledTimes(1)
      expect(h2).toHaveBeenCalledTimes(1)
    })

    it('does not call handlers registered for a different event', () => {
      const emitter = new MusicKitEmitter()
      const cacheHandler = vi.fn()
      const errorHandler = vi.fn()

      emitter.on('cacheHit', cacheHandler)
      emitter.on('error', errorHandler)
      emitter.emit('cacheHit', 'key', 60)

      expect(errorHandler).not.toHaveBeenCalled()
    })

    it('passes all arguments to the handler', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.on('rateLimited', handler)
      emitter.emit('rateLimited', 'search', 2_000)

      expect(handler).toHaveBeenCalledWith('search', 2_000)
    })
  })

  // ─── off ──────────────────────────────────────────────────────────────────

  describe('off', () => {
    it('removes a handler — further emits do not call it', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.on('cacheHit', handler)
      emitter.off('cacheHit', handler)
      emitter.emit('cacheHit', 'key', 60)

      expect(handler).not.toHaveBeenCalled()
    })

    it('removes only the specified handler, leaving others intact', () => {
      const emitter = new MusicKitEmitter()
      const h1 = vi.fn()
      const h2 = vi.fn()

      emitter.on('cacheHit', h1)
      emitter.on('cacheHit', h2)
      emitter.off('cacheHit', h1)
      emitter.emit('cacheHit', 'key', 60)

      expect(h1).not.toHaveBeenCalled()
      expect(h2).toHaveBeenCalledTimes(1)
    })

    it('does not throw when removing a handler that was never added', () => {
      const emitter = new MusicKitEmitter()
      expect(() => emitter.off('error', vi.fn())).not.toThrow()
    })
  })

  // ─── once ─────────────────────────────────────────────────────────────────

  describe('once', () => {
    it('fires the handler exactly once on the first emit', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.once('cacheHit', handler)
      emitter.emit('cacheHit', 'key', 60)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('key', 60)
    })

    it('does not fire on subsequent emits', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.once('cacheHit', handler)
      emitter.emit('cacheHit', 'key', 60)
      emitter.emit('cacheHit', 'key', 60)
      emitter.emit('cacheHit', 'key', 60)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('coexists with persistent on() handlers', () => {
      const emitter = new MusicKitEmitter()
      const once = vi.fn()
      const always = vi.fn()

      emitter.once('cacheHit', once)
      emitter.on('cacheHit', always)
      emitter.emit('cacheHit', 'key', 60)
      emitter.emit('cacheHit', 'key', 60)

      expect(once).toHaveBeenCalledTimes(1)
      expect(always).toHaveBeenCalledTimes(2)
    })

    it('can be removed with off() before it fires', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.once('cacheHit', handler)
      emitter.off('cacheHit', handler)
      emitter.emit('cacheHit', 'key', 60)

      expect(handler).not.toHaveBeenCalled()
    })

    it('passes all event arguments to the handler', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()

      emitter.once('rateLimited', handler)
      emitter.emit('rateLimited', 'search', 5000)

      expect(handler).toHaveBeenCalledWith('search', 5000)
    })
  })

  // ─── emit with no handlers ────────────────────────────────────────────────

  describe('emit with no handlers', () => {
    it('does not throw when no handler is registered for the event', () => {
      const emitter = new MusicKitEmitter()
      expect(() => emitter.emit('cacheHit', 'key', 60)).not.toThrow()
    })
  })

  // ─── all SDK events ───────────────────────────────────────────────────────

  describe('all defined SDK events fire correctly', () => {
    it('beforeRequest fires with the request object', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()
      emitter.on('beforeRequest', handler)

      const req = { method: 'POST', endpoint: 'search', headers: {}, body: {} }
      emitter.emit('beforeRequest', req)

      expect(handler).toHaveBeenCalledWith(req)
    })

    it('afterRequest fires with request, durationMs, and status', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()
      emitter.on('afterRequest', handler)

      const req = { method: 'POST', endpoint: 'search', headers: {}, body: {} }
      emitter.emit('afterRequest', req, 142, 200)

      expect(handler).toHaveBeenCalledWith(req, 142, 200)
    })

    it('visitorIdRefreshed fires with old and new IDs', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()
      emitter.on('visitorIdRefreshed', handler)

      emitter.emit('visitorIdRefreshed', 'old-id-xyz', 'new-id-abc')

      expect(handler).toHaveBeenCalledWith('old-id-xyz', 'new-id-abc')
    })

    it('retry fires with endpoint, attempt number, and reason', () => {
      const emitter = new MusicKitEmitter()
      const handler = vi.fn()
      emitter.on('retry', handler)

      emitter.emit('retry', 'stream', 2, 'network error')

      expect(handler).toHaveBeenCalledWith('stream', 2, 'network error')
    })
  })
})
