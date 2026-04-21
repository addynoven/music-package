import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong } from '../../helpers/mock-factory'

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

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockDiscovery = {
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
  getInfo: vi.fn().mockResolvedValue(makeSong()),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue(makeSong({ videoId: 'jio:abc123', title: 'Tum Hi Ho' })),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getMetadata', () => {
  it('returns a Song object for a YouTube video ID', async () => {
    const mk = new MusicKit()
    const song = await mk.getMetadata('dQw4w9WgXcQ')
    expect(song.type).toBe('song')
    expect(song.videoId).toBe('dQw4w9WgXcQ')
  })

  it('delegates YouTube IDs to DiscoveryClient.getInfo', async () => {
    const mk = new MusicKit()
    await mk.getMetadata('dQw4w9WgXcQ')
    expect(mockDiscovery.getInfo).toHaveBeenCalledWith('dQw4w9WgXcQ')
  })

  it('delegates jio: IDs to JioSaavn source getMetadata', async () => {
    const mk = new MusicKit()
    await mk.getMetadata('jio:abc123')
    expect(mockJioSaavnSource.getMetadata).toHaveBeenCalledWith('jio:abc123')
  })

  it('returns the Song from the JioSaavn source for jio: IDs', async () => {
    const mk = new MusicKit()
    const song = await mk.getMetadata('jio:abc123')
    expect(song.title).toBe('Tum Hi Ho')
  })

  it('resolves a JioSaavn URL before routing', async () => {
    const mk = new MusicKit()
    await mk.getMetadata('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
    expect(mockJioSaavnSource.getMetadata).toHaveBeenCalledWith('jio:OQMaey5hbVc')
  })
})
