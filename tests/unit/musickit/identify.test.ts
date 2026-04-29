import { describe, it, expect, beforeEach, vi } from 'vitest'
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
vi.mock('../../../src/identifier')

import { RetryEngine } from '../../../src/retry'
import { DiscoveryClient } from '../../../src/discovery'
import { Identifier } from '../../../src/identifier'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockSong = makeSong({ title: 'Bohemian Rhapsody', artist: 'Queen' })

const mockDiscovery = {
  search: vi.fn().mockResolvedValue([mockSong]),
  autocomplete: vi.fn(),
  getHome: vi.fn(),
  getArtist: vi.fn(),
  getAlbum: vi.fn(),
  getRadio: vi.fn(),
  getRelated: vi.fn(),
  getCharts: vi.fn(),
}

;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)

const mockIdentifier = {
  fingerprint: vi.fn().mockResolvedValue({ fingerprint: 'AQADtMmybGkSRZGU', duration: 254 }),
  lookup: vi.fn().mockResolvedValue({ artist: 'Queen', title: 'Bohemian Rhapsody', score: 0.92 }),
  recognizeWithSongrec: vi.fn().mockResolvedValue(null),
}

;(Identifier as any).mockImplementation(() => mockIdentifier)

describe('MusicKit.identify', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mockIdentifier.fingerprint.mockResolvedValue({ fingerprint: 'AQADtMmybGkSRZGU', duration: 254 })
    mockIdentifier.lookup.mockResolvedValue({ artist: 'Queen', title: 'Bohemian Rhapsody', score: 0.92 })
    mockIdentifier.recognizeWithSongrec.mockResolvedValue(null)
    mockDiscovery.search.mockResolvedValue([mockSong])
  })

  it('throws ValidationError if acoustidApiKey is not configured', async () => {
    mk = new MusicKit({})
    await expect(mk.identify('./song.mp3')).rejects.toThrow('acoustidApiKey')
  })

  it('returns a Song on a successful identify', async () => {
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key' } })
    const result = await mk.identify('./song.mp3')
    expect(result).toEqual(mockSong)
  })

  it('calls fingerprint with the file path', async () => {
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key' } })
    await mk.identify('./song.mp3')
    expect(mockIdentifier.fingerprint).toHaveBeenCalledWith('./song.mp3')
  })

  it('passes fingerprint and duration to lookup', async () => {
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key' } })
    await mk.identify('./song.mp3')
    expect(mockIdentifier.lookup).toHaveBeenCalledWith('AQADtMmybGkSRZGU', 254)
  })

  it('searches using artist and title from lookup result', async () => {
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key' } })
    await mk.identify('./song.mp3')
    expect(mockDiscovery.search).toHaveBeenCalledWith(
      expect.stringContaining('Queen'),
      expect.objectContaining({ filter: 'songs' }),
    )
  })

  it('returns null when AcoustID finds no match', async () => {
    mockIdentifier.lookup.mockResolvedValue(null)
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key' } })
    const result = await mk.identify('./song.mp3')
    expect(result).toBeNull()
  })

  it('returns null when search yields no songs', async () => {
    mockDiscovery.search.mockResolvedValue([])
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key' } })
    const result = await mk.identify('./song.mp3')
    expect(result).toBeNull()
  })

  it('uses SongRec result when songrec succeeds and skips AcoustID', async () => {
    mockIdentifier.recognizeWithSongrec.mockResolvedValue({ artist: 'Queen & David Bowie', title: 'Under Pressure', score: 1 })
    const mockPressure = makeSong({ title: 'Under Pressure', artist: 'Queen & David Bowie' })
    mockDiscovery.search.mockResolvedValue([mockPressure])
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key', songrecBin: 'songrec' } })
    const result = await mk.identify('./song.mp3')
    expect(result).toEqual(mockPressure)
    expect(mockIdentifier.fingerprint).not.toHaveBeenCalled()
    expect(mockIdentifier.lookup).not.toHaveBeenCalled()
  })

  it('falls back to AcoustID when SongRec returns null', async () => {
    mockIdentifier.recognizeWithSongrec.mockResolvedValue(null)
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key', songrecBin: 'songrec' } })
    const result = await mk.identify('./song.mp3')
    expect(result).toEqual(mockSong)
    expect(mockIdentifier.fingerprint).toHaveBeenCalled()
    expect(mockIdentifier.lookup).toHaveBeenCalled()
  })

  it('searches with artist and title from SongRec result', async () => {
    mockIdentifier.recognizeWithSongrec.mockResolvedValue({ artist: 'Queen & David Bowie', title: 'Under Pressure', score: 1 })
    mk = new MusicKit({ identify: { acoustidApiKey: 'test-key', songrecBin: 'songrec' } })
    await mk.identify('./song.mp3')
    expect(mockDiscovery.search).toHaveBeenCalledWith(
      expect.stringContaining('Under Pressure'),
      expect.objectContaining({ filter: 'songs' }),
    )
  })
})
