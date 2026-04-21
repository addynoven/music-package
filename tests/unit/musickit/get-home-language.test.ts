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

const mockJioGetHome = vi.fn().mockResolvedValue([makeSection()])
const mockYtGetHome = vi.fn().mockResolvedValue([makeSection({ title: 'YT Home' })])

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: mockYtGetHome,
}))

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn(),
  getHome: mockJioGetHome,
}

vi.mock('../../../src/sources/jiosaavn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/sources/jiosaavn')>()
  return {
    ...actual,
    JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
  }
})

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getHome language routing', () => {
  describe('JioSaavn languages (Indian)', () => {
    it('routes hindi to JioSaavn', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'hindi' })
      expect(mockJioGetHome).toHaveBeenCalledWith('hindi')
      expect(mockYtGetHome).not.toHaveBeenCalled()
    })

    it('routes punjabi to JioSaavn', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'punjabi' })
      expect(mockJioGetHome).toHaveBeenCalledWith('punjabi')
    })

    it('routes tamil to JioSaavn', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'tamil' })
      expect(mockJioGetHome).toHaveBeenCalledWith('tamil')
    })

    it('routes telugu to JioSaavn', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'telugu' })
      expect(mockJioGetHome).toHaveBeenCalledWith('telugu')
    })
  })

  describe('non-JioSaavn languages', () => {
    it('routes japanese to YouTube Music (skips JioSaavn)', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'ja' })
      expect(mockJioGetHome).not.toHaveBeenCalled()
      expect(mockYtGetHome).toHaveBeenCalled()
    })

    it('routes korean to YouTube Music', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'ko' })
      expect(mockJioGetHome).not.toHaveBeenCalled()
      expect(mockYtGetHome).toHaveBeenCalled()
    })

    it('routes spanish to YouTube Music', async () => {
      const mk = new MusicKit()
      await mk.getHome({ language: 'es' })
      expect(mockJioGetHome).not.toHaveBeenCalled()
      expect(mockYtGetHome).toHaveBeenCalled()
    })
  })

  describe('no language option', () => {
    it('uses JioSaavn (default source) when no language given', async () => {
      const mk = new MusicKit()
      await mk.getHome()
      expect(mockJioGetHome).toHaveBeenCalledWith(undefined)
    })
  })
})
