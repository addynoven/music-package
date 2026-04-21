import { describe, it, expect, vi, beforeEach } from 'vitest'
import forge from 'node-forge'
import { JioSaavnSource } from '../../../../src/sources/jiosaavn'
import type { JioSaavnClient } from '../../../../src/sources/jiosaavn/client'

// ─── helpers ─────────────────────────────────────────────────────────────────

function encryptUrl(plaintext: string): string {
  const cipher = forge.cipher.createCipher('DES-ECB', forge.util.createBuffer('38346591'))
  cipher.start({ iv: forge.util.createBuffer('00000000') })
  cipher.update(forge.util.createBuffer(plaintext))
  cipher.finish()
  return forge.util.encode64(cipher.output.getBytes())
}

function makeRawSong(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc12345',
    title: 'Tum Hi Ho',
    subtitle: 'Arijit Singh',
    type: 'song',
    more_info: {
      duration: '252',
      artistMap: {
        primary_artists: [{ id: 'a1', name: 'Arijit Singh', role: 'primary_artists' }],
        featured_artists: [],
        artists: [{ id: 'a1', name: 'Arijit Singh', role: 'singer' }],
      },
      album: 'Aashiqui 2',
      encrypted_media_url: encryptUrl('https://aac.saavncdn.com/Tum_Hi_Ho_96.mp4'),
    },
    image: 'https://c.saavncdn.com/150x150.jpg',
    ...overrides,
  }
}

function makeRawAlbum() {
  return {
    id: 'alb12345',
    title: 'Aashiqui 2',
    header_desc: 'Bollywood hit album',
    perma_url: 'https://www.jiosaavn.com/album/aashiqui-2/abc',
    year: '2013',
    type: 'album',
    play_count: '10000000',
    language: 'hindi',
    explicit_content: '0',
    image: 'https://c.saavncdn.com/150x150.jpg',
    more_info: {
      artistMap: {
        primary_artists: [{ id: 'a1', name: 'Arijit Singh', role: 'primary', image: '', type: 'artist', perma_url: '' }],
        featured_artists: [],
        artists: [],
      },
    },
  }
}

function makeRawArtistResult() {
  return {
    id: 'art12345',
    name: 'Arijit Singh',
    role: 'singer',
    image: 'https://c.saavncdn.com/artists/150x150.jpg',
    type: 'artist',
    perma_url: 'https://www.jiosaavn.com/artist/arijit-singh/abc',
  }
}

function makeRawPlaylist() {
  return {
    id: 'pl12345',
    title: 'Top Bollywood Hits',
    type: 'playlist',
    image: 'https://c.saavncdn.com/150x150.jpg',
    perma_url: 'https://www.jiosaavn.com/playlist/top-hits/abc',
    more_info: { song_count: '50', language: 'hindi' },
    explicit_content: '0',
  }
}

function makeRawSearchAll() {
  return {
    songs: {
      data: [{
        id: 'abc12345', title: 'Tum Hi Ho', image: 'https://c.saavncdn.com/150x150.jpg',
        perma_url: '', type: 'song', description: '',
        more_info: { album: 'Aashiqui 2', primary_artists: 'Arijit Singh', singers: 'Arijit Singh', language: 'hindi' },
      }],
      position: 1,
    },
    albums: {
      data: [{
        id: 'alb12345', title: 'Aashiqui 2', image: 'https://c.saavncdn.com/150x150.jpg',
        perma_url: '', type: 'album', description: '',
        more_info: { music: 'Arijit Singh', year: '2013', song_pids: '', language: 'hindi' },
      }],
      position: 2,
    },
    artists: {
      data: [{ id: 'art12345', title: 'Arijit Singh', image: 'https://c.saavncdn.com/150x150.jpg', type: 'artist', description: '', position: 1 }],
      position: 3,
    },
    playlists: {
      data: [{
        id: 'pl12345', title: 'Top Hits', image: 'https://c.saavncdn.com/150x150.jpg',
        perma_url: '', type: 'playlist', description: '',
        more_info: { language: 'hindi' },
      }],
      position: 4,
    },
    topquery: { data: [], position: 0 },
  }
}

function makeRawAlbumDetail() {
  return {
    id: 'alb12345',
    title: 'Aashiqui 2',
    image: 'https://c.saavncdn.com/150x150.jpg',
    year: '2013',
    more_info: {
      artistMap: {
        primary_artists: [{ id: 'a1', name: 'Arijit Singh', role: 'primary_artists' }],
        featured_artists: [],
        artists: [],
      },
    },
    list: [makeRawSong()],
  }
}

function makeRawArtistDetail() {
  return {
    artistId: 'art12345',
    name: 'Arijit Singh',
    image: 'https://c.saavncdn.com/artists/150x150.jpg',
    follower_count: '10000000',
    topSongs: [makeRawSong()],
    topAlbums: [makeRawAlbum()],
    singles: [],
  }
}

function makeRawPlaylistDetail() {
  return {
    id: 'pl12345',
    title: 'Top Bollywood Hits',
    image: 'https://c.saavncdn.com/150x150.jpg',
    list: [makeRawSong()],
    list_count: '1',
  }
}

function makeRawRadioResponse() {
  return {
    stationid: 'station123',
    '1': { song: makeRawSong() },
    '2': { song: makeRawSong({ id: 'def67890', title: 'Kal Ho Naa Ho' }) },
  }
}

function makeRawBrowseModules() {
  // real API returns direct arrays keyed by module name, no title/data wrapper
  return {
    new_trending: [makeRawSong()],
    new_albums: [makeRawAlbum()],
  }
}

function makeClient() {
  return {
    searchSongs: vi.fn().mockResolvedValue({ total: 1, start: 0, results: [makeRawSong()] }),
    searchAlbums: vi.fn().mockResolvedValue({ total: 1, start: 0, results: [makeRawAlbum()] }),
    searchArtists: vi.fn().mockResolvedValue({ total: 1, start: 0, results: [makeRawArtistResult()] }),
    searchPlaylists: vi.fn().mockResolvedValue({ total: 1, start: 0, results: [makeRawPlaylist()] }),
    searchAll: vi.fn().mockResolvedValue(makeRawSearchAll()),
    getSong: vi.fn().mockResolvedValue({ songs: [makeRawSong()] }),
    getAlbum: vi.fn().mockResolvedValue(makeRawAlbumDetail()),
    getArtist: vi.fn().mockResolvedValue(makeRawArtistDetail()),
    getPlaylist: vi.fn().mockResolvedValue(makeRawPlaylistDetail()),
    createEntityStation: vi.fn().mockResolvedValue({ stationid: 'station123' }),
    getRadioSongs: vi.fn().mockResolvedValue(makeRawRadioResponse()),
    getHome: vi.fn().mockResolvedValue(makeRawBrowseModules()),
  } satisfies JioSaavnClient & Record<string, ReturnType<typeof vi.fn>>
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('JioSaavnSource', () => {
  let client: ReturnType<typeof makeClient>
  let source: JioSaavnSource

  beforeEach(() => {
    vi.clearAllMocks()
    client = makeClient()
    source = new JioSaavnSource(client)
  })

  // ─── name ──────────────────────────────────────────────────────────────────

  describe('name', () => {
    it('has name "jiosaavn"', () => {
      expect(source.name).toBe('jiosaavn')
    })
  })

  // ─── supportedFilters removed ──────────────────────────────────────────────

  describe('supportedFilters', () => {
    it('does NOT declare supportedFilters — source handles all filter types', () => {
      expect((source as any).supportedFilters).toBeUndefined()
    })
  })

  // ─── canHandle ─────────────────────────────────────────────────────────────

  describe('canHandle', () => {
    it('returns true for plain text search queries', () => {
      expect(source.canHandle('arijit singh')).toBe(true)
    })

    it('returns true for jio:-prefixed IDs', () => {
      expect(source.canHandle('jio:abc12345')).toBe(true)
    })

    it('returns true for jiosaavn.com URLs', () => {
      expect(source.canHandle('https://www.jiosaavn.com/song/tum-hi-ho/abc123')).toBe(true)
    })

    it('returns false for youtube.com URLs', () => {
      expect(source.canHandle('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    })

    it('returns false for youtu.be short URLs', () => {
      expect(source.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(false)
    })

    it('returns false for music.youtube.com URLs', () => {
      expect(source.canHandle('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    })

    it('returns false for YouTube video IDs (11-char alphanumeric)', () => {
      expect(source.canHandle('dQw4w9WgXcQ')).toBe(false)
    })
  })

  // ─── search — songs (filter: 'songs') ──────────────────────────────────────

  describe('search — songs filter', () => {
    it('calls client.searchSongs with the query', async () => {
      await source.search('arijit singh', { filter: 'songs' })
      expect(client.searchSongs).toHaveBeenCalledWith('arijit singh', 0, 20)
    })

    it('returns Song[] when filter is "songs"', async () => {
      const result = await source.search('arijit singh', { filter: 'songs' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('song has jio:-prefixed videoId', async () => {
      const result = await source.search('arijit singh', { filter: 'songs' }) as any[]
      expect(result[0].videoId).toBe('jio:abc12345')
    })

    it('song has correct title, artist, duration', async () => {
      const result = await source.search('arijit singh', { filter: 'songs' }) as any[]
      expect(result[0].title).toBe('Tum Hi Ho')
      expect(result[0].artist).toBe('Arijit Singh')
      expect(result[0].duration).toBe(252)
    })

    it('song thumbnails have correct dimensions parsed from URL', async () => {
      // fixture image URL contains "150x150" — should parse to width:150 height:150
      const result = await source.search('arijit singh', { filter: 'songs' }) as any[]
      const thumb150 = result[0].thumbnails.find((t: any) => t.url.includes('150x150'))
      expect(thumb150).toBeDefined()
      expect(thumb150.width).toBe(150)
      expect(thumb150.height).toBe(150)
    })

    it('song thumbnails have correct dimensions for 500x500 variant', async () => {
      const result = await source.search('arijit singh', { filter: 'songs' }) as any[]
      const thumb500 = result[0].thumbnails.find((t: any) => t.url.includes('500x500'))
      expect(thumb500).toBeDefined()
      expect(thumb500.width).toBe(500)
      expect(thumb500.height).toBe(500)
    })

    it('returns empty array when client returns no songs', async () => {
      client.searchSongs.mockResolvedValue({ total: 0, start: 0, results: [] })
      const result = await source.search('xyzzy', { filter: 'songs' }) as any[]
      expect(result).toHaveLength(0)
    })
  })

  // ─── search — albums (filter: 'albums') ────────────────────────────────────

  describe('search — albums filter', () => {
    it('calls client.searchAlbums with the query', async () => {
      await source.search('aashiqui', { filter: 'albums' })
      expect(client.searchAlbums).toHaveBeenCalledWith('aashiqui', 0, 20)
    })

    it('returns Album[] when filter is "albums"', async () => {
      const result = await source.search('aashiqui', { filter: 'albums' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('album has type "album"', async () => {
      const result = await source.search('aashiqui', { filter: 'albums' }) as any[]
      expect(result[0].type).toBe('album')
    })

    it('album has jio:-prefixed browseId', async () => {
      const result = await source.search('aashiqui', { filter: 'albums' }) as any[]
      expect(result[0].browseId).toBe('jio:alb12345')
    })

    it('album has correct title and artist', async () => {
      const result = await source.search('aashiqui', { filter: 'albums' }) as any[]
      expect(result[0].title).toBe('Aashiqui 2')
      expect(result[0].artist).toBe('Arijit Singh')
    })

    it('album has year', async () => {
      const result = await source.search('aashiqui', { filter: 'albums' }) as any[]
      expect(result[0].year).toBe('2013')
    })
  })

  // ─── search — artists (filter: 'artists') ──────────────────────────────────

  describe('search — artists filter', () => {
    it('calls client.searchArtists with the query', async () => {
      await source.search('arijit', { filter: 'artists' })
      expect(client.searchArtists).toHaveBeenCalledWith('arijit', 0, 20)
    })

    it('returns Artist[] when filter is "artists"', async () => {
      const result = await source.search('arijit', { filter: 'artists' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('artist has type "artist"', async () => {
      const result = await source.search('arijit', { filter: 'artists' }) as any[]
      expect(result[0].type).toBe('artist')
    })

    it('artist has jio:-prefixed channelId', async () => {
      const result = await source.search('arijit', { filter: 'artists' }) as any[]
      expect(result[0].channelId).toBe('jio:art12345')
    })

    it('artist has correct name', async () => {
      const result = await source.search('arijit', { filter: 'artists' }) as any[]
      expect(result[0].name).toBe('Arijit Singh')
    })
  })

  // ─── search — playlists (filter: 'playlists') ──────────────────────────────

  describe('search — playlists filter', () => {
    it('calls client.searchPlaylists with the query', async () => {
      await source.search('top hits', { filter: 'playlists' })
      expect(client.searchPlaylists).toHaveBeenCalledWith('top hits', 0, 20)
    })

    it('returns Playlist[] when filter is "playlists"', async () => {
      const result = await source.search('top hits', { filter: 'playlists' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('playlist has type "playlist"', async () => {
      const result = await source.search('top hits', { filter: 'playlists' }) as any[]
      expect(result[0].type).toBe('playlist')
    })

    it('playlist has jio:-prefixed playlistId', async () => {
      const result = await source.search('top hits', { filter: 'playlists' }) as any[]
      expect(result[0].playlistId).toBe('jio:pl12345')
    })

    it('playlist has correct title', async () => {
      const result = await source.search('top hits', { filter: 'playlists' }) as any[]
      expect(result[0].title).toBe('Top Bollywood Hits')
    })
  })

  // ─── search — no filter (all types) ────────────────────────────────────────

  describe('search — no filter', () => {
    it('calls client.searchAll with the query', async () => {
      await source.search('arijit singh')
      expect(client.searchAll).toHaveBeenCalledWith('arijit singh')
    })

    it('returns SearchResults with all four arrays', async () => {
      const result = await source.search('arijit singh') as any
      expect(result).toHaveProperty('songs')
      expect(result).toHaveProperty('albums')
      expect(result).toHaveProperty('artists')
      expect(result).toHaveProperty('playlists')
    })

    it('songs in SearchResults have jio:-prefixed videoIds', async () => {
      const result = await source.search('arijit singh') as any
      expect(result.songs[0].videoId).toBe('jio:abc12345')
    })

    it('albums in SearchResults have jio:-prefixed browseIds', async () => {
      const result = await source.search('arijit singh') as any
      expect(result.albums[0].browseId).toBe('jio:alb12345')
    })

    it('artists in SearchResults have jio:-prefixed channelIds', async () => {
      const result = await source.search('arijit singh') as any
      expect(result.artists[0].channelId).toBe('jio:art12345')
    })

    it('playlists in SearchResults have jio:-prefixed playlistIds', async () => {
      const result = await source.search('arijit singh') as any
      expect(result.playlists[0].playlistId).toBe('jio:pl12345')
    })
  })

  // ─── getStream ─────────────────────────────────────────────────────────────

  describe('getStream', () => {
    it('calls client.getSong with stripped JioSaavn ID (no jio: prefix)', async () => {
      await source.getStream('jio:abc12345', 'high')
      expect(client.getSong).toHaveBeenCalledWith('abc12345')
    })

    it('returns StreamingData with decrypted URL at 320kbps for high quality', async () => {
      const result = await source.getStream('jio:abc12345', 'high')
      expect(result.url).toContain('saavncdn.com')
      expect(result.url).toContain('_320')
    })

    it('returns StreamingData with decrypted URL at 96kbps for low quality', async () => {
      const result = await source.getStream('jio:abc12345', 'low')
      expect(result.url).toContain('_96')
    })

    it('returns StreamingData with codec mp4a', async () => {
      const result = await source.getStream('jio:abc12345', 'high')
      expect(result.codec).toBe('mp4a')
    })

    it('returns StreamingData with bitrate set', async () => {
      const result = await source.getStream('jio:abc12345', 'high')
      expect(result.bitrate).toBeGreaterThan(0)
    })

    it('throws when song is not found', async () => {
      client.getSong.mockResolvedValue({ songs: [] })
      await expect(source.getStream('jio:notfound', 'high')).rejects.toThrow()
    })
  })

  // ─── getMetadata ───────────────────────────────────────────────────────────

  describe('getMetadata', () => {
    it('calls client.getSong with stripped ID', async () => {
      await source.getMetadata('jio:abc12345')
      expect(client.getSong).toHaveBeenCalledWith('abc12345')
    })

    it('returns a Song with correct shape', async () => {
      const song = await source.getMetadata('jio:abc12345')
      expect(song.type).toBe('song')
      expect(song.videoId).toBe('jio:abc12345')
      expect(song.title).toBe('Tum Hi Ho')
      expect(song.artist).toBe('Arijit Singh')
      expect(song.duration).toBe(252)
    })

    it('includes album name when present', async () => {
      const song = await source.getMetadata('jio:abc12345')
      expect(song.album).toBe('Aashiqui 2')
    })

    it('throws when song is not found', async () => {
      client.getSong.mockResolvedValue({ songs: [] })
      await expect(source.getMetadata('jio:notfound')).rejects.toThrow()
    })
  })

  // ─── getAlbum ──────────────────────────────────────────────────────────────

  describe('getAlbum', () => {
    it('calls client.getAlbum with stripped JioSaavn ID', async () => {
      await source.getAlbum!('jio:alb12345')
      expect(client.getAlbum).toHaveBeenCalledWith('alb12345')
    })

    it('returns Album with type, browseId, title, artist, year', async () => {
      const album = await source.getAlbum!('jio:alb12345')
      expect(album.type).toBe('album')
      expect(album.browseId).toBe('jio:alb12345')
      expect(album.title).toBe('Aashiqui 2')
      expect(album.artist).toBe('Arijit Singh')
      expect(album.year).toBe('2013')
    })

    it('returns Album with mapped tracks', async () => {
      const album = await source.getAlbum!('jio:alb12345')
      expect(Array.isArray(album.tracks)).toBe(true)
      expect(album.tracks).toHaveLength(1)
      expect(album.tracks[0].videoId).toBe('jio:abc12345')
    })

    it('returns Album with thumbnails', async () => {
      const album = await source.getAlbum!('jio:alb12345')
      expect(album.thumbnails.length).toBeGreaterThan(0)
    })
  })

  // ─── getArtist ─────────────────────────────────────────────────────────────

  describe('getArtist', () => {
    it('calls client.getArtist with stripped JioSaavn ID', async () => {
      await source.getArtist!('jio:art12345')
      expect(client.getArtist).toHaveBeenCalledWith('art12345')
    })

    it('returns Artist with type, channelId, name', async () => {
      const artist = await source.getArtist!('jio:art12345')
      expect(artist.type).toBe('artist')
      expect(artist.channelId).toBe('jio:art12345')
      expect(artist.name).toBe('Arijit Singh')
    })

    it('returns Artist with topSongs mapped to songs array', async () => {
      const artist = await source.getArtist!('jio:art12345')
      expect(Array.isArray(artist.songs)).toBe(true)
      expect(artist.songs).toHaveLength(1)
      expect(artist.songs[0].videoId).toBe('jio:abc12345')
    })

    it('returns Artist with topAlbums mapped to albums array', async () => {
      const artist = await source.getArtist!('jio:art12345')
      expect(Array.isArray(artist.albums)).toBe(true)
      expect(artist.albums).toHaveLength(1)
    })

    it('returns Artist with singles array', async () => {
      const artist = await source.getArtist!('jio:art12345')
      expect(Array.isArray(artist.singles)).toBe(true)
    })
  })

  // ─── getPlaylist ───────────────────────────────────────────────────────────

  describe('getPlaylist', () => {
    it('calls client.getPlaylist with stripped JioSaavn ID', async () => {
      await source.getPlaylist!('jio:pl12345')
      expect(client.getPlaylist).toHaveBeenCalledWith('pl12345')
    })

    it('returns Playlist with type, playlistId, title', async () => {
      const playlist = await source.getPlaylist!('jio:pl12345')
      expect(playlist.type).toBe('playlist')
      expect(playlist.playlistId).toBe('jio:pl12345')
      expect(playlist.title).toBe('Top Bollywood Hits')
    })

    it('returns Playlist with songs', async () => {
      const playlist = await source.getPlaylist!('jio:pl12345')
      expect(Array.isArray(playlist.songs)).toBe(true)
      expect(playlist.songs!).toHaveLength(1)
      expect(playlist.songs![0].videoId).toBe('jio:abc12345')
    })

    it('returns Playlist with thumbnails', async () => {
      const playlist = await source.getPlaylist!('jio:pl12345')
      expect(playlist.thumbnails.length).toBeGreaterThan(0)
    })
  })

  // ─── getRadio ──────────────────────────────────────────────────────────────

  describe('getRadio', () => {
    it('calls createEntityStation then getRadioSongs', async () => {
      await source.getRadio!('jio:abc12345')
      expect(client.createEntityStation).toHaveBeenCalledWith('abc12345')
      expect(client.getRadioSongs).toHaveBeenCalledWith('station123', expect.any(Number))
    })

    it('returns Song[]', async () => {
      const songs = await source.getRadio!('jio:abc12345')
      expect(Array.isArray(songs)).toBe(true)
    })

    it('returned songs have jio:-prefixed videoIds', async () => {
      const songs = await source.getRadio!('jio:abc12345')
      expect(songs.length).toBeGreaterThan(0)
      songs.forEach(s => expect(s.videoId).toMatch(/^jio:/))
    })

    it('strips stationid key — all items are songs', async () => {
      const songs = await source.getRadio!('jio:abc12345')
      expect(songs.every(s => s.type === 'song')).toBe(true)
    })
  })

  // ─── getHome ───────────────────────────────────────────────────────────────

  describe('getHome', () => {
    it('calls client.getHome', async () => {
      await source.getHome!()
      expect(client.getHome).toHaveBeenCalled()
    })

    it('returns Section[]', async () => {
      const sections = await source.getHome!()
      expect(Array.isArray(sections)).toBe(true)
    })

    it('each section has title and items array', async () => {
      const sections = await source.getHome!()
      expect(sections.length).toBeGreaterThan(0)
      expect(sections[0]).toHaveProperty('title')
      expect(sections[0]).toHaveProperty('items')
      expect(Array.isArray(sections[0].items)).toBe(true)
    })

    it('passes language to client.getHome when provided', async () => {
      await source.getHome!('hindi')
      expect(client.getHome).toHaveBeenCalledWith('hindi')
    })
  })
})
