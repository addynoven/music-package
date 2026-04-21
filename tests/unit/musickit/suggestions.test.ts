import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import type { Song } from '../../../src/models'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

import { DiscoveryClient } from '../../../src/discovery'
import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

function makeSong(videoId: string, title = 'Song', artist = 'Artist'): Song {
  return { type: 'song', videoId, title, artist, duration: 200, thumbnails: [] }
}

const jioRadioResults  = [makeSong('jio:r1'), makeSong('jio:r2'), makeSong('jio:r3')]
const ytRelatedResults = [makeSong('yt1'), makeSong('yt2'), makeSong('yt3')]
// YouTube search result that gives us a real YouTube video ID for the jio: song
const ytSearchResult   = [makeSong('dQw4w9WgXcQ', 'Hips Dont Lie', 'Shakira')]

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue(makeSong('jio:abc123', 'Hips Dont Lie', 'Shakira')),
  getRadio: vi.fn().mockResolvedValue(jioRadioResults),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

const mockDiscovery = {
  getRelated: vi.fn().mockResolvedValue(ytRelatedResults),
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue(ytSearchResult),
  getHome: vi.fn().mockResolvedValue([]),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getSuggestions', () => {
  describe('YouTube ID (direct)', () => {
    it('routes YouTube ID through getRelated', async () => {
      const mk = new MusicKit()
      await mk.getSuggestions('fJ9rUzIMcZQ')
      expect(mockDiscovery.getRelated).toHaveBeenCalledWith('fJ9rUzIMcZQ')
      expect(mockJioSaavnSource.getRadio).not.toHaveBeenCalled()
    })

    it('returns getRelated results for a YouTube ID', async () => {
      const mk = new MusicKit()
      const results = await mk.getSuggestions('fJ9rUzIMcZQ')
      expect(results).toEqual(ytRelatedResults)
    })

    it('resolves YouTube video URL before routing', async () => {
      const mk = new MusicKit()
      await mk.getSuggestions('https://www.youtube.com/watch?v=fJ9rUzIMcZQ')
      expect(mockDiscovery.getRelated).toHaveBeenCalledWith('fJ9rUzIMcZQ')
    })
  })

  describe('jio: ID — YouTube-first strategy', () => {
    it('fetches song metadata to get title and artist for YouTube search', async () => {
      const mk = new MusicKit()
      await mk.getSuggestions('jio:abc123')
      expect(mockJioSaavnSource.getMetadata).toHaveBeenCalledWith('jio:abc123')
    })

    it('searches YouTube using the song title and artist from metadata', async () => {
      const mk = new MusicKit()
      await mk.getSuggestions('jio:abc123')
      expect(mockDiscovery.search).toHaveBeenCalledWith(
        'Hips Dont Lie Shakira',
        expect.objectContaining({ filter: 'songs' })
      )
    })

    it('uses getRelated with the YouTube video ID found in search', async () => {
      const mk = new MusicKit()
      await mk.getSuggestions('jio:abc123')
      expect(mockDiscovery.getRelated).toHaveBeenCalledWith('dQw4w9WgXcQ')
      expect(mockJioSaavnSource.getRadio).not.toHaveBeenCalled()
    })

    it('returns YouTube related results for a jio: ID when YouTube search succeeds', async () => {
      const mk = new MusicKit()
      const results = await mk.getSuggestions('jio:abc123')
      expect(results).toEqual(ytRelatedResults)
    })

    it('falls back to JioSaavn radio when YouTube search returns no results', async () => {
      mockDiscovery.search.mockResolvedValueOnce([])
      const mk = new MusicKit()
      await mk.getSuggestions('jio:abc123')
      expect(mockJioSaavnSource.getRadio).toHaveBeenCalledWith('jio:abc123')
      expect(mockDiscovery.getRelated).not.toHaveBeenCalled()
    })

    it('falls back to JioSaavn radio when YouTube getRelated throws', async () => {
      mockDiscovery.getRelated.mockRejectedValueOnce(new Error('YouTube unavailable'))
      const mk = new MusicKit()
      const results = await mk.getSuggestions('jio:abc123')
      expect(mockJioSaavnSource.getRadio).toHaveBeenCalledWith('jio:abc123')
      expect(results).toEqual(jioRadioResults)
    })

    it('falls back to JioSaavn radio when metadata fetch fails', async () => {
      mockJioSaavnSource.getMetadata.mockRejectedValueOnce(new Error('metadata unavailable'))
      const mk = new MusicKit()
      const results = await mk.getSuggestions('jio:abc123')
      expect(mockJioSaavnSource.getRadio).toHaveBeenCalledWith('jio:abc123')
      expect(results).toEqual(jioRadioResults)
    })

    it('resolves JioSaavn song URL before routing', async () => {
      const mk = new MusicKit()
      await mk.getSuggestions('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
      expect(mockJioSaavnSource.getMetadata).toHaveBeenCalledWith('jio:OQMaey5hbVc')
    })
  })
})
