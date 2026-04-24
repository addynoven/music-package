import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import type { AudioSource } from '../../../src/sources/audio-source'
import type { Song, StreamingData, SearchResults } from '../../../src/models'

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    type: 'song',
    videoId: 'jio:abc12345',
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    duration: 252,
    thumbnails: [],
    ...overrides,
  }
}

function makeStreamingData(overrides: Partial<StreamingData> = {}): StreamingData {
  return {
    url: 'https://aac.saavncdn.com/Tum_Hi_Ho_320.mp4',
    codec: 'mp4a',
    bitrate: 320_000,
    expiresAt: 9999999999,
    ...overrides,
  }
}

function makeSource(name: string, handles: boolean): AudioSource & {
  search: ReturnType<typeof vi.fn>
  getStream: ReturnType<typeof vi.fn>
  getMetadata: ReturnType<typeof vi.fn>
} {
  return {
    name,
    canHandle: vi.fn().mockReturnValue(handles),
    search: vi.fn().mockResolvedValue({ songs: [makeSong()], albums: [], artists: [], playlists: [] } as SearchResults),
    getStream: vi.fn().mockResolvedValue(makeStreamingData()),
    getMetadata: vi.fn().mockResolvedValue(makeSong()),
  }
}

describe('MusicKit — source pipeline order', () => {
  describe('JioSaavn first, YouTube fallback', () => {
    it('uses first registered source when it canHandle', async () => {
      const mk = new MusicKit()
      const jio = makeSource('jiosaavn', true)
      const yt = makeSource('youtube-music', true)
      mk.registerSource(jio)
      mk.registerSource(yt)

      await mk.search('arijit singh')

      expect(jio.search).toHaveBeenCalledTimes(1)
      expect(yt.search).not.toHaveBeenCalled()
    })

    it('falls back to YouTube when JioSaavn cannot handle the query', async () => {
      const mk = new MusicKit()
      const jio = makeSource('jiosaavn', false)
      const yt = makeSource('youtube-music', true)
      mk.registerSource(jio)
      mk.registerSource(yt)

      await mk.search('dQw4w9WgXcQ')

      expect(jio.search).not.toHaveBeenCalled()
      expect(yt.search).toHaveBeenCalledTimes(1)
    })

    it('stream routes to jio source when videoId starts with jio:', async () => {
      const mk = new MusicKit()

      const callLog: string[] = []
      const jio = makeSource('jiosaavn', false)
      ;(jio.canHandle as any).mockImplementation((q: string) => {
        callLog.push('jio')
        return q.startsWith('jio:')
      })
      const yt = makeSource('youtube-music', true)
      ;(yt.canHandle as any).mockImplementation(() => {
        callLog.push('yt')
        return true
      })

      mk.registerSource(jio)
      mk.registerSource(yt)

      await mk.getStream('jio:abc12345')

      expect(jio.getStream).toHaveBeenCalledWith('jio:abc12345', 'high')
      expect(yt.getStream).not.toHaveBeenCalled()
    })

    it('stream falls back to YouTube for plain YouTube videoIds', async () => {
      const mk = new MusicKit()
      const jio = makeSource('jiosaavn', false)
      ;(jio.canHandle as any).mockImplementation((q: string) => q.startsWith('jio:'))
      const yt = makeSource('youtube-music', true)
      mk.registerSource(jio)
      mk.registerSource(yt)

      await mk.getStream('dQw4w9WgXcQ')

      expect(jio.getStream).not.toHaveBeenCalled()
      expect(yt.getStream).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
    })
  })

})
