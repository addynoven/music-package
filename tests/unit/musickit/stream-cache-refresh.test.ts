import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData } from '../../helpers/mock-factory'

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
