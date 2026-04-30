import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'

vi.mock('youtubei.js', () => ({
  Innertube: { create: vi.fn().mockResolvedValue({}) },
  ClientType: {
    WEB: 'WEB', MWEB: 'MWEB', KIDS: 'WEB_KIDS', MUSIC: 'WEB_REMIX',
    IOS: 'iOS', ANDROID: 'ANDROID', ANDROID_VR: 'ANDROID_VR',
    ANDROID_MUSIC: 'ANDROID_MUSIC', ANDROID_CREATOR: 'ANDROID_CREATOR',
    TV: 'TVHTML5', TV_SIMPLY: 'TVHTML5_SIMPLY',
    TV_EMBEDDED: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    WEB_EMBEDDED: 'WEB_EMBEDDED_PLAYER', WEB_CREATOR: 'WEB_CREATOR',
  },
}))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

// Mock all 7 lyrics modules so the registry never hits the network.
// vi.hoisted() lets us reference these mock functions inside vi.mock() factories,
// which run before any top-level statements due to Vitest's hoisting.
const { mockLrclibFn, mockLyricsOvhFn, mockBetterFn, mockKugouFn, mockSimpFn } = vi.hoisted(() => ({
  mockLrclibFn: vi.fn(),
  mockLyricsOvhFn: vi.fn(),
  mockBetterFn: vi.fn(),
  mockKugouFn: vi.fn(),
  mockSimpFn: vi.fn(),
}))

vi.mock('../../../src/lyrics/lrclib', () => ({
  fetchFromLrclib: mockLrclibFn,
  lrclibProvider: { name: 'lrclib', fetch: mockLrclibFn },
}))
vi.mock('../../../src/lyrics/lyrics-ovh', () => ({
  fetchFromLyricsOvh: mockLyricsOvhFn,
  lyricsOvhProvider: { name: 'lyrics-ovh', fetch: mockLyricsOvhFn },
}))
vi.mock('../../../src/lyrics/better-lyrics', () => ({
  fetchFromBetterLyrics: mockBetterFn,
  betterLyricsProvider: { name: 'better-lyrics', fetch: mockBetterFn },
  BETTER_LYRICS_BASE: 'https://lyrics-api.boidu.dev',
}))
vi.mock('../../../src/lyrics/kugou', () => ({
  fetchFromKuGou: mockKugouFn,
  kugouProvider: { name: 'kugou', fetch: mockKugouFn },
  KUGOU_SEARCH_BASE: 'https://mobileservice.kugou.com',
  KUGOU_LYRICS_BASE: 'https://lyrics.kugou.com',
}))
vi.mock('../../../src/lyrics/simpmusic', () => ({
  fetchFromSimpMusic: mockSimpFn,
  simpMusicProvider: { name: 'simpmusic', fetch: mockSimpFn },
}))

// YT-backed providers — instantiated by MusicKit with the (mocked-empty) yt instance.
// Their fetch returns null so the chain falls through cleanly to non-YT providers.
vi.mock('../../../src/lyrics/youtube-native', () => ({
  YouTubeNativeLyricsProvider: class {
    name = 'youtube-native'
    async fetch() { return null }
  },
}))
vi.mock('../../../src/lyrics/youtube-subtitle', () => ({
  YouTubeSubtitleLyricsProvider: class {
    name = 'youtube-subtitle'
    async fetch() { return null }
  },
}))

import { RetryEngine } from '../../../src/retry'
import { Cache } from '../../../src/cache'
import { DiscoveryClient } from '../../../src/discovery'

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

const mockMeta = { type: 'song', videoId: 'dQw4w9WgXcQ', title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 262, thumbnails: [] }

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
  getInfo: vi.fn().mockResolvedValue(mockMeta),
}))

beforeEach(() => vi.clearAllMocks())

const MOCK_LYRICS = {
  plain: 'Tum hi ho, aashiqui ab tum hi ho',
  synced: [{ time: 11.2, text: 'Tum hi ho' }],
}

describe('MusicKit — getLyrics', () => {
  it('returns Lyrics with plain and synced when LRCLIB responds (per-call override)', async () => {
    mockLrclibFn.mockResolvedValue(MOCK_LYRICS)
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('dQw4w9WgXcQ', { providers: ['lrclib'] })
    // Result includes the new `source` field tagging which provider produced it
    expect(lyrics).toMatchObject({ ...MOCK_LYRICS, source: 'lrclib' })
  })

  it('calls LRCLIB with sanitised title and artist + videoId from metadata', async () => {
    mockLrclibFn.mockResolvedValue(MOCK_LYRICS)
    const mk = new MusicKit()
    await mk.getLyrics('dQw4w9WgXcQ', { providers: ['lrclib'] })
    // Now passes 5 args: artist, title, duration, fetchFn, videoId
    expect(mockLrclibFn).toHaveBeenCalledWith('Arijit Singh', 'Tum Hi Ho', 262, expect.any(Function), 'dQw4w9WgXcQ')
  })

  it('falls back to lyrics.ovh when LRCLIB returns null', async () => {
    mockLrclibFn.mockResolvedValue(null)
    mockLyricsOvhFn.mockResolvedValue({ plain: 'fallback lyrics', synced: null })
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('dQw4w9WgXcQ', { providers: ['lrclib', 'lyrics-ovh'] })
    expect(mockLyricsOvhFn).toHaveBeenCalled()
    expect(lyrics).toMatchObject({ plain: 'fallback lyrics', synced: null, source: 'lyrics-ovh' })
  })

  it('returns null when every provider in the chain returns null', async () => {
    mockLrclibFn.mockResolvedValue(null)
    mockLyricsOvhFn.mockResolvedValue(null)
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('dQw4w9WgXcQ', { providers: ['lrclib', 'lyrics-ovh'] })
    expect(lyrics).toBeNull()
  })

  it('does not call lyrics.ovh when LRCLIB succeeds', async () => {
    mockLrclibFn.mockResolvedValue(MOCK_LYRICS)
    const mk = new MusicKit()
    await mk.getLyrics('dQw4w9WgXcQ', { providers: ['lrclib', 'lyrics-ovh'] })
    expect(mockLyricsOvhFn).not.toHaveBeenCalled()
  })

  it('default chain tries BetterLyrics first, then LRCLIB', async () => {
    mockBetterFn.mockResolvedValue(MOCK_LYRICS)
    mockLrclibFn.mockResolvedValue(null)
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('dQw4w9WgXcQ')
    expect(mockBetterFn).toHaveBeenCalled()
    expect(mockLrclibFn).not.toHaveBeenCalled()
    expect(lyrics).toMatchObject({ source: 'better-lyrics' })
  })

  it('throws ValidationError on unknown provider name in per-call override', async () => {
    const mk = new MusicKit()
    await expect(mk.getLyrics('dQw4w9WgXcQ', { providers: ['nope' as any] })).rejects.toMatchObject({
      name: 'ValidationError',
    })
  })

  it('per-call override accepts a custom LyricsProvider instance', async () => {
    const custom = { name: 'lrclib' as const, fetch: vi.fn().mockResolvedValue({ plain: 'custom', synced: null }) }
    const mk = new MusicKit()
    const lyrics = await mk.getLyrics('dQw4w9WgXcQ', { providers: [custom] })
    expect(custom.fetch).toHaveBeenCalled()
    expect(lyrics).toMatchObject({ plain: 'custom', source: 'lrclib' })
  })
})
