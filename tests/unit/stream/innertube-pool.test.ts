import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock youtubei.js ─────────────────────────────────────────────────────────
//
// vi.mock is hoisted to the top of the file, so we cannot reference variables
// declared with const/let in the factory. Instead we define the mock inline
// and retrieve the spy via vi.mocked() after import.

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: vi.fn(),
  },
  ClientType: {
    WEB: 'WEB',
    MWEB: 'MWEB',
    KIDS: 'WEB_KIDS',
    MUSIC: 'WEB_REMIX',
    IOS: 'iOS',
    ANDROID: 'ANDROID',
    ANDROID_VR: 'ANDROID_VR',
    ANDROID_MUSIC: 'ANDROID_MUSIC',
    ANDROID_CREATOR: 'ANDROID_CREATOR',
    TV: 'TVHTML5',
    TV_SIMPLY: 'TVHTML5_SIMPLY',
    TV_EMBEDDED: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    WEB_EMBEDDED: 'WEB_EMBEDDED_PLAYER',
    WEB_CREATOR: 'WEB_CREATOR',
  },
}))

// Import AFTER mocks are set up
import { Innertube } from 'youtubei.js'
import { InnertubePool } from '../../../src/stream/innertube-pool.js'

// Retrieve the mock spy for Innertube.create
const mockCreate = vi.mocked(Innertube.create)

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeFakeInnertube(id: string = 'default'): object {
  return { _id: id }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('InnertubePool', () => {

  // ── single get creates one instance ─────────────────────────────────────────

  describe('get()', () => {
    it('creates one Innertube instance on first call', async () => {
      const fake = makeFakeInnertube('avr-1')
      mockCreate.mockResolvedValueOnce(fake)

      const pool = new InnertubePool()
      const result = await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(result).toBe(fake)
    })

    it('returns the same instance on a second call (no re-create)', async () => {
      const fake = makeFakeInnertube('avr-2')
      mockCreate.mockResolvedValueOnce(fake)

      const pool = new InnertubePool()
      const first = await pool.get('ANDROID_VR')
      const second = await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(first).toBe(fake)
      expect(second).toBe(fake)
    })

    it('passes client_type ANDROID_VR to Innertube.create', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ client_type: 'ANDROID_VR' }),
      )
    })

    it('passes client_type WEB_REMIX for YTMUSIC', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('YTMUSIC')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ client_type: 'WEB_REMIX' }),
      )
    })

    it('passes client_type WEB_REMIX for WEB_REMIX', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('WEB_REMIX')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ client_type: 'WEB_REMIX' }),
      )
    })

    it('passes client_type TVHTML5 for TVHTML5', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('TVHTML5')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ client_type: 'TVHTML5' }),
      )
    })

    it('always passes generate_session_locally: true', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ generate_session_locally: true }),
      )
    })

    it('YTMUSIC and ANDROID_VR create separate instances', async () => {
      const fakeMusic = makeFakeInnertube('music')
      const fakeVR = makeFakeInnertube('vr')
      mockCreate
        .mockResolvedValueOnce(fakeMusic)
        .mockResolvedValueOnce(fakeVR)

      const pool = new InnertubePool()
      const music = await pool.get('YTMUSIC')
      const vr = await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledTimes(2)
      expect(music).toBe(fakeMusic)
      expect(vr).toBe(fakeVR)
    })
  })

  // ── concurrent gets share one in-flight create ────────────────────────────────

  describe('concurrent get() calls', () => {
    it('two concurrent get calls for the same client share one create promise', async () => {
      const fake = makeFakeInnertube('concurrent')
      // Resolve only once; if create were called twice we'd get undefined for the 2nd
      mockCreate.mockResolvedValueOnce(fake)

      const pool = new InnertubePool()
      const [r1, r2] = await Promise.all([
        pool.get('ANDROID_VR'),
        pool.get('ANDROID_VR'),
      ])

      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(r1).toBe(fake)
      expect(r2).toBe(fake)
    })
  })

  // ── has() ────────────────────────────────────────────────────────────────────

  describe('has()', () => {
    it('returns false before get is called', () => {
      const pool = new InnertubePool()
      expect(pool.has('ANDROID_VR')).toBe(false)
    })

    it('returns true immediately after get is called (even before resolved)', () => {
      // Don't await — has() should reflect the pending promise
      mockCreate.mockReturnValueOnce(new Promise(() => { /* never resolves in this test */ }))

      const pool = new InnertubePool()
      void pool.get('ANDROID_VR')

      expect(pool.has('ANDROID_VR')).toBe(true)
    })

    it('returns true after get resolves', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')

      expect(pool.has('ANDROID_VR')).toBe(true)
    })

    it('returns false for a client not yet loaded while another is loaded', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')

      expect(pool.has('TVHTML5')).toBe(false)
    })
  })

  // ── clients() ────────────────────────────────────────────────────────────────

  describe('clients()', () => {
    it('returns empty array before any get call', () => {
      const pool = new InnertubePool()
      expect(pool.clients()).toEqual([])
    })

    it('returns the loaded client types after gets', async () => {
      mockCreate
        .mockResolvedValueOnce(makeFakeInnertube('m'))
        .mockResolvedValueOnce(makeFakeInnertube('v'))

      const pool = new InnertubePool()
      await pool.get('YTMUSIC')
      await pool.get('ANDROID_VR')

      const loaded = pool.clients()
      expect(loaded).toHaveLength(2)
      expect(loaded).toContain('YTMUSIC')
      expect(loaded).toContain('ANDROID_VR')
    })

    it('does not duplicate entries for repeated gets', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')
      await pool.get('ANDROID_VR')

      expect(pool.clients()).toHaveLength(1)
    })
  })

  // ── close() ───────────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('clears the cache — clients() returns empty', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')
      await pool.close()

      expect(pool.clients()).toEqual([])
    })

    it('has() returns false after close', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')
      await pool.close()

      expect(pool.has('ANDROID_VR')).toBe(false)
    })

    it('subsequent get re-creates the instance after close', async () => {
      const first = makeFakeInnertube('first')
      const second = makeFakeInnertube('second')
      mockCreate
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)

      const pool = new InnertubePool()
      const a = await pool.get('ANDROID_VR')
      await pool.close()
      const b = await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledTimes(2)
      expect(a).toBe(first)
      expect(b).toBe(second)
    })
  })

  // ── options passthrough ───────────────────────────────────────────────────────

  describe('options passthrough to Innertube.create', () => {
    it('passes cookie when provided', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool({ cookie: 'SID=abc123' })
      await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ cookie: 'SID=abc123' }),
      )
    })

    it('passes lang when provided', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool({ lang: 'ja' })
      await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ lang: 'ja' }),
      )
    })

    it('passes location when provided', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool({ location: 'JP' })
      await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'JP' }),
      )
    })

    it('passes a custom fetch function when provided', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const customFetch = vi.fn() as unknown as typeof globalThis.fetch
      const pool = new InnertubePool({ fetch: customFetch })
      await pool.get('ANDROID_VR')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ fetch: customFetch }),
      )
    })

    it('does NOT pass poToken to Innertube.create', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool({ poToken: 'tok_xyz' })
      await pool.get('ANDROID_VR')

      const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).not.toHaveProperty('po_token')
      expect(callArg).not.toHaveProperty('poToken')
    })

    it('does not include undefined optional fields in create call', async () => {
      mockCreate.mockResolvedValueOnce(makeFakeInnertube())

      const pool = new InnertubePool()
      await pool.get('ANDROID_VR')

      const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>
      expect(callArg).not.toHaveProperty('cookie')
      expect(callArg).not.toHaveProperty('lang')
      expect(callArg).not.toHaveProperty('location')
      expect(callArg).not.toHaveProperty('fetch')
    })
  })
})
