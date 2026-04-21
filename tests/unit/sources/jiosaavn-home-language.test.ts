import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/sources/jiosaavn/client', () => ({
  DefaultJioSaavnClient: vi.fn(),
}))

import { JioSaavnSource } from '../../../src/sources/jiosaavn'
import { DefaultJioSaavnClient } from '../../../src/sources/jiosaavn/client'

const mockClient = {
  search: vi.fn(), searchAll: vi.fn(), searchSongs: vi.fn(), searchAlbums: vi.fn(),
  searchArtists: vi.fn(), searchPlaylists: vi.fn(),
  getSong: vi.fn(), getAlbum: vi.fn(), getArtist: vi.fn(), getPlaylist: vi.fn(),
  createEntityStation: vi.fn(), getRadioSongs: vi.fn(),
  getHome: vi.fn(),
  getLyrics: vi.fn(),
  getTrending: vi.fn(),
  getFeaturedPlaylists: vi.fn(),
  getNewReleases: vi.fn(),
}

;(DefaultJioSaavnClient as any).mockImplementation(() => mockClient)

beforeEach(() => vi.clearAllMocks())

describe('JioSaavnSource — getHome with language', () => {
  it('calls getTrending + getFeaturedPlaylists + getNewReleases when language is given', async () => {
    mockClient.getTrending.mockResolvedValue({ data: [] })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })
    mockClient.getNewReleases.mockResolvedValue({ data: [] })

    const src = new JioSaavnSource()
    await src.getHome('tamil')

    expect(mockClient.getTrending).toHaveBeenCalled()
    expect(mockClient.getFeaturedPlaylists).toHaveBeenCalled()
    expect(mockClient.getNewReleases).toHaveBeenCalled()
    expect(mockClient.getHome).not.toHaveBeenCalled()
  })

  it('falls back to getBrowseModules when no language is given', async () => {
    mockClient.getHome.mockResolvedValue({})

    const src = new JioSaavnSource()
    await src.getHome()

    expect(mockClient.getHome).toHaveBeenCalled()
    expect(mockClient.getTrending).not.toHaveBeenCalled()
  })

  it('returns sections with correct titles for language-filtered home', async () => {
    mockClient.getTrending.mockResolvedValue({ data: [{ id: '1', title: 'Blinding Lights', type: 'song', image: '', more_info: { primary_artists: 'The Weeknd', duration: '200', album: '' } }] })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [{ id: '2', title: 'English Hits', type: 'playlist', image: '', perma_url: '' }] })
    mockClient.getNewReleases.mockResolvedValue({ data: [{ id: '3', title: 'Fine Line', type: 'album', image: '', more_info: { music: 'Harry Styles', year: '2019', language: 'english' } }] })

    const src = new JioSaavnSource()
    const sections = await src.getHome('english')

    expect(sections.length).toBeGreaterThan(0)
    const titles = sections.map(s => s.title)
    expect(titles.some(t => /trending/i.test(t))).toBe(true)
  })

  it('passes entity_language to getTrending calls', async () => {
    mockClient.getTrending.mockResolvedValue({ data: [] })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })
    mockClient.getNewReleases.mockResolvedValue({ data: [] })

    const src = new JioSaavnSource()
    await src.getHome('punjabi')

    const calls = mockClient.getTrending.mock.calls
    expect(calls.some((c: any[]) => c[0] === 'punjabi' || JSON.stringify(c).includes('punjabi'))).toBe(true)
  })

  it('calls getTrending with all three entity types: song, album, playlist', async () => {
    mockClient.getTrending.mockResolvedValue({ data: [] })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })
    mockClient.getNewReleases.mockResolvedValue({ data: [] })

    const src = new JioSaavnSource()
    await src.getHome('hindi')

    const entityTypes = mockClient.getTrending.mock.calls.map((c: any[]) => c[0])
    expect(entityTypes).toContain('song')
    expect(entityTypes).toContain('album')
    expect(entityTypes).toContain('playlist')
  })

  it('still returns other sections when one language endpoint fails', async () => {
    mockClient.getTrending.mockImplementation((type: string) => {
      if (type === 'song') return Promise.reject(new Error('network error'))
      return Promise.resolve({ data: [{ id: '1', title: 'Test Album', type: 'album', image: '', more_info: { music: 'Artist', year: '2024', language: 'hindi' }, year: '2024' }] })
    })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })
    mockClient.getNewReleases.mockResolvedValue({ data: [{ id: '2', title: 'New Album', type: 'album', image: '', year: '2024', more_info: { artistMap: { primary_artists: [{ id: 'a1', name: 'Artist', role: 'primary_artists' }] } } }] })

    const src = new JioSaavnSource()
    const sections = await src.getHome('hindi')

    expect(Array.isArray(sections)).toBe(true)
    const titles = sections.map(s => s.title)
    expect(titles.some(t => /album/i.test(t))).toBe(true)
  })

  it('passes language to getNewReleases', async () => {
    mockClient.getTrending.mockResolvedValue({ data: [] })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })
    mockClient.getNewReleases.mockResolvedValue({ data: [] })

    const src = new JioSaavnSource()
    await src.getHome('telugu')

    expect(mockClient.getNewReleases).toHaveBeenCalledWith('telugu')
  })

  it('passes language to getFeaturedPlaylists in getHome', async () => {
    mockClient.getTrending.mockResolvedValue({ data: [] })
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })
    mockClient.getNewReleases.mockResolvedValue({ data: [] })

    const src = new JioSaavnSource()
    await src.getHome('marathi')

    expect(mockClient.getFeaturedPlaylists).toHaveBeenCalledWith('marathi')
  })
})

describe('JioSaavnSource — getFeaturedPlaylists', () => {
  it('exposes getFeaturedPlaylists method', async () => {
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [
      { id: '1', title: 'Songs of Summer - English', type: 'playlist', image: '', perma_url: '' }
    ]})

    const src = new JioSaavnSource()
    expect(typeof (src as any).getFeaturedPlaylists).toBe('function')
    const result = await (src as any).getFeaturedPlaylists('english')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].title).toBe('Songs of Summer - English')
  })

  it('defaults to hindi when no language is given', async () => {
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [] })

    const src = new JioSaavnSource()
    await (src as any).getFeaturedPlaylists()

    expect(mockClient.getFeaturedPlaylists).toHaveBeenCalledWith('hindi')
  })

  it('returned playlists have jio:-prefixed playlistIds', async () => {
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [
      { id: 'abc123', title: 'Top Hindi Songs', type: 'playlist', image: '', perma_url: '' },
      { id: 'xyz456', title: 'Bollywood Hits', type: 'playlist', image: '', perma_url: '' },
    ]})

    const src = new JioSaavnSource()
    const result = await (src as any).getFeaturedPlaylists('hindi')

    result.forEach((p: any) => expect(p.playlistId).toMatch(/^jio:/))
  })

  it('returned playlists have type "playlist"', async () => {
    mockClient.getFeaturedPlaylists.mockResolvedValue({ data: [
      { id: 'pl1', title: 'Chill Mix', type: 'playlist', image: '', perma_url: '' },
    ]})

    const src = new JioSaavnSource()
    const result = await (src as any).getFeaturedPlaylists('english')

    expect(result[0].type).toBe('playlist')
  })

  it('returns empty array on error', async () => {
    mockClient.getFeaturedPlaylists.mockRejectedValue(new Error('fail'))
    const src = new JioSaavnSource()
    const result = await (src as any).getFeaturedPlaylists('english')
    expect(result).toEqual([])
  })
})
