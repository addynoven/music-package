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
vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => ({
    name: 'jiosaavn',
    canHandle: vi.fn(() => false),
  })),
  JIOSAAVN_LANGUAGES: new Set(),
}))

import { RetryEngine } from '../../../src/retry'
import { Cache } from '../../../src/cache'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))
;(Cache as any).mockImplementation(() => ({
  get: vi.fn().mockReturnValue(null),
  set: vi.fn(),
  delete: vi.fn(),
  close: vi.fn(),
}))

const MOCK_PODCAST = {
  type: 'podcast' as const,
  feedUrl: 'https://example.com/feed.rss',
  title: 'Test Podcast',
  description: 'A test podcast',
  author: 'Test Author',
  language: 'en',
  link: 'https://example.com',
  thumbnails: [],
  episodes: [],
}

const mockGetFeed = vi.fn()

vi.mock('../../../src/podcast', () => ({
  PodcastClient: vi.fn().mockImplementation(() => ({ getFeed: mockGetFeed })),
}))

import { PodcastClient } from '../../../src/podcast'

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getPodcast()', () => {
  it('delegates to PodcastClient.getFeed and returns the result', async () => {
    mockGetFeed.mockResolvedValue(MOCK_PODCAST)
    const mk = new MusicKit()

    const result = await mk.getPodcast('https://example.com/feed.rss')

    expect(mockGetFeed).toHaveBeenCalledWith('https://example.com/feed.rss')
    expect(result).toEqual(MOCK_PODCAST)
  })

  it('reuses the same PodcastClient instance across calls', async () => {
    mockGetFeed.mockResolvedValue(MOCK_PODCAST)
    const mk = new MusicKit()

    await mk.getPodcast('https://example.com/feed.rss')
    await mk.getPodcast('https://example.com/feed2.rss')

    expect(PodcastClient).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from PodcastClient.getFeed', async () => {
    mockGetFeed.mockRejectedValue(new Error('RSS fetch failed: 404'))
    const mk = new MusicKit()

    await expect(mk.getPodcast('https://example.com/bad.rss'))
      .rejects.toThrow('RSS fetch failed: 404')
  })
})
