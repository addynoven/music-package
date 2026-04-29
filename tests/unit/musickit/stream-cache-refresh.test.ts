import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData } from '../../helpers/mock-factory'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { RetryEngine } from '../../../src/retry'
import { DiscoveryClient } from '../../../src/discovery'
import { StreamResolver } from '../../../src/stream'
import { Cache } from '../../../src/cache'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}))

const freshStream = makeStreamingData({ codec: 'mp4a' })
let mockCacheStore: Map<string, any>

;(Cache as any).mockImplementation(() => {
  mockCacheStore = new Map()
  return {
    get: vi.fn((key: string) => mockCacheStore.get(key) ?? null),
    set: vi.fn((key: string, val: any) => mockCacheStore.set(key, val)),
    delete: vi.fn((key: string) => mockCacheStore.delete(key)),
    isUrlExpired: vi.fn(() => false),
  }
})

const mockYTSource = {
  name: 'youtube-music',
  canHandle: vi.fn(() => true),
  search: vi.fn(),
  getStream: vi.fn().mockResolvedValue(freshStream),
  getMetadata: vi.fn(),
}

vi.mock('../../../src/sources/youtube-music', () => ({
  YouTubeMusicSource: vi.fn().mockImplementation(() => mockYTSource),
}))

;(StreamResolver as any).mockImplementation(() => ({}))

afterEach(() => vi.useRealTimers())
beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getStream', () => {
  it('calls YouTube source getStream for a video ID', async () => {
    const mk = new MusicKit()
    const result = await mk.getStream('dQw4w9WgXcQ')
    expect(mockYTSource.getStream).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
    expect(result.codec).toBe('mp4a')
  })

  it('resolves YouTube URL before fetching stream', async () => {
    const mk = new MusicKit()
    await mk.getStream('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(mockYTSource.getStream).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
  })
})
