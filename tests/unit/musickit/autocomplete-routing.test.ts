import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'

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

const mockDiscovery = {
  autocomplete: vi.fn().mockResolvedValue(['queen bohemian rhapsody', 'queen we will rock you']),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — autocomplete routing', () => {
  it('delegates plain text queries to DiscoveryClient', async () => {
    const mk = new MusicKit()
    await mk.autocomplete('queen')
    expect(mockDiscovery.autocomplete).toHaveBeenCalledWith('queen')
  })

  it('returns suggestions from DiscoveryClient for plain text', async () => {
    const mk = new MusicKit()
    const result = await mk.autocomplete('queen')
    expect(result).toContain('queen bohemian rhapsody')
  })

  it('resolves YouTube Music search URL to query text before autocomplete', async () => {
    const mk = new MusicKit()
    await mk.autocomplete('https://music.youtube.com/search?q=queen')
    expect(mockDiscovery.autocomplete).toHaveBeenCalledWith('queen')
  })
})
