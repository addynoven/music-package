import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

// ─── Mock sources ─────────────────────────────────────────────────────────────

const mockJioSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => !q.match(/youtube\.com|youtu\.be/) && !q.match(/^[A-Za-z0-9_-]{11}$/)),
  search: vi.fn().mockResolvedValue([]),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
  getHome: vi.fn().mockResolvedValue([]),
  getFeaturedPlaylists: vi.fn().mockResolvedValue([]),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSource),
  JIOSAAVN_LANGUAGES: new Set(['hindi', 'english']),
}))

const mockYtSource = {
  name: 'youtube-music',
  canHandle: vi.fn((q: string) => !q.startsWith('jio:')),
  search: vi.fn().mockResolvedValue([]),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
}

vi.mock('../../../src/sources/youtube-music', () => ({
  YouTubeMusicSource: vi.fn().mockImplementation(() => mockYtSource),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockJioSource.canHandle.mockImplementation(
    (q: string) => !q.match(/youtube\.com|youtu\.be/) && !q.match(/^[A-Za-z0-9_-]{11}$/),
  )
  mockYtSource.canHandle.mockImplementation((q: string) => !q.startsWith('jio:'))
  mockJioSource.search.mockResolvedValue([])
  mockYtSource.search.mockResolvedValue([])
})

// ─── Config-level: sourceOrder ────────────────────────────────────────────────

describe('MusicKit — sourceOrder config', () => {
  describe('omitted / "best" — YouTube first (default)', () => {
    it('routes a plain-text search to YouTube when no sourceOrder is given', async () => {
      const mk = new MusicKit()
      await mk.search('hips dont lie', { filter: 'songs' })
      expect(mockYtSource.search).toHaveBeenCalled()
      expect(mockJioSource.search).not.toHaveBeenCalled()
    })

    it('registers YouTube as sources[0] and JioSaavn as sources[1]', async () => {
      const mk = new MusicKit()
      await mk.search('test')
      expect(mk.sources[0].name).toBe('youtube-music')
      expect(mk.sources[1].name).toBe('jiosaavn')
    })

    it('still routes jio: IDs to JioSaavn — YouTube cannot handle them', async () => {
      mockJioSource.getStream.mockResolvedValue({ url: 'https://cdn.jiosaavn.com/test', codec: 'mp4a', bitrate: 96000, expiresAt: 0 })
      const mk = new MusicKit()
      await mk.getStream('jio:abc123')
      expect(mockJioSource.getStream).toHaveBeenCalledWith('jio:abc123', 'high')
      expect(mockYtSource.getStream).not.toHaveBeenCalled()
    })
  })

  describe('"default" preset — JioSaavn first (opt-in for regional apps)', () => {
    it('routes a plain-text search to JioSaavn', async () => {
      const mk = new MusicKit({ sourceOrder: 'default' })
      await mk.search('hips dont lie', { filter: 'songs' })
      expect(mockJioSource.search).toHaveBeenCalled()
      expect(mockYtSource.search).not.toHaveBeenCalled()
    })

    it('registers JioSaavn as sources[0]', async () => {
      const mk = new MusicKit({ sourceOrder: 'default' })
      await mk.search('test')
      expect(mk.sources[0].name).toBe('jiosaavn')
    })
  })

  describe('explicit array ordering', () => {
    it("['youtube', 'jiosaavn'] behaves like 'best'", async () => {
      const mk = new MusicKit({ sourceOrder: ['youtube', 'jiosaavn'] })
      await mk.search('test')
      expect(mk.sources[0].name).toBe('youtube-music')
      expect(mk.sources[1].name).toBe('jiosaavn')
    })

    it("['jiosaavn'] registers only JioSaavn — no YouTube source", async () => {
      const mk = new MusicKit({ sourceOrder: ['jiosaavn'] })
      await mk.search('test')
      expect(mk.sources).toHaveLength(1)
      expect(mk.sources[0].name).toBe('jiosaavn')
    })

    it("['youtube'] registers only YouTube — no JioSaavn source", async () => {
      const mk = new MusicKit({ sourceOrder: ['youtube'] })
      await mk.search('test')
      expect(mk.sources).toHaveLength(1)
      expect(mk.sources[0].name).toBe('youtube-music')
    })
  })
})

// ─── Method-level: source option ─────────────────────────────────────────────

describe('MusicKit — per-call source override', () => {
  describe('search({ source })', () => {
    it('source: "youtube" sends the search to YouTube even with default order', async () => {
      const mk = new MusicKit() // default = jio first
      await mk.search('hips dont lie', { filter: 'songs', source: 'youtube' })
      expect(mockYtSource.search).toHaveBeenCalled()
      expect(mockJioSource.search).not.toHaveBeenCalled()
    })

    it('source: "jiosaavn" sends the search to JioSaavn even with best order', async () => {
      const mk = new MusicKit({ sourceOrder: 'best' }) // yt first
      await mk.search('hips dont lie', { filter: 'songs', source: 'jiosaavn' })
      expect(mockJioSource.search).toHaveBeenCalled()
      expect(mockYtSource.search).not.toHaveBeenCalled()
    })

    it('passes filter and limit options to the source', async () => {
      const mk = new MusicKit()
      await mk.search('shakira', { filter: 'songs', limit: 5, source: 'youtube' })
      expect(mockYtSource.search).toHaveBeenCalledWith(
        'shakira',
        expect.objectContaining({ filter: 'songs', limit: 5 }),
      )
    })

    it('throws when the override source is not registered', async () => {
      const mk = new MusicKit({ sourceOrder: ['jiosaavn'] }) // youtube not registered
      await expect(mk.search('test', { source: 'youtube' })).rejects.toThrow()
    })
  })

  describe('getHome({ source })', () => {
    it('source: "youtube" calls _discovery.getHome, not JioSaavn getHome', async () => {
      const mk = new MusicKit()
      await mk.search('') // trigger ensureClients
      // getHome with source: 'youtube' should use discovery
      // We verify by checking JioSaavn's getHome was NOT called
      const { DiscoveryClient } = await import('../../../src/discovery')
      const discInst = (DiscoveryClient as any).mock.results[0]?.value
      if (discInst?.getHome) discInst.getHome.mockResolvedValue([])

      await mk.getHome({ source: 'youtube' })

      expect(mockJioSource.getHome).not.toHaveBeenCalled()
    })

    it('source: "jiosaavn" calls JioSaavn getHome directly', async () => {
      const mk = new MusicKit({ sourceOrder: 'best' }) // yt first by default
      await mk.getHome({ source: 'jiosaavn' })
      expect(mockJioSource.getHome).toHaveBeenCalled()
    })
  })

  describe('getFeaturedPlaylists({ source })', () => {
    it('source: "jiosaavn" calls JioSaavn getFeaturedPlaylists', async () => {
      const mk = new MusicKit({ sourceOrder: 'best' })
      await mk.getFeaturedPlaylists({ source: 'jiosaavn' })
      expect(mockJioSource.getFeaturedPlaylists).toHaveBeenCalled()
    })
  })
})
