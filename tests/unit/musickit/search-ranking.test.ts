import { describe, it, expect, vi } from 'vitest'

vi.mock('youtubei.js', () => ({ Innertube: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')
vi.mock('../../../src/downloader')
vi.mock('../../../src/sources/jiosaavn', () => ({
  JioSaavnSource: vi.fn().mockImplementation(() => ({
    name: 'jiosaavn',
    canHandle: () => false,
    search: vi.fn(),
    getStream: vi.fn(),
    getMetadata: vi.fn(),
  })),
  JIOSAAVN_LANGUAGES: new Set(['hindi']),
}))

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

describe('MusicKit — search() applies ranking to JioSaavn songs only', () => {
  it('re-ranks JioSaavn results — original artist above cover artists', async () => {
    const songs = [
      makeSong({ videoId: 'jio:c1', title: 'Zenzenzense (A cappella Cover)', artist: 'MIT Syncopasian', duration: 220 }),
      makeSong({ videoId: 'jio:c2', title: 'Zenzenzense (Live Cover)', artist: 'MIT Syncopasian', duration: 230 }),
      makeSong({ videoId: 'jio:c3', title: 'Zenzenzense (Bamboo Cover)', artist: 'MIT Syncopasian', duration: 215 }),
      makeSong({ videoId: 'jio:orig', title: 'Zenzenzense', artist: 'RADWIMPS', duration: 240 }),
    ]

    const mk = new MusicKit()
    mk.registerSource(makeTestSource(songs))

    const result = await mk.search('Zenzenzense RADWIMPS', { filter: 'songs' }) as Song[]

    expect(result[0].videoId).toBe('jio:orig')
  })

  it('re-ranks JioSaavn results — live version below the clean original', async () => {
    const songs = [
      makeSong({ videoId: 'jio:live', title: "Hips Don't Lie (Live at Concert)", artist: 'Shakira', duration: 255 }),
      makeSong({ videoId: 'jio:orig', title: "Hips Don't Lie", artist: 'Shakira', duration: 230 }),
    ]

    const mk = new MusicKit()
    mk.registerSource(makeTestSource(songs))

    const result = await mk.search("Hips Don't Lie Shakira", { filter: 'songs' }) as Song[]

    expect(result[0].videoId).toBe('jio:orig')
  })

  it('re-ranks JioSaavn songs inside unfiltered SearchResults', async () => {
    const songs = [
      makeSong({ videoId: 'jio:live', title: 'Song (Live)', artist: 'Artist', duration: 240 }),
      makeSong({ videoId: 'jio:orig', title: 'Song', artist: 'Artist', duration: 230 }),
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

    expect(result.songs[0].videoId).toBe('jio:orig')
  })

  it('does NOT re-rank YouTube results — passes them through in original order', async () => {
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
})
