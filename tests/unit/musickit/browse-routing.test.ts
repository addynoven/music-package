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
  return { type: 'song', videoId: 'jio:abc12345', title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 252, thumbnails: [], ...overrides }
}
function makeAlbum(overrides: Partial<Album> = {}): Album {
  return { type: 'album', browseId: 'jio:alb12345', title: 'Aashiqui 2', artist: 'Arijit Singh', thumbnails: [], tracks: [], ...overrides }
}
function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return { type: 'artist', channelId: 'jio:art12345', name: 'Arijit Singh', thumbnails: [], songs: [], albums: [], singles: [], ...overrides }
}
function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return { type: 'playlist', playlistId: 'jio:pl12345', title: 'Top Hits', thumbnails: [], songs: [], ...overrides }
}
function makeSection(): Section {
  return { title: 'Trending', items: [makeSong()] }
}

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:') || (!q.includes('youtube.com') && !q.includes('youtu.be') && !/^[A-Za-z0-9_-]{11}$/.test(q))),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
  getAlbum: vi.fn().mockResolvedValue(makeAlbum()),
  getArtist: vi.fn().mockResolvedValue(makeArtist()),
  getPlaylist: vi.fn().mockResolvedValue(makePlaylist()),
  getRadio: vi.fn().mockResolvedValue([makeSong()]),
  getHome: vi.fn().mockResolvedValue([makeSection()]),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

const mockDiscovery = {
  getHome: vi.fn().mockResolvedValue([]),
  getArtist: vi.fn().mockResolvedValue(makeArtist({ channelId: 'UCxxx' })),
  getAlbum: vi.fn().mockResolvedValue(makeAlbum({ browseId: 'MPREb_xxx' })),
  getRadio: vi.fn().mockResolvedValue([]),
  getRelated: vi.fn().mockResolvedValue([]),
  getCharts: vi.fn().mockResolvedValue([]),
}
;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

// ─── tests ────────────────────────────────────────────────────────────────────

describe('MusicKit — browse routing (jio: IDs)', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    // reset per-test so canHandle logic works fresh
    mockJioSaavnSource.canHandle.mockImplementation((q: string) =>
      q.startsWith('jio:') || (!q.includes('youtube.com') && !q.includes('youtu.be') && !/^[A-Za-z0-9_-]{11}$/.test(q))
    )
    mk = new MusicKit({ logLevel: 'silent' })
  })

  // ─── getAlbum routing ─────────────────────────────────────────────────────

  describe('getAlbum()', () => {
    it('routes jio: browseId to JioSaavnSource.getAlbum', async () => {
      const result = await mk.getAlbum('jio:alb12345')
      expect(mockJioSaavnSource.getAlbum).toHaveBeenCalledWith('jio:alb12345')
      expect(mockDiscovery.getAlbum).not.toHaveBeenCalled()
      expect(result.type).toBe('album')
    })

    it('falls back to YouTube DiscoveryClient for non-jio: browseIds', async () => {
      await mk.getAlbum('MPREb_4pL8gzRtw1v')
      expect(mockDiscovery.getAlbum).toHaveBeenCalledWith('MPREb_4pL8gzRtw1v')
      expect(mockJioSaavnSource.getAlbum).not.toHaveBeenCalled()
    })
  })

  // ─── getArtist routing ────────────────────────────────────────────────────

  describe('getArtist()', () => {
    it('routes jio: channelId to JioSaavnSource.getArtist', async () => {
      const result = await mk.getArtist('jio:art12345')
      expect(mockJioSaavnSource.getArtist).toHaveBeenCalledWith('jio:art12345')
      expect(mockDiscovery.getArtist).not.toHaveBeenCalled()
      expect(result.type).toBe('artist')
    })

    it('falls back to YouTube DiscoveryClient for non-jio: channelIds', async () => {
      await mk.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')
      expect(mockDiscovery.getArtist).toHaveBeenCalledWith('UCiMhD4jzUqG-IgPzUmmytRQ')
      expect(mockJioSaavnSource.getArtist).not.toHaveBeenCalled()
    })
  })

  // ─── getRadio routing ─────────────────────────────────────────────────────

  describe('getRadio()', () => {
    it('routes jio: videoId to JioSaavnSource.getRadio', async () => {
      const result = await mk.getRadio('jio:abc12345')
      expect(mockJioSaavnSource.getRadio).toHaveBeenCalledWith('jio:abc12345')
      expect(mockDiscovery.getRadio).not.toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })

    it('falls back to YouTube DiscoveryClient for non-jio: videoIds', async () => {
      await mk.getRadio('dQw4w9WgXcQ')
      expect(mockDiscovery.getRadio).toHaveBeenCalledWith('dQw4w9WgXcQ')
      expect(mockJioSaavnSource.getRadio).not.toHaveBeenCalled()
    })
  })

  // ─── getPlaylist ──────────────────────────────────────────────────────────

  describe('getPlaylist()', () => {
    it('routes jio: playlistId to JioSaavnSource.getPlaylist', async () => {
      const result = await mk.getPlaylist('jio:pl12345')
      expect(mockJioSaavnSource.getPlaylist).toHaveBeenCalledWith('jio:pl12345')
      expect(result.type).toBe('playlist')
      expect(Array.isArray(result.songs)).toBe(true)
    })

    it('throws for non-jio: playlistIds (no YouTube playlist support yet)', async () => {
      await expect(mk.getPlaylist('PLsome_youtube_id')).rejects.toThrow()
    })
  })

  // ─── getHome routing ──────────────────────────────────────────────────────

  describe('getHome()', () => {
    it('routes to JioSaavnSource.getHome when source has getHome', async () => {
      const result = await mk.getHome()
      expect(mockJioSaavnSource.getHome).toHaveBeenCalled()
      expect(mockDiscovery.getHome).not.toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })

    it('falls back to YouTube DiscoveryClient when no source has getHome', async () => {
      const mk2 = new MusicKit({ logLevel: 'silent' })
      // manually register sources without getHome to bypass ensureClients auto-registration
      const noHomeSource = { name: 'nohome', canHandle: vi.fn().mockReturnValue(true), search: vi.fn(), getStream: vi.fn(), getMetadata: vi.fn() }
      mk2.registerSource(noHomeSource as any)
      mockDiscovery.getHome.mockResolvedValue([makeSection()])

      const result = await mk2.getHome()
      expect(mockDiscovery.getHome).toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
