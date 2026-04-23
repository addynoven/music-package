import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData } from '../../helpers/mock-factory'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { RetryEngine } from '../../../src/retry'
import { StreamResolver } from '../../../src/stream'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

;(StreamResolver as any).mockImplementation(() => ({
  resolve: vi.fn(),
}))

const mockJioSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSource),
  JIOSAAVN_LANGUAGES: new Set(['hindi', 'english']),
}))

function makeMockProcess() {
  const stdout = new Readable({ read() {} })
  return {
    stdout,
    stderr: { resume: vi.fn() },
  }
}

describe('MusicKit — streamAudio()', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ─── YouTube IDs ──────────────────────────────────────────────────────────

  describe('YouTube IDs', () => {
    it('returns a ReadableStream (has .pipe)', async () => {
      ;(spawn as any).mockReturnValue(makeMockProcess())

      const result = await mk.streamAudio('dQw4w9WgXcQ')

      expect(result).toBeDefined()
      expect(typeof (result as any).pipe).toBe('function')
    })

    it('spawns yt-dlp with -o - to pipe audio to stdout', async () => {
      ;(spawn as any).mockReturnValue(makeMockProcess())

      await mk.streamAudio('dQw4w9WgXcQ')

      expect(spawn).toHaveBeenCalledWith(
        'yt-dlp',
        expect.arrayContaining(['-o', '-']),
      )
    })

    it('passes the videoId in the yt-dlp URL argument', async () => {
      ;(spawn as any).mockReturnValue(makeMockProcess())

      await mk.streamAudio('dQw4w9WgXcQ')

      const args: string[] = (spawn as any).mock.calls[0][1]
      expect(args.some((a: string) => a.includes('dQw4w9WgXcQ'))).toBe(true)
    })

    it('does NOT call StreamResolver — bypasses the broken decipher URL path', async () => {
      const mockResolver = { resolve: vi.fn() }
      ;(StreamResolver as any).mockImplementation(() => mockResolver)
      ;(spawn as any).mockReturnValue(makeMockProcess())

      await mk.streamAudio('dQw4w9WgXcQ')

      expect(mockResolver.resolve).not.toHaveBeenCalled()
    })

    it('does NOT call fetch for YouTube IDs', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      ;(spawn as any).mockReturnValue(makeMockProcess())

      await mk.streamAudio('dQw4w9WgXcQ')

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  // ─── JioSaavn IDs ─────────────────────────────────────────────────────────

  describe('JioSaavn IDs', () => {
    it('returns a ReadableStream for a jio: ID', async () => {
      const jioStream = makeStreamingData({ url: 'https://cdn.jiosaavn.com/audio/test.mp4' })
      mockJioSource.getStream.mockResolvedValue(jioStream)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({ start(c) { c.close() } }),
      }))

      const result = await mk.streamAudio('jio:12345')

      expect(result).toBeDefined()
      expect(typeof (result as any).pipe).toBe('function')
    })

    it('fetches the CDN URL returned by getStream', async () => {
      const cdnUrl = 'https://cdn.jiosaavn.com/audio/test.mp4'
      const jioStream = makeStreamingData({ url: cdnUrl })
      mockJioSource.getStream.mockResolvedValue(jioStream)
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({ start(c) { c.close() } }),
      })
      vi.stubGlobal('fetch', fetchMock)

      await mk.streamAudio('jio:12345')

      expect(fetchMock.mock.calls[0][0]).toBe(cdnUrl)
    })

    it('does NOT spawn yt-dlp for JioSaavn IDs', async () => {
      const jioStream = makeStreamingData({ url: 'https://cdn.jiosaavn.com/audio/test.mp4' })
      mockJioSource.getStream.mockResolvedValue(jioStream)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({ start(c) { c.close() } }),
      }))

      await mk.streamAudio('jio:12345')

      expect(spawn).not.toHaveBeenCalled()
    })

    it('throws when the JioSaavn CDN fetch returns a non-2xx status', async () => {
      const jioStream = makeStreamingData({ url: 'https://cdn.jiosaavn.com/audio/test.mp4' })
      mockJioSource.getStream.mockResolvedValue(jioStream)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

      await expect(mk.streamAudio('jio:12345')).rejects.toThrow()
    })
  })
})
