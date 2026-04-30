import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import type { Song } from '../../../src/models'

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

import { DiscoveryClient } from '../../../src/discovery'
import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

function makeSong(videoId: string, title = 'Song', artist = 'Artist'): Song {
  return { type: 'song', videoId, title, artist, duration: 200, thumbnails: [] }
}

const ytRelatedResults = [makeSong('yt1'), makeSong('yt2'), makeSong('yt3')]

const mockDiscovery = {
  getRelated: vi.fn().mockResolvedValue(ytRelatedResults),
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue([]),
  getHome: vi.fn().mockResolvedValue([]),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getSuggestions', () => {
  it('routes YouTube ID through getRelated', async () => {
    const mk = new MusicKit()
    await mk.getSuggestions('fJ9rUzIMcZQ')
    expect(mockDiscovery.getRelated).toHaveBeenCalledWith('fJ9rUzIMcZQ')
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
