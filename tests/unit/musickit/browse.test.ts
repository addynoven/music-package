import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong, makeAlbum, makeArtist, makeSection } from '../../helpers/mock-factory'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { DiscoveryClient } from '../../../src/discovery'

const mockDiscovery = {
  getHome: vi.fn(),
  getArtist: vi.fn(),
  getAlbum: vi.fn(),
  getRadio: vi.fn(),
  getRelated: vi.fn(),
  getCharts: vi.fn(),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

describe('MusicKit — browse', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  // ─── getHome() ────────────────────────────────────────────────────────────

  describe('getHome()', () => {
    it('returns an array of Sections', async () => {
      const sections = [makeSection({ title: 'Quick picks' }), makeSection({ title: 'Trending' })]
      mockDiscovery.getHome.mockResolvedValue(sections)

      const result = await mk.getHome()

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('each section has a title and items array', async () => {
      mockDiscovery.getHome.mockResolvedValue([makeSection()])

      const [section] = await mk.getHome()

      expect(section).toHaveProperty('title')
      expect(section).toHaveProperty('items')
      expect(Array.isArray(section.items)).toBe(true)
    })
  })

  // ─── getArtist() ──────────────────────────────────────────────────────────

  describe('getArtist()', () => {
    it('returns an Artist object', async () => {
      const artist = makeArtist()
      mockDiscovery.getArtist.mockResolvedValue(artist)

      const result = await mk.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')

      expect(result.type).toBe('artist')
      expect(result.channelId).toBeTruthy()
      expect(result.name).toBeTruthy()
    })

    it('passes the channelId to DiscoveryClient', async () => {
      mockDiscovery.getArtist.mockResolvedValue(makeArtist())

      await mk.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')

      expect(mockDiscovery.getArtist).toHaveBeenCalledWith('UCiMhD4jzUqG-IgPzUmmytRQ')
    })

    it('artist has songs, albums, and singles arrays', async () => {
      const artist = makeArtist({
        songs: [makeSong()],
        albums: [makeAlbum()],
        singles: [],
      })
      mockDiscovery.getArtist.mockResolvedValue(artist)

      const result = await mk.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')

      expect(Array.isArray(result.songs)).toBe(true)
      expect(Array.isArray(result.albums)).toBe(true)
      expect(Array.isArray(result.singles)).toBe(true)
    })
  })

  // ─── getAlbum() ───────────────────────────────────────────────────────────

  describe('getAlbum()', () => {
    it('returns an Album object with tracks', async () => {
      const album = makeAlbum({ tracks: [makeSong(), makeSong()] })
      mockDiscovery.getAlbum.mockResolvedValue(album)

      const result = await mk.getAlbum('MPREb_4pL8gzRtw1v')

      expect(result.type).toBe('album')
      expect(result.browseId).toBeTruthy()
      expect(Array.isArray(result.tracks)).toBe(true)
    })

    it('passes the browseId to DiscoveryClient', async () => {
      mockDiscovery.getAlbum.mockResolvedValue(makeAlbum())

      await mk.getAlbum('MPREb_4pL8gzRtw1v')

      expect(mockDiscovery.getAlbum).toHaveBeenCalledWith('MPREb_4pL8gzRtw1v')
    })
  })

  // ─── getRadio() ───────────────────────────────────────────────────────────

  describe('getRadio()', () => {
    it('returns an array of Songs', async () => {
      const songs = [makeSong(), makeSong({ videoId: 'HgzGwKwLmgM', title: "Don't Stop Me Now" })]
      mockDiscovery.getRadio.mockResolvedValue(songs)

      const result = await mk.getRadio('fJ9rUzIMcZQ')

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].type).toBe('song')
    })

    it('passes the seed videoId to DiscoveryClient', async () => {
      mockDiscovery.getRadio.mockResolvedValue([])

      await mk.getRadio('fJ9rUzIMcZQ')

      expect(mockDiscovery.getRadio).toHaveBeenCalledWith('fJ9rUzIMcZQ')
    })
  })

  // ─── getRelated() ─────────────────────────────────────────────────────────

  describe('getRelated()', () => {
    it('returns an array of Songs', async () => {
      mockDiscovery.getRelated.mockResolvedValue([makeSong()])

      const result = await mk.getRelated('fJ9rUzIMcZQ')

      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ─── getCharts() ──────────────────────────────────────────────────────────

  describe('getCharts()', () => {
    it('returns an array of Sections', async () => {
      mockDiscovery.getCharts.mockResolvedValue([makeSection({ title: 'Top songs' })])

      const result = await mk.getCharts({ country: 'US' })

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].title).toBeTruthy()
    })

    it('passes the country option to DiscoveryClient', async () => {
      mockDiscovery.getCharts.mockResolvedValue([])

      await mk.getCharts({ country: 'JP' })

      expect(mockDiscovery.getCharts).toHaveBeenCalledWith({ country: 'JP' })
    })

    it('works without a country option', async () => {
      mockDiscovery.getCharts.mockResolvedValue([])

      await expect(mk.getCharts()).resolves.not.toThrow()
    })
  })
})
