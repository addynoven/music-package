import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { RetryEngine } from '../../../src/retry'
import { DiscoveryClient } from '../../../src/discovery'
import { JioSaavnSource } from '../../../src/sources/jiosaavn'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))
;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}))

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:') || !/youtube|youtu\.be|^[A-Za-z0-9_-]{11}$/.test(q)),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
  getLyrics: vi.fn().mockResolvedValue('Tum hi ho, aashiqui ab tum hi ho'),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getLyrics', () => {
  it('returns lyrics string for a jio: ID', async () => {
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('jio:abc123')
    expect(typeof lyrics).toBe('string')
    expect(lyrics!.length).toBeGreaterThan(0)
  })

  it('delegates to JioSaavn source for jio: IDs', async () => {
    const mk = new MusicKit()
    await mk.getLyrics('jio:abc123')
    expect(mockJioSaavnSource.getLyrics).toHaveBeenCalledWith('jio:abc123')
  })

  it('resolves JioSaavn URL before fetching lyrics', async () => {
    const mk = new MusicKit()
    await mk.getLyrics('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
    expect(mockJioSaavnSource.getLyrics).toHaveBeenCalledWith('jio:OQMaey5hbVc')
  })

  it('returns null for a YouTube ID (no lyrics API)', async () => {
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('fJ9rUzIMcZQ')
    expect(lyrics).toBeNull()
  })

  it('returns null when source has no getLyrics method', async () => {
    const sourceWithoutLyrics = { ...mockJioSaavnSource, getLyrics: undefined }
    vi.mocked(JioSaavnSource).mockImplementationOnce(() => sourceWithoutLyrics as any)
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('jio:abc123')
    expect(lyrics).toBeNull()
  })
})
