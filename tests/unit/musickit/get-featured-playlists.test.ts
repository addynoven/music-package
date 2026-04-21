import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makePlaylist } from '../../helpers/mock-factory'

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

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}))

const mockGetFeaturedPlaylists = vi.fn().mockResolvedValue([makePlaylist(), makePlaylist({ playlistId: 'jio:pl2', title: 'Hindi Hits' })])

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
  getHome: vi.fn().mockResolvedValue([]),
  getFeaturedPlaylists: mockGetFeaturedPlaylists,
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))
vi.mock('../../../src/sources/youtube-music', () => ({
  YouTubeMusicSource: vi.fn().mockImplementation(() => ({
    name: 'youtube-music',
    canHandle: vi.fn(() => true),
    search: vi.fn(),
    getStream: vi.fn(),
    getMetadata: vi.fn(),
  })),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getFeaturedPlaylists', () => {
  it('routes to the first source that implements getFeaturedPlaylists', async () => {
    const mk = new MusicKit()
    await mk.getFeaturedPlaylists()
    expect(mockGetFeaturedPlaylists).toHaveBeenCalled()
  })

  it('passes language option to source', async () => {
    const mk = new MusicKit()
    await mk.getFeaturedPlaylists({ language: 'tamil' })
    expect(mockGetFeaturedPlaylists).toHaveBeenCalledWith('tamil')
  })

  it('passes undefined when no language option given', async () => {
    const mk = new MusicKit()
    await mk.getFeaturedPlaylists()
    expect(mockGetFeaturedPlaylists).toHaveBeenCalledWith(undefined)
  })

  it('returns Playlist[]', async () => {
    const mk = new MusicKit()
    const result = await mk.getFeaturedPlaylists()
    expect(Array.isArray(result)).toBe(true)
    result.forEach(p => expect(p.type).toBe('playlist'))
  })

  it('returns empty array when no source implements getFeaturedPlaylists', async () => {
    const sourceWithoutMethod = { ...mockJioSaavnSource }
    delete (sourceWithoutMethod as any).getFeaturedPlaylists
    const { JioSaavnSource } = await import('../../../src/sources/jiosaavn')
    ;(JioSaavnSource as any).mockImplementationOnce(() => sourceWithoutMethod)

    const mk = new MusicKit()
    const result = await mk.getFeaturedPlaylists()
    expect(result).toEqual([])
  })
})
