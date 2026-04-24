import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

// Mock the lyrics fetchers so tests don't hit the network
vi.mock('../../../src/lyrics/lrclib', () => ({
  fetchFromLrclib: vi.fn(),
}))
vi.mock('../../../src/lyrics/lyrics-ovh', () => ({
  fetchFromLyricsOvh: vi.fn(),
}))

import { RetryEngine } from '../../../src/retry'
import { Cache } from '../../../src/cache'
import { DiscoveryClient } from '../../../src/discovery'
import { fetchFromLrclib } from '../../../src/lyrics/lrclib'
import { fetchFromLyricsOvh } from '../../../src/lyrics/lyrics-ovh'

const mockLrclib = vi.mocked(fetchFromLrclib)
const mockLyricsOvh = vi.mocked(fetchFromLyricsOvh)

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))
;(Cache as any).mockImplementation(() => ({
  get: vi.fn().mockReturnValue(null),
  set: vi.fn(),
  delete: vi.fn(),
  isUrlExpired: vi.fn().mockReturnValue(true),
  close: vi.fn(),
}))

const mockMeta = { type: 'song', videoId: 'jio:abc123', title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 262, thumbnails: [] }

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => ({
    name: 'jiosaavn',
    canHandle: vi.fn((q: string) => q.startsWith('jio:') || !/youtube|youtu\.be|^[A-Za-z0-9_-]{11}$/.test(q)),
    search: vi.fn(),
    getStream: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue(mockMeta),
  })),
  JIOSAAVN_LANGUAGES: [],
}))

beforeEach(() => vi.clearAllMocks())

const MOCK_LYRICS = {
  plain: 'Tum hi ho, aashiqui ab tum hi ho',
  synced: [{ time: 11.2, text: 'Tum hi ho' }],
}

describe('MusicKit — getLyrics', () => {
  it('returns Lyrics object with plain and synced when LRCLIB responds', async () => {
    mockLrclib.mockResolvedValue(MOCK_LYRICS)
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('jio:abc123')
    expect(lyrics).toEqual(MOCK_LYRICS)
  })

  it('calls LRCLIB with sanitised title and artist from metadata', async () => {
    mockLrclib.mockResolvedValue(MOCK_LYRICS)
    const mk = new MusicKit()
    await mk.getLyrics('jio:abc123')
    expect(mockLrclib).toHaveBeenCalledWith('Arijit Singh', 'Tum Hi Ho')
  })

  it('falls back to lyrics.ovh when LRCLIB returns null', async () => {
    mockLrclib.mockResolvedValue(null)
    mockLyricsOvh.mockResolvedValue({ plain: 'fallback lyrics', synced: null })
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('jio:abc123')
    expect(mockLyricsOvh).toHaveBeenCalledWith('Arijit Singh', 'Tum Hi Ho')
    expect(lyrics).toEqual({ plain: 'fallback lyrics', synced: null })
  })

  it('returns null when both LRCLIB and lyrics.ovh return null', async () => {
    mockLrclib.mockResolvedValue(null)
    mockLyricsOvh.mockResolvedValue(null)
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('jio:abc123')
    expect(lyrics).toBeNull()
  })

  it('does not call lyrics.ovh when LRCLIB succeeds', async () => {
    mockLrclib.mockResolvedValue(MOCK_LYRICS)
    const mk = new MusicKit()
    await mk.getLyrics('jio:abc123')
    expect(mockLyricsOvh).not.toHaveBeenCalled()
  })
})
