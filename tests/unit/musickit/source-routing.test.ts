import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import type { AudioSource } from '../../../src/sources/audio-source'
import type { Song, StreamingData, SearchResults } from '../../../src/models'

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    type: 'song',
    videoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    duration: 213,
    thumbnails: [],
    ...overrides,
  }
}

function makeStreamingData(overrides: Partial<StreamingData> = {}): StreamingData {
  return {
    url: 'https://rr5---sn.googlevideo.com/videoplayback?expire=9999999999',
    codec: 'opus',
    bitrate: 160_000,
    expiresAt: 9999999999,
    ...overrides,
  }
}

function makeSource(name: string, handles = true): AudioSource & { search: ReturnType<typeof vi.fn>; getStream: ReturnType<typeof vi.fn>; getMetadata: ReturnType<typeof vi.fn> } {
  return {
    name,
    canHandle: vi.fn().mockReturnValue(handles),
    search: vi.fn().mockResolvedValue({ songs: [makeSong()], albums: [], artists: [], playlists: [] }),
    getStream: vi.fn().mockResolvedValue(makeStreamingData()),
    getMetadata: vi.fn().mockResolvedValue(makeSong()),
  }
}

describe('MusicKit — source routing', () => {
  // ─── registerSource ───────────────────────────────────────────────────────

  describe('registerSource', () => {
    it('accepts a source without throwing', () => {
      const mk = new MusicKit()
      const source = makeSource('test-source')
      expect(() => mk.registerSource(source)).not.toThrow()
    })

    it('exposes registered sources', () => {
      const mk = new MusicKit()
      const source = makeSource('test-source')
      mk.registerSource(source)
      expect(mk.sources).toContain(source)
    })
  })

  // ─── first canHandle wins ─────────────────────────────────────────────────

  describe('first canHandle wins', () => {
    it('calls search on the first source that canHandle — not the second', async () => {
      const mk = new MusicKit()
      const first = makeSource('first', true)
      const second = makeSource('second', true)
      mk.registerSource(first)
      mk.registerSource(second)

      await mk.search('test query')

      expect(first.search).toHaveBeenCalledTimes(1)
      expect(second.search).not.toHaveBeenCalled()
    })

    it('skips sources where canHandle returns false', async () => {
      const mk = new MusicKit()
      const skipped = makeSource('skipped', false)
      const used = makeSource('used', true)
      mk.registerSource(skipped)
      mk.registerSource(used)

      await mk.search('test query')

      expect(skipped.search).not.toHaveBeenCalled()
      expect(used.search).toHaveBeenCalledTimes(1)
    })

    it('tries sources in registration order', async () => {
      const mk = new MusicKit()
      const callOrder: string[] = []

      const first = makeSource('first', false)
      ;(first.canHandle as any).mockImplementation(() => { callOrder.push('first'); return false })

      const second = makeSource('second', true)
      ;(second.canHandle as any).mockImplementation(() => { callOrder.push('second'); return true })

      mk.registerSource(first)
      mk.registerSource(second)

      await mk.search('query')

      expect(callOrder).toEqual(['first', 'second'])
    })
  })

  // ─── getStream routing ────────────────────────────────────────────────────

  describe('getStream routing', () => {
    it('routes getStream to the first canHandle source', async () => {
      const mk = new MusicKit()
      const source = makeSource('yt', true)
      mk.registerSource(source)

      await mk.getStream('dQw4w9WgXcQ')

      expect(source.getStream).toHaveBeenCalledWith('dQw4w9WgXcQ', 'high')
    })

    it('passes quality option through to the source', async () => {
      const mk = new MusicKit()
      const source = makeSource('yt', true)
      mk.registerSource(source)

      await mk.getStream('dQw4w9WgXcQ', { quality: 'low' })

      expect(source.getStream).toHaveBeenCalledWith('dQw4w9WgXcQ', 'low')
    })
  })

  // ─── no source handles ────────────────────────────────────────────────────

  describe('no source handles the query', () => {
    it('throws when no registered source can handle the query', async () => {
      const mk = new MusicKit()
      const source = makeSource('none', false)
      mk.registerSource(source)

      await expect(mk.search('test')).rejects.toThrow()
    })

    it('does not throw when no sources are manually registered — default source handles it', async () => {
      const mk = new MusicKit()
      // ensureClients() auto-registers YouTubeMusicSource, so bare MusicKit never has zero sources
      await (mk as any).ensureClients()
      expect(mk.sources.length).toBeGreaterThan(0)
    })
  })

})
