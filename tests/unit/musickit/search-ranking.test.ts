import { describe, it, expect, vi } from 'vitest'

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
vi.mock('../../../src/downloader')

import { RetryEngine } from '../../../src/retry'
;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

import { MusicKit } from '../../../src/musickit'
import { makeSong } from '../../helpers/mock-factory'
import type { AudioSource } from '../../../src/sources/audio-source'
import type { Song } from '../../../src/models'

function makeTestSource(songs: Song[]): AudioSource {
  return {
    name: 'test',
    canHandle: () => true,
    search: vi.fn().mockResolvedValue(songs),
    getStream: vi.fn(),
    getMetadata: vi.fn(),
  }
}

describe('MusicKit — search() result ordering', () => {
  it('passes YouTube results through in original order', async () => {
    const songs = [
      makeSong({ videoId: 'AAA11111111', title: 'Song (Live)', artist: 'Artist', duration: 240 }),
      makeSong({ videoId: 'BBB22222222', title: 'Song', artist: 'Artist', duration: 230 }),
    ]

    const mk = new MusicKit()
    mk.registerSource(makeTestSource(songs))

    const result = await mk.search('Song Artist', { filter: 'songs' }) as Song[]

    expect(result[0].videoId).toBe('AAA11111111')
    expect(result[1].videoId).toBe('BBB22222222')
  })

  it('returns SearchResults shape for unfiltered search', async () => {
    const songs = [
      makeSong({ videoId: 'AAA11111111', title: 'Song', artist: 'Artist', duration: 230 }),
    ]

    const mk = new MusicKit()
    mk.registerSource({
      name: 'test',
      canHandle: () => true,
      search: vi.fn().mockResolvedValue({ songs, albums: [], artists: [], playlists: [] }),
      getStream: vi.fn(),
      getMetadata: vi.fn(),
    })

    const result = await mk.search('Song Artist') as { songs: Song[] }

    expect(result.songs[0].videoId).toBe('AAA11111111')
  })
})
