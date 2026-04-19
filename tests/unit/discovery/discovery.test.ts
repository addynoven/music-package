import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DiscoveryClient } from '../../../src/discovery'

function makeYt() {
  return {
    music: {
      getSearchSuggestions: vi.fn(),
      search: vi.fn(),
      getHomeFeed: vi.fn(),
      getArtist: vi.fn(),
      getAlbum: vi.fn(),
      getUpNext: vi.fn(),
      getRelated: vi.fn(),
      getExplore: vi.fn(),
    },
  }
}

function makeSongItem(overrides: Record<string, any> = {}) {
  return {
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artists: [{ name: 'Rick Astley' }],
    duration: { seconds: 213 },
    item_type: 'song',
    thumbnail: { contents: [{ url: 'https://img.example.com/thumb.jpg', width: 226, height: 226 }] },
    ...overrides,
  }
}

function makeAlbumItem(overrides: Record<string, any> = {}) {
  return {
    id: 'MPREb_4pL8gzRtw1v',
    title: 'A Night at the Opera',
    artists: [{ name: 'Queen' }],
    year: '1975',
    item_type: 'album',
    thumbnail: { contents: [{ url: 'https://img.example.com/album.jpg', width: 226, height: 226 }] },
    ...overrides,
  }
}

function makeArtistItem(overrides: Record<string, any> = {}) {
  return {
    id: 'UCiMhD4jzUqG-IgPzUmmytRQ',
    name: 'Queen',
    item_type: 'artist',
    thumbnail: { contents: [{ url: 'https://img.example.com/artist.jpg', width: 226, height: 226 }] },
    ...overrides,
  }
}

describe('DiscoveryClient', () => {
  let mockYt: ReturnType<typeof makeYt>
  let client: DiscoveryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockYt = makeYt()
    client = new DiscoveryClient(mockYt as any)
  })

  describe('autocomplete', () => {
    it('returns an array of suggestion strings', async () => {
      mockYt.music.getSearchSuggestions.mockResolvedValue([
        { contents: [{ suggestion: { text: 'never gonna give you up' } }, { suggestion: { text: 'never gonna let you down' } }] },
      ])

      const suggestions = await client.autocomplete('never gonna')

      expect(suggestions).toEqual(['never gonna give you up', 'never gonna let you down'])
    })

    it('passes the query to the underlying library', async () => {
      mockYt.music.getSearchSuggestions.mockResolvedValue([])

      await client.autocomplete('queen')

      expect(mockYt.music.getSearchSuggestions).toHaveBeenCalledWith('queen')
    })

    it('returns an empty array when the library returns nothing', async () => {
      mockYt.music.getSearchSuggestions.mockResolvedValue([])

      const result = await client.autocomplete('xyzzy')

      expect(result).toEqual([])
    })
  })

  describe('search', () => {
    it('maps library results to our Song model', async () => {
      mockYt.music.search.mockResolvedValue({
        contents: [{ contents: [makeSongItem()] }],
      })

      const results = await client.search('never gonna') as any

      expect(results.songs).toHaveLength(1)
      expect(results.songs[0].videoId).toBe('dQw4w9WgXcQ')
      expect(results.songs[0].title).toBe('Never Gonna Give You Up')
      expect(results.songs[0].type).toBe('song')
    })

    it('returns filtered song results when filter is "songs"', async () => {
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [makeSongItem()] }] })

      const result = await client.search('queen', { filter: 'songs' })

      expect(mockYt.music.search).toHaveBeenCalledWith('queen', expect.objectContaining({ type: expect.any(String) }))
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns empty results when library returns no matches', async () => {
      mockYt.music.search.mockResolvedValue({ contents: [] })

      const results = await client.search('xyzzy-not-a-song') as any

      expect(results.songs).toHaveLength(0)
      expect(results.albums).toHaveLength(0)
    })

    it('falls back to author.name when item has no artists array', async () => {
      const noArtistsItem = { ...makeSongItem(), artists: undefined, author: { name: 'Fallback Author' } }
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [noArtistsItem] }] })

      const results = await client.search('test') as any

      expect(results.songs[0].artist).toBe('Fallback Author')
    })

    it('falls back to Unknown Artist when item has neither artists nor author', async () => {
      const bareItem = { id: 'xyz', title: 'Title', duration: { seconds: 100 }, item_type: 'song', thumbnail: {} }
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [bareItem] }] })

      const results = await client.search('test') as any

      expect(results.songs[0].artist).toBe('Unknown Artist')
    })

    it('returns filtered album results when filter is "albums"', async () => {
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [makeAlbumItem()] }] })

      const result = await client.search('queen', { filter: 'albums' }) as any[]

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].type).toBe('album')
      expect(result[0].browseId).toBe('MPREb_4pL8gzRtw1v')
      expect(result[0].title).toBe('A Night at the Opera')
      expect(result[0].artist).toBe('Queen')
    })

    it('uses endpoint.payload.browseId when album item has no direct id', async () => {
      const noIdAlbum = { ...makeAlbumItem(), id: undefined, endpoint: { payload: { browseId: 'alt-browse-id' } } }
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [noIdAlbum] }] })

      const result = await client.search('q', { filter: 'albums' }) as any[]

      expect(result[0].browseId).toBe('alt-browse-id')
    })

    it('returns filtered artist results when filter is "artists"', async () => {
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [makeArtistItem()] }] })

      const result = await client.search('queen', { filter: 'artists' }) as any[]

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].type).toBe('artist')
      expect(result[0].channelId).toBe('UCiMhD4jzUqG-IgPzUmmytRQ')
      expect(result[0].name).toBe('Queen')
    })

    it('returns empty array when filter is "playlists"', async () => {
      mockYt.music.search.mockResolvedValue({ contents: [{ contents: [] }] })

      const result = await client.search('hits', { filter: 'playlists' })

      expect(Array.isArray(result)).toBe(true)
      expect((result as any[]).length).toBe(0)
    })
  })

  describe('getHome', () => {
    it('returns an array of sections', async () => {
      mockYt.music.getHomeFeed.mockResolvedValue({
        sections: [
          { title: { text: 'Quick picks' }, contents: [] },
          { title: { text: 'Trending' }, contents: [] },
        ],
      })

      const sections = await client.getHome()

      expect(Array.isArray(sections)).toBe(true)
      expect(sections.length).toBeGreaterThanOrEqual(1)
      expect(sections[0]).toHaveProperty('title')
      expect(sections[0]).toHaveProperty('items')
    })
  })

  describe('getArtist', () => {
    it('returns an Artist object with the correct channelId', async () => {
      mockYt.music.getArtist.mockResolvedValue({
        header: { title: { text: 'Queen' } },
        sections: [],
      })

      const artist = await client.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')

      expect(artist.channelId).toBe('UCiMhD4jzUqG-IgPzUmmytRQ')
      expect(artist.name).toBe('Queen')
      expect(artist.type).toBe('artist')
    })

    it('populates songs, albums, and singles from artist sections', async () => {
      mockYt.music.getArtist.mockResolvedValue({
        header: { title: { text: 'Queen' } },
        sections: [
          { title: { text: 'Songs' }, contents: [makeSongItem()] },
          { title: { text: 'Albums' }, contents: [makeAlbumItem()] },
          { title: { text: 'Singles' }, contents: [makeAlbumItem({ id: 'MPREb_single1' })] },
        ],
      })

      const artist = await client.getArtist('UCiMhD4jzUqG-IgPzUmmytRQ')

      expect(artist.songs).toHaveLength(1)
      expect(artist.albums).toHaveLength(1)
      expect(artist.singles).toHaveLength(1)
    })

    it('throws when artist is not found', async () => {
      mockYt.music.getArtist.mockResolvedValue(null)

      await expect(client.getArtist('bad-id')).rejects.toThrow('Artist not found')
    })
  })

  describe('getAlbum', () => {
    it('returns an Album with tracks', async () => {
      mockYt.music.getAlbum.mockResolvedValue({
        header: {
          title: { text: 'A Night at the Opera' },
          subtitle: { runs: [null, null, { text: 'Queen' }, null, { text: '1975' }] },
        },
        contents: [],
      })

      const album = await client.getAlbum('MPREb_4pL8gzRtw1v')

      expect(album.title).toBe('A Night at the Opera')
      expect(album.artist).toBe('Queen')
      expect(album.type).toBe('album')
      expect(Array.isArray(album.tracks)).toBe(true)
    })

    it('maps tracks from album contents', async () => {
      mockYt.music.getAlbum.mockResolvedValue({
        header: {
          title: { text: 'A Night at the Opera' },
          subtitle: { runs: [null, null, { text: 'Queen' }, null, { text: '1975' }] },
          thumbnail: { contents: [{ url: 'https://img.example.com/album.jpg', width: 226, height: 226 }] },
        },
        contents: [
          { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artists: [{ name: 'Queen' }], duration: { seconds: 354 } },
          { id: 'HgzGwKwLmgM', title: "Don't Stop Me Now", artists: [{ name: 'Queen' }], duration: { seconds: 209 } },
        ],
      })

      const album = await client.getAlbum('MPREb_4pL8gzRtw1v')

      expect(album.tracks).toHaveLength(2)
      expect(album.tracks[0].videoId).toBe('fJ9rUzIMcZQ')
      expect(album.tracks[0].type).toBe('song')
    })

    it('throws when album is not found', async () => {
      mockYt.music.getAlbum.mockResolvedValue(null)

      await expect(client.getAlbum('bad-id')).rejects.toThrow('Album not found')
    })
  })

  describe('getRadio', () => {
    it('returns an array of Songs', async () => {
      mockYt.music.getUpNext.mockResolvedValue({
        contents: [makeSongItem({ id: 'HgzGwKwLmgM', title: "Don't Stop Me Now" })],
      })

      const radio = await client.getRadio('fJ9rUzIMcZQ')

      expect(Array.isArray(radio)).toBe(true)
      expect(radio[0].type).toBe('song')
    })
  })

  describe('getRelated', () => {
    it('returns an array of Songs from related sections', async () => {
      mockYt.music.getRelated.mockResolvedValue({
        contents: [
          { contents: [makeSongItem({ id: 'abc123', title: 'Related Song' })] },
        ],
      })

      const related = await client.getRelated('dQw4w9WgXcQ')

      expect(Array.isArray(related)).toBe(true)
      expect(related[0].type).toBe('song')
      expect(related[0].videoId).toBe('abc123')
    })
  })

  describe('getCharts', () => {
    it('returns an array of Sections', async () => {
      mockYt.music.getExplore.mockResolvedValue({
        sections: [{ title: { text: 'Top songs' }, contents: [] }],
      })

      const charts = await client.getCharts({ country: 'US' })

      expect(Array.isArray(charts)).toBe(true)
    })

    it('passes the country code to the library', async () => {
      mockYt.music.getExplore.mockResolvedValue({ sections: [] })

      await client.getCharts({ country: 'JP' })

      expect(mockYt.music.getExplore).toHaveBeenCalledWith(expect.objectContaining({ country: 'JP' }))
    })
  })
})
