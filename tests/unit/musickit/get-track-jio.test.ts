import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeSong, makeStreamingData } from '../../helpers/mock-factory'

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

;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
  getInfo: vi.fn().mockResolvedValue(makeSong()),
}))

const jioSong = makeSong({ videoId: 'jio:abc123', title: 'Tum Hi Ho' })
const jioStream = makeStreamingData({ codec: 'mp4a' })

const mockJioSaavnSource = {
  name: 'jiosaavn',
  canHandle: vi.fn((q: string) => q.startsWith('jio:')),
  search: vi.fn(),
  getStream: vi.fn().mockResolvedValue(jioStream),
  getMetadata: vi.fn().mockResolvedValue(jioSong),
}

vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => mockJioSaavnSource),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — getTrack() with jio: IDs', () => {
  it('returns an AudioTrack for a jio: ID', async () => {
    const mk = new MusicKit()
    const track = await mk.getTrack('jio:abc123')
    expect(track.type).toBe('song')
    expect(track.videoId).toBe('jio:abc123')
    expect(track.stream).toBeDefined()
  })

  it('fetches metadata from JioSaavn source for jio: IDs', async () => {
    const mk = new MusicKit()
    await mk.getTrack('jio:abc123')
    expect(mockJioSaavnSource.getMetadata).toHaveBeenCalledWith('jio:abc123')
  })

  it('fetches stream from JioSaavn source for jio: IDs', async () => {
    const mk = new MusicKit()
    await mk.getTrack('jio:abc123')
    expect(mockJioSaavnSource.getStream).toHaveBeenCalledWith('jio:abc123', 'high')
  })

  it('resolves JioSaavn URL before routing', async () => {
    const mk = new MusicKit()
    await mk.getTrack('https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc')
    expect(mockJioSaavnSource.getMetadata).toHaveBeenCalledWith('jio:OQMaey5hbVc')
    expect(mockJioSaavnSource.getStream).toHaveBeenCalledWith('jio:OQMaey5hbVc', 'high')
  })

  it('returns song title from JioSaavn source', async () => {
    const mk = new MusicKit()
    const track = await mk.getTrack('jio:abc123')
    expect(track.title).toBe('Tum Hi Ho')
  })
})
