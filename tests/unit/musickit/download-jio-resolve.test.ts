import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong } from '../../helpers/mock-factory'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')
vi.mock('../../../src/downloader')

import { RetryEngine } from '../../../src/retry'
import { DiscoveryClient } from '../../../src/discovery'
import { Downloader } from '../../../src/downloader'

vi.mock('../../../src/discovery')

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockDownload = vi.fn().mockResolvedValue(undefined)
;(Downloader as any).mockImplementation(() => ({
  download: mockDownload,
  streamAudio: vi.fn(),
}))

const jioSong = makeSong({ videoId: 'jio:abc123', title: 'Tum Hi Ho', artist: 'Arijit Singh' })
const ytSong  = makeSong({ videoId: 'dQw4w9WgXcQ', title: 'Tum Hi Ho', artist: 'Arijit Singh' })

const mockDiscoveryInst = {
  search: vi.fn().mockResolvedValue([ytSong]),
  getInfo: vi.fn().mockResolvedValue(ytSong),
}
;(DiscoveryClient as any).mockImplementation(() => mockDiscoveryInst)

const mockJioSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue(jioSong),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSource),
  JIOSAAVN_LANGUAGES: new Set(['hindi', 'english']),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — download() auto-resolves jio: IDs', () => {
  // ─── resolution chain ─────────────────────────────────────────────────────

  it('calls getMetadata on the JioSaavn source to get title + artist', async () => {
    mockJioSource.getMetadata.mockResolvedValue(jioSong)
    mockDiscoveryInst.search.mockResolvedValue([ytSong])

    const mk = new MusicKit()
    await mk.download('jio:abc123')

    expect(mockJioSource.getMetadata).toHaveBeenCalledWith('jio:abc123')
  })

  it('searches YouTube with "${title} ${artist}" after reading metadata', async () => {
    mockJioSource.getMetadata.mockResolvedValue(jioSong)
    mockDiscoveryInst.search.mockResolvedValue([ytSong])

    const mk = new MusicKit()
    await mk.download('jio:abc123')

    expect(mockDiscoveryInst.search).toHaveBeenCalledWith(
      expect.stringContaining('Tum Hi Ho'),
      expect.objectContaining({ filter: 'songs' }),
    )
    expect(mockDiscoveryInst.search).toHaveBeenCalledWith(
      expect.stringContaining('Arijit Singh'),
      expect.anything(),
    )
  })

  it('passes the resolved YouTube videoId to the downloader — not the jio: ID', async () => {
    mockJioSource.getMetadata.mockResolvedValue(jioSong)
    mockDiscoveryInst.search.mockResolvedValue([ytSong])

    const mk = new MusicKit()
    await mk.download('jio:abc123')

    expect(mockDownload.mock.calls[0][0]).toBe('dQw4w9WgXcQ')
    expect(mockDownload.mock.calls[0][0]).not.toBe('jio:abc123')
  })

  it('throws when YouTube search returns no results', async () => {
    mockJioSource.getMetadata.mockResolvedValue(jioSong)
    mockDiscoveryInst.search.mockResolvedValue([])

    const mk = new MusicKit()
    await expect(mk.download('jio:abc123')).rejects.toThrow()
  })

  it('throws when YouTube search returns only other jio: results', async () => {
    mockJioSource.getMetadata.mockResolvedValue(jioSong)
    // Only jio IDs returned — no YouTube equivalent
    mockDiscoveryInst.search.mockResolvedValue([
      makeSong({ videoId: 'jio:xyz' }),
    ])

    const mk = new MusicKit()
    await expect(mk.download('jio:abc123')).rejects.toThrow()
  })

  // ─── YouTube IDs pass straight through ───────────────────────────────────

  it('does not call getMetadata for a regular YouTube videoId', async () => {
    mockDiscoveryInst.search.mockResolvedValue([ytSong])

    const mk = new MusicKit()
    await mk.download('dQw4w9WgXcQ')

    expect(mockJioSource.getMetadata).not.toHaveBeenCalled()
  })

  it('passes the YouTube videoId straight to the downloader', async () => {
    const mk = new MusicKit()
    await mk.download('dQw4w9WgXcQ')

    expect(mockDownload.mock.calls[0][0]).toBe('dQw4w9WgXcQ')
  })

  it('forwards all download options through to the downloader', async () => {
    const mk = new MusicKit()
    await mk.download('dQw4w9WgXcQ', { format: 'm4a', path: '/tmp' })

    expect(mockDownload).toHaveBeenCalledWith(
      'dQw4w9WgXcQ',
      expect.objectContaining({ format: 'm4a', path: '/tmp' }),
    )
  })
})
