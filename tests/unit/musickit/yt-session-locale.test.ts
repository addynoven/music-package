import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { Innertube } from 'youtubei.js'
import { MusicKit } from '../../../src/musickit'
import { RetryEngine } from '../../../src/retry'
import { DiscoveryClient } from '../../../src/discovery'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))
;(DiscoveryClient as any).mockImplementation(() => ({
  autocomplete: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue({ songs: [], albums: [], artists: [], playlists: [] }),
  getHome: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../src/sources/youtube-music', () => ({
  YouTubeMusicSource: vi.fn().mockImplementation(() => ({
    name: 'youtube-music',
    canHandle: vi.fn(() => true),
    search: vi.fn(),
    getStream: vi.fn(),
    getMetadata: vi.fn(),
  })),
}))

beforeEach(() => vi.clearAllMocks())

describe('MusicKit — YouTube session locale', () => {
  it('passes lang to Innertube.create when language is set in config', async () => {
    await MusicKit.create({ language: 'hi' })
    expect(Innertube.create).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'hi' })
    )
  })

  it('passes location to Innertube.create when location is set in config', async () => {
    await MusicKit.create({ location: 'IN' })
    expect(Innertube.create).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'IN' })
    )
  })

  it('passes both lang and location together', async () => {
    await MusicKit.create({ language: 'hi', location: 'IN' })
    expect(Innertube.create).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'hi', location: 'IN' })
    )
  })

  it('does not pass lang when language is not set', async () => {
    await MusicKit.create({})
    const call = (Innertube.create as any).mock.calls[0][0]
    expect(call.lang).toBeUndefined()
  })

  it('does not pass location when it is not set', async () => {
    await MusicKit.create({})
    const call = (Innertube.create as any).mock.calls[0][0]
    expect(call.location).toBeUndefined()
  })
})
