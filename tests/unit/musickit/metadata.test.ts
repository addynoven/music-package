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

  it('resolves a YouTube Music URL before routing', async () => {
    const mk = new MusicKit()
    await mk.getMetadata('https://music.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(mockDiscovery.getInfo).toHaveBeenCalledWith('dQw4w9WgXcQ')
  })
})
