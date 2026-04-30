import { describe, it, expect, vi } from 'vitest'
import { tryClients, STREAM_CLIENT_FALLBACK_ORDER } from '../../../src/stream/multi-client.js'
import type { StreamClient, TryClientsResult } from '../../../src/stream/multi-client.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeClients(...names: StreamClient[]): readonly StreamClient[] {
  return names
}

// ─── STREAM_CLIENT_FALLBACK_ORDER ─────────────────────────────────────────────

describe('STREAM_CLIENT_FALLBACK_ORDER', () => {
  it('starts with YTMUSIC', () => {
    expect(STREAM_CLIENT_FALLBACK_ORDER[0]).toBe('YTMUSIC')
  })

  it('contains exactly three clients', () => {
    expect(STREAM_CLIENT_FALLBACK_ORDER).toHaveLength(3)
  })
})

// ─── tryClients ───────────────────────────────────────────────────────────────

describe('tryClients', () => {
  // ─── success on first client ────────────────────────────────────────────────

  describe('first client succeeds', () => {
    it('returns immediately with the result', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('hit')
      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5'), fn)

      expect(res).not.toBeNull()
      expect((res as TryClientsResult<string>).result).toBe('hit')
    })

    it('sets clientUsed to the first client', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('hit')
      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      expect((res as TryClientsResult<string>).clientUsed).toBe('YTMUSIC')
    })

    it('returns errors: [] when the first client succeeds', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('hit')
      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      expect((res as TryClientsResult<string>).errors).toEqual([])
    })

    it('does not call fn for subsequent clients', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('hit')
      await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5'), fn)

      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  // ─── first throws, second succeeds ──────────────────────────────────────────

  describe('first throws, second succeeds', () => {
    it('returns the result from the second client', async () => {
      const err = new Error('unavailable')
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce('second-hit')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      expect((res as TryClientsResult<string>).result).toBe('second-hit')
    })

    it('sets clientUsed to the second client', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      expect((res as TryClientsResult<string>).clientUsed).toBe('ANDROID_VR')
    })

    it('records the first client in errors[0]', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      expect((res as TryClientsResult<string>).errors[0].client).toBe('YTMUSIC')
    })

    it('captures the thrown error in errors[0].error', async () => {
      const thrown = new Error('throttled')
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(thrown)
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      expect((res as TryClientsResult<string>).errors[0].error).toBe(thrown)
    })
  })

  // ─── all return null ─────────────────────────────────────────────────────────

  describe('all return null', () => {
    it('returns null when every client returns null', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue(null)
      const clients = makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5')

      const res = await tryClients<string>(clients, fn)

      expect(res).toBeNull()
    })

    it('errors length equals the number of clients tried', async () => {
      // We need to read the accumulated errors — we can capture them by making
      // the last fn call actually succeed so we get the result back.
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('last')

      const res = await tryClients<string>(
        makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5'),
        fn,
      )

      // two failures before the third succeeds
      expect((res as TryClientsResult<string>).errors).toHaveLength(2)
    })

    it('errors length matches client count when all fail via null', async () => {
      const clients = makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5')
      const callOrder: StreamClient[] = []
      const errorsCapture: { client: StreamClient; error: Error }[] = []

      // Intercept by wrapping: capture via the return path is impossible when
      // result is null, so we verify call count instead.
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue(null)
      await tryClients<string>(clients, fn)

      expect(fn).toHaveBeenCalledTimes(clients.length)
    })
  })

  // ─── all throw ────────────────────────────────────────────────────────────────

  describe('all throw', () => {
    it('returns null when every client throws', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValue(new Error('blocked'))

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5'), fn)

      expect(res).toBeNull()
    })

    it('records each thrown error in the errors array', async () => {
      const e1 = new Error('e1')
      const e2 = new Error('e2')
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(e1)
        .mockRejectedValueOnce(e2)
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5'), fn)

      const errors = (res as TryClientsResult<string>).errors
      expect(errors[0].error).toBe(e1)
      expect(errors[1].error).toBe(e2)
    })

    it('wraps non-Error throws in an Error instance', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce('string-rejection')
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      const err = (res as TryClientsResult<string>).errors[0].error
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain('string-rejection')
    })
  })

  // ─── null vs throw counted as separate failure modes ─────────────────────────

  describe('null and throw are both counted as failures (asserted separately)', () => {
    it('null counts as failure — recorded with "returned null" message', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      const errors = (res as TryClientsResult<string>).errors
      expect(errors).toHaveLength(1)
      expect(errors[0].error.message).toBe('returned null')
    })

    it('throw counts as failure — recorded with the thrown error', async () => {
      const thrown = new Error('network error')
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(thrown)
        .mockResolvedValueOnce('ok')

      const res = await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn)

      const errors = (res as TryClientsResult<string>).errors
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toBe(thrown)
      expect(errors[0].error.message).not.toBe('returned null')
    })
  })

  // ─── onAttempt callback ───────────────────────────────────────────────────────

  describe('onAttempt callback', () => {
    it('is called once per client before fn is called', async () => {
      const attemptOrder: StreamClient[] = []
      const fnOrder: StreamClient[] = []

      const fn = vi.fn<[StreamClient], Promise<string | null>>((c) => {
        fnOrder.push(c)
        return Promise.resolve(null)
      })

      await tryClients<string>(
        makeClients('YTMUSIC', 'ANDROID_VR', 'TVHTML5'),
        fn,
        {
          onAttempt: (c) => attemptOrder.push(c),
        },
      )

      expect(attemptOrder).toEqual(['YTMUSIC', 'ANDROID_VR', 'TVHTML5'])
    })

    it('onAttempt fires before fn for each client', async () => {
      const callLog: string[] = []

      const fn = vi.fn<[StreamClient], Promise<string | null>>((c) => {
        callLog.push(`fn:${c}`)
        return Promise.resolve(null)
      })

      await tryClients<string>(
        makeClients('YTMUSIC', 'ANDROID_VR'),
        fn,
        {
          onAttempt: (c) => callLog.push(`attempt:${c}`),
        },
      )

      expect(callLog).toEqual([
        'attempt:YTMUSIC',
        'fn:YTMUSIC',
        'attempt:ANDROID_VR',
        'fn:ANDROID_VR',
      ])
    })

    it('is called exactly once per client even when fn throws', async () => {
      const onAttempt = vi.fn()
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
        .mockRejectedValueOnce(new Error('err'))
        .mockResolvedValueOnce('ok')

      await tryClients<string>(makeClients('YTMUSIC', 'ANDROID_VR'), fn, { onAttempt })

      expect(onAttempt).toHaveBeenCalledTimes(2)
    })

    it('works fine when onAttempt is not provided', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('ok')
      const res = await tryClients<string>(makeClients('YTMUSIC'), fn)

      expect((res as TryClientsResult<string>).result).toBe('ok')
    })

    it('works fine when options is undefined', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('ok')
      const res = await tryClients<string>(makeClients('YTMUSIC'), fn, undefined)

      expect((res as TryClientsResult<string>).result).toBe('ok')
    })
  })

  // ─── edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns null for an empty clients array', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>()
      const res = await tryClients<string>([], fn)

      expect(res).toBeNull()
      expect(fn).not.toHaveBeenCalled()
    })

    it('returns result with empty errors when single client succeeds', async () => {
      const fn = vi.fn<[StreamClient], Promise<string | null>>().mockResolvedValue('solo')
      const res = await tryClients<string>(makeClients('WEB_REMIX'), fn)

      expect((res as TryClientsResult<string>).result).toBe('solo')
      expect((res as TryClientsResult<string>).clientUsed).toBe('WEB_REMIX')
      expect((res as TryClientsResult<string>).errors).toEqual([])
    })
  })
})
