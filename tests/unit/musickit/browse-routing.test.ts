import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import type { Album, Artist, Playlist, Song, Section } from '../../../src/models'

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { DiscoveryClient } from '../../../src/discovery'
import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

function makeSong(overrides: Partial<Song> = {}): Song {
  return { type: 'song', videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley', duration: 213, thumbnails: [], ...overrides }
}
function makeAlbum(overrides: Partial<Album> = {}): Album {
  return { type: 'album', browseId: 'MPREb_xxx', title: 'Some Album', artist: 'Some Artist', thumbnails: [], tracks: [], ...overrides }
}
function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return { type: 'artist', channelId: 'UCxxx', name: 'Some Artist', thumbnails: [], songs: [], albums: [], singles: [], ...overrides }
}
function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return { type: 'playlist', playlistId: 'PLtest', title: 'Top Hits', thumbnails: [], songs: [], ...overrides }
}
function makeSection(): Section {
  return { title: 'Trending', items: [makeSong()] }
}

const mockDiscovery = {
  getHome: vi.fn().mockResolvedValue([makeSection()]),
  getArtist: vi.fn().mockResolvedValue(makeArtist()),
  getAlbum: vi.fn().mockResolvedValue(makeAlbum()),
  getPlaylist: vi.fn().mockResolvedValue(makePlaylist()),
  getRadio: vi.fn().mockResolvedValue([makeSong()]),
  getRelated: vi.fn().mockResolvedValue([]),
  getCharts: vi.fn().mockResolvedValue([]),
}
;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

// ─── tests ────────────────────────────────────────────────────────────────────

describe('MusicKit — browse routing (YouTube)', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  // ─── getAlbum routing ─────────────────────────────────────────────────────

  describe('getAlbum()', () => {
    it('routes YouTube browse ID to DiscoveryClient.getAlbum', async () => {
      const result = await mk.getAlbum('MPREb_4pL8gzRtw1v')
      expect(mockDiscovery.getAlbum).toHaveBeenCalledWith('MPREb_4pL8gzRtw1v')
      expect(result.type).toBe('album')
    })
  })

  // ─── getArtist routing ────────────────────────────────────────────────────

  describe('getArtist()', () => {
    it('routes YouTube channel ID to DiscoveryClient.getArtist', async () => {
      const result = await mk.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')
      expect(mockDiscovery.getArtist).toHaveBeenCalledWith('UCiMhD4jzUqG-IgPzUmmytRQ')
      expect(result.type).toBe('artist')
    })
  })

  // ─── getRadio routing ─────────────────────────────────────────────────────

  describe('getRadio()', () => {
    it('routes YouTube video ID to DiscoveryClient.getRadio', async () => {
      const result = await mk.getRadio('dQw4w9WgXcQ')
      expect(mockDiscovery.getRadio).toHaveBeenCalledWith('dQw4w9WgXcQ')
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ─── getPlaylist ──────────────────────────────────────────────────────────

  describe('getPlaylist()', () => {
    it('routes YouTube playlist ID to DiscoveryClient.getPlaylist', async () => {
      const result = await mk.getPlaylist('PLtest123')
      expect(mockDiscovery.getPlaylist).toHaveBeenCalledWith('PLtest123')
      expect(result.type).toBe('playlist')
    })
  })

  // ─── getHome routing ──────────────────────────────────────────────────────

  describe('getHome()', () => {
    it('routes to DiscoveryClient.getHome', async () => {
      const result = await mk.getHome()
      expect(mockDiscovery.getHome).toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })

    it('resolves a YouTube Music browse URL before routing', async () => {
      await mk.getAlbum('https://music.youtube.com/browse/MPREb_WNGQWp5czjD')
      expect(mockDiscovery.getAlbum).toHaveBeenCalledWith('MPREb_WNGQWp5czjD')
    })
  })
})
