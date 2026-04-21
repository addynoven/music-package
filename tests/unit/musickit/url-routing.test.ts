import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import type { Song, Album, Artist, StreamingData, Playlist } from '../../../src/models'

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
  return { type: 'song', videoId: 'jio:abc123', title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 252, thumbnails: [], ...overrides }
}
function makeAlbum(overrides: Partial<Album> = {}): Album {
  return { type: 'album', browseId: 'jio:alb123', title: 'Aashiqui 2', artist: 'Arijit Singh', thumbnails: [], tracks: [], ...overrides }
}
function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return { type: 'artist', channelId: 'jio:art123', name: 'Arijit Singh', thumbnails: [], songs: [], albums: [], singles: [], ...overrides }
}
function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return { type: 'playlist', playlistId: 'jio:pl123', title: 'Top Hits', thumbnails: [], songs: [], ...overrides }
}
function makeStream(overrides: Partial<StreamingData> = {}): StreamingData {
  return { url: 'https://stream.example.com/audio', codec: 'mp4a', bitrate: 320_000, expiresAt: 9999999999, ...overrides }
}

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:') || (!q.includes('youtube') && !q.includes('youtu.be') && !/^[A-Za-z0-9_-]{11}$/.test(q))),
  search: vi.fn().mockResolvedValue([]),
  getStream: vi.fn().mockResolvedValue(makeStream()),
  getMetadata: vi.fn().mockResolvedValue(makeSong()),
  getAlbum: vi.fn().mockResolvedValue(makeAlbum()),
  getArtist: vi.fn().mockResolvedValue(makeArtist()),
  getPlaylist: vi.fn().mockResolvedValue(makePlaylist()),
  getRadio: vi.fn().mockResolvedValue([makeSong()]),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

const mockDiscovery = {
  getAlbum: vi.fn().mockResolvedValue(makeAlbum({ browseId: 'MPREb_xxx' })),
  getArtist: vi.fn().mockResolvedValue(makeArtist({ channelId: 'UCxxx' })),
  getInfo: vi.fn().mockResolvedValue(makeSong({ videoId: 'fJ9rUzIMcZQ' })),
  getRelated: vi.fn().mockResolvedValue([makeSong({ videoId: 'fJ9rUzIMcZQ' })]),
  getRadio: vi.fn().mockResolvedValue([makeSong({ videoId: 'fJ9rUzIMcZQ' })]),
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── getStream ────────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in getStream', () => {
  it('resolves JioSaavn song URL and routes to JioSaavn source', async () => {
    const mk = new MusicKit()
    await mk.getStream('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
    expect(mockJioSaavnSource.getStream).toHaveBeenCalledWith('jio:OQMaey5hbVc', 'high')
  })

  it('resolves youtube.com/watch URL and routes to YouTube source', async () => {
    const mk = new MusicKit()
    await mk.getStream('https://www.youtube.com/watch?v=fJ9rUzIMcZQ')
    expect(mockJioSaavnSource.getStream).not.toHaveBeenCalled()
  })

  it('resolves youtu.be URL and routes to YouTube source', async () => {
    const mk = new MusicKit()
    await mk.getStream('https://youtu.be/fJ9rUzIMcZQ')
    expect(mockJioSaavnSource.getStream).not.toHaveBeenCalled()
  })

  it('resolves music.youtube.com/watch URL and routes to YouTube source', async () => {
    const mk = new MusicKit()
    await mk.getStream('https://music.youtube.com/watch?v=fJ9rUzIMcZQ')
    expect(mockJioSaavnSource.getStream).not.toHaveBeenCalled()
  })
})

// ─── getAlbum ─────────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in getAlbum', () => {
  it('resolves JioSaavn album URL and routes to JioSaavn source', async () => {
    const mk = new MusicKit()
    await mk.getAlbum('https://www.jiosaavn.com/album/aashiqui-2/alb456')
    expect(mockJioSaavnSource.getAlbum).toHaveBeenCalledWith('jio:alb456')
  })

  it('resolves YouTube Music browse URL and routes to YouTube discovery', async () => {
    const mk = new MusicKit()
    await mk.getAlbum('https://music.youtube.com/browse/MPREb_WNGQWp5czjD')
    expect(mockDiscovery.getAlbum).toHaveBeenCalledWith('MPREb_WNGQWp5czjD')
    expect(mockJioSaavnSource.getAlbum).not.toHaveBeenCalled()
  })
})

// ─── getArtist ────────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in getArtist', () => {
  it('resolves JioSaavn artist URL and routes to JioSaavn source', async () => {
    const mk = new MusicKit()
    await mk.getArtist('https://www.jiosaavn.com/artist/arijit-singh/art789')
    expect(mockJioSaavnSource.getArtist).toHaveBeenCalledWith('jio:art789')
  })

  it('resolves YouTube Music browse URL and routes to YouTube discovery', async () => {
    const mk = new MusicKit()
    await mk.getArtist('https://music.youtube.com/browse/UCxyz')
    expect(mockDiscovery.getArtist).toHaveBeenCalledWith('UCxyz')
    expect(mockJioSaavnSource.getArtist).not.toHaveBeenCalled()
  })
})

// ─── getPlaylist ──────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in getPlaylist', () => {
  it('resolves JioSaavn featured playlist URL and routes to JioSaavn source', async () => {
    const mk = new MusicKit()
    await mk.getPlaylist('https://www.jiosaavn.com/featured/bollywood/pl001')
    expect(mockJioSaavnSource.getPlaylist).toHaveBeenCalledWith('jio:pl001')
  })
})

// ─── getRadio ─────────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in getRadio', () => {
  it('resolves JioSaavn song URL and routes to JioSaavn source for radio', async () => {
    const mk = new MusicKit()
    await mk.getRadio('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
    expect(mockJioSaavnSource.getRadio).toHaveBeenCalledWith('jio:OQMaey5hbVc')
  })

  it('resolves YouTube video URL and routes to YouTube for radio', async () => {
    const mk = new MusicKit()
    await mk.getRadio('https://www.youtube.com/watch?v=fJ9rUzIMcZQ')
    expect(mockJioSaavnSource.getRadio).not.toHaveBeenCalled()
    expect(mockDiscovery.getRadio).toHaveBeenCalledWith('fJ9rUzIMcZQ')
  })
})

// ─── getRelated ───────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in getRelated', () => {
  it('resolves YouTube video URL and routes to YouTube discovery', async () => {
    const mk = new MusicKit()
    await mk.getRelated('https://www.youtube.com/watch?v=fJ9rUzIMcZQ')
    expect(mockDiscovery.getRelated).toHaveBeenCalledWith('fJ9rUzIMcZQ')
  })

  it('resolves youtu.be URL and routes to YouTube discovery', async () => {
    const mk = new MusicKit()
    await mk.getRelated('https://youtu.be/fJ9rUzIMcZQ')
    expect(mockDiscovery.getRelated).toHaveBeenCalledWith('fJ9rUzIMcZQ')
  })
})

// ─── search ───────────────────────────────────────────────────────────────────

describe('MusicKit — URL routing in search', () => {
  it('extracts query from YouTube Music search URL', async () => {
    const mk = new MusicKit()
    await mk.search('https://music.youtube.com/search?q=queen', { filter: 'songs' })
    // Should search with "queen" not the raw URL
    // The resolved query "queen" → JioSaavn canHandle returns true → JioSaavn.search called
    expect(mockJioSaavnSource.search).toHaveBeenCalledWith('queen', { filter: 'songs' })
  })

  it('extracts decoded query from YouTube Music search URL with encoded chars', async () => {
    const mk = new MusicKit()
    await mk.search('https://music.youtube.com/search?q=tum+hi+ho', { filter: 'songs' })
    expect(mockJioSaavnSource.search).toHaveBeenCalledWith('tum hi ho', { filter: 'songs' })
  })
})
