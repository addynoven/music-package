import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong } from '../../helpers/mock-factory'

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

const mockDiscovery = {
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — search with limit option', () => {
  it('passes limit to the source when searching without filter', async () => {
    const mk = new MusicKit()
    await mk.search('queen', { limit: 5 })
    expect(mockDiscovery.search).toHaveBeenCalledWith('queen', expect.objectContaining({ limit: 5 }))
  })

  it('passes limit to the source when searching with filter', async () => {
    mockDiscovery.search.mockResolvedValue([makeSong()])
    const mk = new MusicKit()
    await mk.search('queen', { filter: 'songs', limit: 10 })
    expect(mockDiscovery.search).toHaveBeenCalledWith('queen', expect.objectContaining({ filter: 'songs', limit: 10 }))
  })

  it('uses a different cache key when limit differs', async () => {
    const mk = new MusicKit()
    await mk.search('queen', { limit: 5 })
    await mk.search('queen', { limit: 20 })
    expect(mockDiscovery.search).toHaveBeenCalledTimes(2)
  })

  it('returns cached result when same query and limit are repeated', async () => {
    const mk = new MusicKit()
    await mk.search('queen', { limit: 5 })
    await mk.search('queen', { limit: 5 })
    expect(mockDiscovery.search).toHaveBeenCalledTimes(1)
  })
})
