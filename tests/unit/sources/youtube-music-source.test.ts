import { describe, it, expect, beforeEach, vi } from 'vitest'
import { YouTubeMusicSource } from '../../../src/sources/youtube-music'
import { Cache } from '../../../src/cache'

function makeDiscovery() {
  return {
    search: vi.fn(),
    getInfo: vi.fn(),
    getHome: vi.fn(),
    getArtist: vi.fn(),
    getAlbum: vi.fn(),
    getRadio: vi.fn(),
    getRelated: vi.fn(),
    getCharts: vi.fn(),
    autocomplete: vi.fn(),
  }
}

function makeResolver() {
  return {
    resolve: vi.fn(),
  }
}

function makeSongItem() {
  return {
    type: 'song' as const,
    videoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    duration: 213,
    thumbnails: [],
  }
}

function makeStreamingData() {
  return {
    url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
    codec: 'opus' as const,
    bitrate: 160_000,
    expiresAt: 9999999999,
  }
}

describe('YouTubeMusicSource', () => {
  let discovery: ReturnType<typeof makeDiscovery>
  let resolver: ReturnType<typeof makeResolver>
  let source: YouTubeMusicSource

  beforeEach(() => {
    vi.clearAllMocks()
    discovery = makeDiscovery()
    resolver = makeResolver()
    source = new YouTubeMusicSource(discovery as any, resolver as any)
  })

  // ─── canHandle ────────────────────────────────────────────────────────────

  describe('canHandle', () => {
    it('returns true for plain text search queries', () => {
      expect(source.canHandle('arijit singh')).toBe(true)
    })

    it('returns true for youtube.com URLs', () => {
      expect(source.canHandle('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    })

    it('returns true for youtu.be short URLs', () => {
      expect(source.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    })

    it('returns true for music.youtube.com URLs', () => {
      expect(source.canHandle('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    })

    it('returns true for any non-jio: input — it is the catch-all source', () => {
      expect(source.canHandle('some random string')).toBe(true)
      expect(source.canHandle('')).toBe(true)
    })

    it('returns false for jio: prefixed IDs — YouTube cannot handle JioSaavn IDs', () => {
      expect(source.canHandle('jio:abc123')).toBe(false)
      expect(source.canHandle('jio:EuIdJygC')).toBe(false)
    })
  })

  // ─── name ─────────────────────────────────────────────────────────────────

  describe('name', () => {
    it('has name "youtube-music"', () => {
      expect(source.name).toBe('youtube-music')
    })
  })

  // ─── search ───────────────────────────────────────────────────────────────

  describe('search', () => {
    it('delegates to DiscoveryClient and returns results', async () => {
      const expected = { songs: [makeSongItem()], albums: [], artists: [], playlists: [] }
      discovery.search.mockResolvedValue(expected)

      const result = await source.search('rick astley')

      expect(discovery.search).toHaveBeenCalledWith('rick astley', {})
      expect(result).toEqual(expected)
    })

    it('passes filter option through to DiscoveryClient', async () => {
      discovery.search.mockResolvedValue([makeSongItem()])

      await source.search('rick astley', { filter: 'songs' })

      expect(discovery.search).toHaveBeenCalledWith('rick astley', { filter: 'songs' })
    })

    it('returns empty results when DiscoveryClient finds nothing', async () => {
      discovery.search.mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] })

      const result = await source.search('xyzzy-not-a-song') as any

      expect(result.songs).toHaveLength(0)
    })
  })

  // ─── getStream ────────────────────────────────────────────────────────────

  describe('getStream', () => {
    it('delegates to StreamResolver and returns StreamingData', async () => {
      resolver.resolve.mockResolvedValue(makeStreamingData())

      const result = await source.getStream('dQw4w9WgXcQ')

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
      expect(result.url).toContain('googlevideo.com')
      expect(result.codec).toBe('opus')
    })

    it('passes quality string through to StreamResolver', async () => {
      resolver.resolve.mockResolvedValue(makeStreamingData())

      await source.getStream('dQw4w9WgXcQ', 'low')

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', 'low')
    })

    it('defaults to high quality when no option given', async () => {
      resolver.resolve.mockResolvedValue(makeStreamingData())

      await source.getStream('dQw4w9WgXcQ')

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
    })
  })

  // ─── getMetadata ──────────────────────────────────────────────────────────

  describe('getMetadata', () => {
    it('delegates to DiscoveryClient.getInfo and returns a Song', async () => {
      const song = makeSongItem()
      discovery.getInfo.mockResolvedValue(song)

      const result = await source.getMetadata('dQw4w9WgXcQ')

      expect(discovery.getInfo).toHaveBeenCalledWith('dQw4w9WgXcQ')
      expect(result.type).toBe('song')
      expect(result.videoId).toBe('dQw4w9WgXcQ')
      expect(result.title).toBe('Never Gonna Give You Up')
    })

    it('throws when DiscoveryClient throws', async () => {
      discovery.getInfo.mockRejectedValue(new Error('Video unavailable'))

      await expect(source.getMetadata('bad-id')).rejects.toThrow('Video unavailable')
    })
  })
})
