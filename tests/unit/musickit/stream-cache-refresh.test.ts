import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData, makeExpiredStreamingData } from '../../helpers/mock-factory'

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
const expiredStream = makeExpiredStreamingData()

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

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn().mockResolvedValue(freshStream),
  getMetadata: vi.fn(),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

afterEach(() => vi.useRealTimers())
beforeEach(() => vi.clearAllMocks())

describe('MusicKit — stream cache with auto-refresh', () => {
  it('caches jio: stream after first fetch', async () => {
    const mk = new MusicKit()
    await mk.getStream('jio:abc123')
    await mk.getStream('jio:abc123')
    expect(mockJioSaavnSource.getStream).toHaveBeenCalledTimes(1)
  })

  it('re-fetches jio: stream when cached stream is expired', async () => {
    const mk = new MusicKit()
    // First call: caches the stream
    await mk.getStream('jio:abc123')
    // Manually put an expired stream in cache
    mockCacheStore.set('stream:jio:abc123:high', expiredStream)
    // Second call: should detect expiry and re-fetch
    await mk.getStream('jio:abc123')
    expect(mockJioSaavnSource.getStream).toHaveBeenCalledTimes(2)
  })

  it('returns fresh stream data after re-fetch', async () => {
    const mk = new MusicKit()
    mockCacheStore.set('stream:jio:abc123:high', expiredStream)
    const result = await mk.getStream('jio:abc123')
    expect(result.codec).toBe('mp4a')
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })
})
