import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))

import { DiscoveryClient } from '../../../src/discovery'

const mockGetRelated = vi.fn()
const mockGetUpNext = vi.fn()

const mockYt = {
  music: {
    getRelated: mockGetRelated,
    getUpNext: mockGetUpNext,
    search: vi.fn().mockResolvedValue({ contents: [] }),
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUpNext.mockResolvedValue({ contents: [] })
})

describe('DiscoveryClient — getRelated fallback', () => {
  it('returns songs from getRelated when it works', async () => {
    mockGetRelated.mockResolvedValue({
      contents: [{ contents: [{ id: 'abc', title: { runs: [{ text: 'Song' }] }, subtitle: { runs: [{ text: 'Artist' }] }, duration: { seconds: 200 }, thumbnails: [] }] }]
    })
    const client = new DiscoveryClient(mockYt as any)
    const songs = await client.getRelated('abc')
    expect(songs.length).toBeGreaterThan(0)
    expect(mockGetUpNext).not.toHaveBeenCalled()
  })

  it('falls back to getUpNext when getRelated throws "Could not find target tab"', async () => {
    mockGetRelated.mockRejectedValue(new Error('Could not find target tab.'))
    mockGetUpNext.mockResolvedValue({
      contents: [{ id: 'xyz', title: { runs: [{ text: 'Fallback Song' }] }, subtitle: { runs: [{ text: 'Artist' }] }, duration: { seconds: 180 }, thumbnails: [] }]
    })
    const client = new DiscoveryClient(mockYt as any)
    const songs = await client.getRelated('abc')
    expect(mockGetUpNext).toHaveBeenCalledWith('abc')
    expect(Array.isArray(songs)).toBe(true)
  })

  it('falls back to getUpNext when getRelated throws any error', async () => {
    mockGetRelated.mockRejectedValue(new Error('Unknown scraper error'))
    const client = new DiscoveryClient(mockYt as any)
    const songs = await client.getRelated('abc')
    expect(mockGetUpNext).toHaveBeenCalled()
    expect(Array.isArray(songs)).toBe(true)
  })

  it('returns empty array when both getRelated and getUpNext fail', async () => {
    mockGetRelated.mockRejectedValue(new Error('tab error'))
    mockGetUpNext.mockRejectedValue(new Error('upnext error'))
    const client = new DiscoveryClient(mockYt as any)
    const songs = await client.getRelated('abc')
    expect(songs).toEqual([])
  })
})
