import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'
import { MusicKit } from '../../../src/musickit'

vi.mock('youtubei.js', () => ({
  Innertube: { create: vi.fn().mockResolvedValue({}) },
  ClientType: {
    WEB: 'WEB', MWEB: 'MWEB', KIDS: 'WEB_KIDS', MUSIC: 'WEB_REMIX',
    IOS: 'iOS', ANDROID: 'ANDROID', ANDROID_VR: 'ANDROID_VR',
    ANDROID_MUSIC: 'ANDROID_MUSIC', ANDROID_CREATOR: 'ANDROID_CREATOR',
    TV: 'TVHTML5', TV_SIMPLY: 'TVHTML5_SIMPLY',
    TV_EMBEDDED: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    WEB_EMBEDDED: 'WEB_EMBEDDED_PLAYER', WEB_CREATOR: 'WEB_CREATOR',
  },
}))
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

  it('does NOT call fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    ;(spawn as any).mockReturnValue(makeMockProcess())

    await mk.streamAudio('dQw4w9WgXcQ')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves YouTube URL before streaming', async () => {
    ;(spawn as any).mockReturnValue(makeMockProcess())

    await mk.streamAudio('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

    const args: string[] = (spawn as any).mock.calls[0][1]
    expect(args.some((a: string) => a.includes('dQw4w9WgXcQ'))).toBe(true)
  })
})
