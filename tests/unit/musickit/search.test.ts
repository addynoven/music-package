import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong, makeAlbum, makeArtist } from '../../helpers/mock-factory'

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

const mockDiscovery = {
  autocomplete: vi.fn(),
  search: vi.fn(),
  getHome: vi.fn(),
  getArtist: vi.fn(),
  getAlbum: vi.fn(),
  getRadio: vi.fn(),
  getRelated: vi.fn(),
  getCharts: vi.fn(),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

describe('MusicKit — search & autocomplete', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  // ─── autocomplete ─────────────────────────────────────────────────────────

  describe('autocomplete()', () => {
    it('returns an array of strings', async () => {
      mockDiscovery.autocomplete.mockResolvedValue(['never gonna give you up', 'never gonna let you down'])

      const result = await mk.autocomplete('never gonna')

      expect(result).toEqual(['never gonna give you up', 'never gonna let you down'])
    })

    it('passes the query through to DiscoveryClient', async () => {
      mockDiscovery.autocomplete.mockResolvedValue([])

      await mk.autocomplete('bohemian')

      expect(mockDiscovery.autocomplete).toHaveBeenCalledWith('bohemian')
    })

    it('returns an empty array when there are no suggestions', async () => {
      mockDiscovery.autocomplete.mockResolvedValue([])

      expect(await mk.autocomplete('xyzzy')).toEqual([])
    })
  })

  // ─── search() — mixed results ─────────────────────────────────────────────

  describe('search() — no filter', () => {
    it('returns a SearchResults object with songs, albums, artists, playlists', async () => {
      const mockResults = {
        songs: [makeSong()],
        albums: [makeAlbum()],
        artists: [makeArtist()],
        playlists: [],
      }
      mockDiscovery.search.mockResolvedValue(mockResults)

      const results = await mk.search('queen')

      expect(results).toHaveProperty('songs')
      expect(results).toHaveProperty('albums')
      expect(results).toHaveProperty('artists')
      expect(results).toHaveProperty('playlists')
    })

    it('passes the query to DiscoveryClient', async () => {
      mockDiscovery.search.mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] })

      await mk.search('queen')

      expect(mockDiscovery.search).toHaveBeenCalledWith('queen', expect.anything())
    })
  })

  // ─── search() — filtered ──────────────────────────────────────────────────

  describe('search() — with filter', () => {
    it('returns Song[] when filter is "songs"', async () => {
      const songs = [makeSong()]
      mockDiscovery.search.mockResolvedValue(songs)

      const result = await mk.search('queen', { filter: 'songs' })

      expect(Array.isArray(result)).toBe(true)
      if (Array.isArray(result)) {
        expect(result[0].type).toBe('song')
      }
    })

    it('returns Album[] when filter is "albums"', async () => {
      const albums = [makeAlbum()]
      mockDiscovery.search.mockResolvedValue(albums)

      const result = await mk.search('queen', { filter: 'albums' })

      expect(Array.isArray(result)).toBe(true)
      if (Array.isArray(result)) {
        expect(result[0].type).toBe('album')
      }
    })

    it('passes the filter option to DiscoveryClient', async () => {
      mockDiscovery.search.mockResolvedValue([])

      await mk.search('queen', { filter: 'songs' })

      expect(mockDiscovery.search).toHaveBeenCalledWith('queen', { filter: 'songs' })
    })
  })

  // ─── search result shape ──────────────────────────────────────────────────

  describe('song result shape', () => {
    it('each song has the required fields', async () => {
      const song = makeSong()
      mockDiscovery.search.mockResolvedValue([song])

      const result = await mk.search('test', { filter: 'songs' }) as typeof song[]

      expect(result[0]).toMatchObject({
        type: 'song',
        videoId: expect.any(String),
        title: expect.any(String),
        artist: expect.any(String),
        duration: expect.any(Number),
        thumbnails: expect.any(Array),
      })
    })
  })
})
