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

  it('returns empty array on error', async () => {
    mockClient.getFeaturedPlaylists.mockRejectedValue(new Error('fail'))
    const src = new JioSaavnSource()
    const result = await (src as any).getFeaturedPlaylists('english')
    expect(result).toEqual([])
  })
})
