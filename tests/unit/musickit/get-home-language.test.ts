import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSection } from '../../helpers/mock-factory'

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

const mockGetHome = vi.fn().mockResolvedValue([makeSection()])

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([makeSection()]),
}))

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
  getHome: mockGetHome,
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getHome with language option', () => {
  it('passes language to JioSaavn getHome when provided', async () => {
    const mk = new MusicKit()
    await mk.getHome({ language: 'punjabi' })
    expect(mockGetHome).toHaveBeenCalledWith('punjabi')
  })

  it('passes default language when no option given', async () => {
    const mk = new MusicKit()
    await mk.getHome()
    expect(mockGetHome).toHaveBeenCalledWith(undefined)
  })

  it('returns sections from the source', async () => {
    const mk = new MusicKit()
    const sections = await mk.getHome({ language: 'hindi' })
    expect(Array.isArray(sections)).toBe(true)
    expect(sections.length).toBeGreaterThan(0)
  })
})
