import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'

// ─── youtubei.js boundary ────────────────────────────────────────────────────
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

// ─── internal collaborators ──────────────────────────────────────────────────
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

// ─── lyrics providers (required by MusicKit constructor path) ─────────────────
vi.mock('../../../src/lyrics/lrclib', () => ({
  fetchFromLrclib: vi.fn(),
  lrclibProvider: { name: 'lrclib', fetch: vi.fn() },
}))
vi.mock('../../../src/lyrics/lyrics-ovh', () => ({
  fetchFromLyricsOvh: vi.fn(),
  lyricsOvhProvider: { name: 'lyrics-ovh', fetch: vi.fn() },
}))
vi.mock('../../../src/lyrics/better-lyrics', () => ({
  fetchFromBetterLyrics: vi.fn(),
  betterLyricsProvider: { name: 'better-lyrics', fetch: vi.fn() },
  BETTER_LYRICS_BASE: 'https://lyrics-api.boidu.dev',
}))
vi.mock('../../../src/lyrics/kugou', () => ({
  fetchFromKuGou: vi.fn(),
  kugouProvider: { name: 'kugou', fetch: vi.fn() },
  KUGOU_SEARCH_BASE: 'https://mobileservice.kugou.com',
  KUGOU_LYRICS_BASE: 'https://lyrics.kugou.com',
}))
vi.mock('../../../src/lyrics/simpmusic', () => ({
  fetchFromSimpMusic: vi.fn(),
  simpMusicProvider: { name: 'simpmusic', fetch: vi.fn() },
}))
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
import type { Analysis, AnalysisProvider } from '../../../src/analysis/types'
import { makeAnalysis } from '../../helpers/mock-factory'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockCacheGet = vi.fn().mockReturnValue(null)
const mockCacheSet = vi.fn()
;(Cache as any).mockImplementation(() => ({
  get: mockCacheGet,
  set: mockCacheSet,
  delete: vi.fn(),
  isUrlExpired: vi.fn().mockReturnValue(true),
  close: vi.fn(),
}))

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
  getInfo: vi.fn().mockResolvedValue({
    type: 'song', videoId: 'dQw4w9WgXcQ', title: 'Test Song', artist: 'Test Artist', duration: 180, thumbnails: [],
  }),
}))

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MusicKit — getAnalysis', () => {
  let mk: MusicKit
  let mockProvider: { name: string; analyze: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockProvider = { name: 'essentia', analyze: vi.fn().mockResolvedValue(makeAnalysis()) }
    mk = new MusicKit({ logLevel: 'silent', analysis: { provider: mockProvider } })
  })

  // ─── happy path ───────────────────────────────────────────────────────────

  it('returns an Analysis object on first call', async () => {
    const result = await mk.getAnalysis('dQw4w9WgXcQ')

    expect(result).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      tempo: { bpm: expect.any(Number), confidence: expect.any(Number) },
      onsets: expect.any(Array),
      analyzedAt: expect.any(String),
    })
  })

  it('calls the provider with the videoId', async () => {
    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(mockProvider.analyze).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.any(Uint8Array))
  })

  it('calls the provider only once on first call (no cache hit)', async () => {
    mockCacheGet.mockReturnValue(null)
    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(mockProvider.analyze).toHaveBeenCalledTimes(1)
  })

  // ─── caching ──────────────────────────────────────────────────────────────

  it('emits cacheMiss on first call', async () => {
    const events: string[] = []
    mk.on('cacheMiss', (key) => events.push(`miss:${key}`))
    mockCacheGet.mockReturnValue(null)
    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(events).toContain('miss:analysis:dQw4w9WgXcQ')
  })

  it('stores result in cache with ANALYSIS TTL on success', async () => {
    mockCacheGet.mockReturnValue(null)
    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(mockCacheSet).toHaveBeenCalledWith(
      'analysis:dQw4w9WgXcQ',
      expect.objectContaining({ videoId: 'dQw4w9WgXcQ' }),
      Cache.TTL.ANALYSIS,
    )
  })

  it('returns cached result on second call without calling provider', async () => {
    const cached = makeAnalysis()
    mockCacheGet.mockReturnValue(cached)

    const result = await mk.getAnalysis('dQw4w9WgXcQ')

    expect(result).toEqual(cached)
    expect(mockProvider.analyze).not.toHaveBeenCalled()
  })

  it('emits cacheHit when cache returns a result', async () => {
    const events: string[] = []
    mk.on('cacheHit', (key) => events.push(`hit:${key}`))
    mockCacheGet.mockReturnValue(makeAnalysis())

    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(events).toContain('hit:analysis:dQw4w9WgXcQ')
  })

  it('does not update the cache when cache returns a result', async () => {
    mockCacheGet.mockReturnValue(makeAnalysis())
    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  // ─── in-flight dedup ──────────────────────────────────────────────────────

  it('two parallel calls with the same videoId invoke provider exactly once', async () => {
    mockCacheGet.mockReturnValue(null)
    let resolve!: (v: Analysis) => void
    const pending = new Promise<Analysis>((r) => { resolve = r })
    mockProvider.analyze.mockReturnValue(pending)

    const p1 = mk.getAnalysis('dQw4w9WgXcQ')
    const p2 = mk.getAnalysis('dQw4w9WgXcQ')

    resolve(makeAnalysis())
    const [r1, r2] = await Promise.all([p1, p2])

    expect(mockProvider.analyze).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
  })

  it('two parallel calls with different videoIds invoke provider twice', async () => {
    mockCacheGet.mockReturnValue(null)
    mockProvider.analyze
      .mockResolvedValueOnce(makeAnalysis({ videoId: 'aaaaaaaaaaaaa' }))
      .mockResolvedValueOnce(makeAnalysis({ videoId: 'bbbbbbbbbbbbb' }))

    const [r1, r2] = await Promise.all([
      mk.getAnalysis('aaaaaaaaaaaaa'),
      mk.getAnalysis('bbbbbbbbbbbbb'),
    ])

    expect(mockProvider.analyze).toHaveBeenCalledTimes(2)
    expect(r1.videoId).toBe('aaaaaaaaaaaaa')
    expect(r2.videoId).toBe('bbbbbbbbbbbbb')
  })

  // ─── error path ───────────────────────────────────────────────────────────

  it('propagates provider errors to the caller', async () => {
    mockCacheGet.mockReturnValue(null)
    mockProvider.analyze.mockRejectedValue(new Error('analysis failed'))
    await expect(mk.getAnalysis('dQw4w9WgXcQ')).rejects.toThrow()
  })

  it('does not update the cache when the provider throws', async () => {
    mockCacheGet.mockReturnValue(null)
    mockProvider.analyze.mockRejectedValue(new Error('boom'))
    await expect(mk.getAnalysis('dQw4w9WgXcQ')).rejects.toThrow()
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it('clears the dedup key after a rejection so a retry can proceed', async () => {
    mockCacheGet.mockReturnValue(null)
    const okAnalysis = makeAnalysis()
    mockProvider.analyze
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce(okAnalysis)

    await expect(mk.getAnalysis('dQw4w9WgXcQ')).rejects.toThrow()
    const result = await mk.getAnalysis('dQw4w9WgXcQ')
    expect(result).toEqual(okAnalysis)
    expect(mockProvider.analyze).toHaveBeenCalledTimes(2)
  })

  // ─── custom provider override ──────────────────────────────────────────────

  it('uses the custom provider passed via config instead of the default', async () => {
    const customAnalysis = makeAnalysis({ videoId: 'custom-vid', tempo: { bpm: 99, confidence: 0.5, beatGrid: [] } })
    const customProvider: AnalysisProvider = {
      name: 'custom',
      analyze: vi.fn().mockResolvedValue(customAnalysis),
    }

    const customMk = new MusicKit({ logLevel: 'silent', analysis: { provider: customProvider } })
    const result = await customMk.getAnalysis('custom-vid')

    expect((customProvider.analyze as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('custom-vid', expect.any(Uint8Array))
    expect(result.tempo.bpm).toBe(99)
  })

  // ─── schema validation ────────────────────────────────────────────────────

  it('returned result validates against the Analysis shape', async () => {
    const result = await mk.getAnalysis('dQw4w9WgXcQ')

    expect(typeof result.videoId).toBe('string')
    expect(typeof result.duration).toBe('number')
    expect(typeof result.tempo.bpm).toBe('number')
    expect(typeof result.tempo.confidence).toBe('number')
    expect(Array.isArray(result.onsets)).toBe(true)
    expect(typeof result.analyzedAt).toBe('string')
  })

  // ─── event emission ───────────────────────────────────────────────────────

  it('emits beforeRequest before calling the provider', async () => {
    const events: string[] = []
    mk.on('beforeRequest', (req) => events.push(req.endpoint))
    mockCacheGet.mockReturnValue(null)

    await mk.getAnalysis('dQw4w9WgXcQ')
    expect(events).toContain('analysis')
  })
})
