import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong, makePlaylist } from '../../helpers/mock-factory'

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

const ytPlaylist = makePlaylist({ playlistId: 'PLtest123', title: 'My YouTube Playlist' })

const mockDiscovery = {
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
  getPlaylist: vi.fn().mockResolvedValue(ytPlaylist),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)


beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getPlaylist() YouTube support', () => {
  it('returns a Playlist for a YouTube playlist ID', async () => {
    const mk = new MusicKit()
    const playlist = await mk.getPlaylist('PLtest123')
    expect(playlist.type).toBe('playlist')
    expect(playlist.playlistId).toBe('PLtest123')
  })

  it('delegates YouTube playlist IDs to DiscoveryClient.getPlaylist', async () => {
    const mk = new MusicKit()
    await mk.getPlaylist('PLtest123')
    expect(mockDiscovery.getPlaylist).toHaveBeenCalledWith('PLtest123')
  })

  it('returns playlist title from YouTube', async () => {
    const mk = new MusicKit()
    const playlist = await mk.getPlaylist('PLtest123')
    expect(playlist.title).toBe('My YouTube Playlist')
  })

  it('resolves a YouTube Music playlist URL before routing', async () => {
    const mk = new MusicKit()
    await mk.getPlaylist('https://music.youtube.com/playlist?list=PLtest123')
    expect(mockDiscovery.getPlaylist).toHaveBeenCalledWith('PLtest123')
  })
})
