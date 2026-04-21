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
  JioSaavnSource: class {
    readonly name = 'jiosaavn'
    canHandle(q: string) { return q.startsWith('jio:') }
    async search() { return { songs: [], albums: [], artists: [], playlists: [] } }
    async getStream() { throw new Error('not handled') }
    async getMetadata() { throw new Error('not handled') }
  },
}))

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

  it('returns empty array for jio: prefixed input (not meaningful for autocomplete)', async () => {
    const mk = new MusicKit()
    const result = await mk.autocomplete('jio:abc123')
    expect(result).toEqual([])
    expect(mockDiscovery.autocomplete).not.toHaveBeenCalled()
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
