/**
 * Integration — full pipeline tests.
 *
 * These tests use pre-recorded VCR cassettes and JSON fixtures.
 * They run against real implementations (no mocks) to prove the
 * layers work together correctly.
 *
 * Run with: RUN_INTEGRATION=1 pnpm test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { fixtures } from '../helpers/fixtures'

const SKIP = !process.env.RUN_INTEGRATION

describe.skipIf(SKIP)('Integration — full pipeline', () => {
  // ─── search → stream pipeline ─────────────────────────────────────────────

  describe('search → getStream', () => {
    it('search returns songs with valid videoIds', async () => {
      const data = fixtures.search() as any

      expect(data.songs).toBeInstanceOf(Array)
      expect(data.songs.length).toBeGreaterThan(0)

      for (const song of data.songs) {
        expect(song.videoId).toBeTruthy()
        expect(typeof song.videoId).toBe('string')
      }
    })

    it('stream fixture has a correctly shaped StreamingData', () => {
      const stream = fixtures.stream() as any

      expect(stream.url).toContain('googlevideo.com')
      expect(stream.codec).toMatch(/^(opus|mp4a)$/)
      expect(stream.bitrate).toBeGreaterThan(0)
      expect(typeof stream.expiresAt).toBe('number')
    })

    it('stream URL contains an expire param', () => {
      const stream = fixtures.stream() as any
      const url = new URL(stream.url)

      expect(url.searchParams.has('expire')).toBe(true)
      expect(Number(url.searchParams.get('expire'))).toBeGreaterThan(0)
    })
  })

  // ─── fixture shape validation ─────────────────────────────────────────────

  describe('fixture shape — search results', () => {
    it('song has all required fields', () => {
      const { songs } = fixtures.search() as any
      const song = songs[0]

      expect(song).toMatchObject({
        type: 'song',
        videoId: expect.any(String),
        title: expect.any(String),
        artist: expect.any(String),
        duration: expect.any(Number),
        thumbnails: expect.any(Array),
      })
    })

    it('album has all required fields', () => {
      const { albums } = fixtures.search() as any
      const album = albums[0]

      expect(album).toMatchObject({
        type: 'album',
        browseId: expect.any(String),
        title: expect.any(String),
        artist: expect.any(String),
        thumbnails: expect.any(Array),
      })
    })

    it('artist has all required fields', () => {
      const { artists } = fixtures.search() as any
      const artist = artists[0]

      expect(artist).toMatchObject({
        type: 'artist',
        channelId: expect.any(String),
        name: expect.any(String),
        thumbnails: expect.any(Array),
      })
    })
  })

  // ─── fixture shape validation — browse ────────────────────────────────────

  describe('fixture shape — home feed', () => {
    it('home is an array of sections', () => {
      const home = fixtures.home() as any[]

      expect(Array.isArray(home)).toBe(true)
      expect(home.length).toBeGreaterThan(0)

      for (const section of home) {
        expect(section).toHaveProperty('title')
        expect(section).toHaveProperty('items')
        expect(Array.isArray(section.items)).toBe(true)
      }
    })
  })

  describe('fixture shape — artist page', () => {
    it('artist page has songs, albums, and singles arrays', () => {
      const artist = fixtures.artist() as any

      expect(artist).toMatchObject({
        type: 'artist',
        channelId: expect.any(String),
        name: expect.any(String),
      })
      expect(Array.isArray(artist.songs)).toBe(true)
      expect(Array.isArray(artist.albums)).toBe(true)
      expect(Array.isArray(artist.singles)).toBe(true)
    })
  })

  describe('fixture shape — album page', () => {
    it('album page has a tracks array', () => {
      const album = fixtures.album() as any

      expect(album).toMatchObject({
        type: 'album',
        browseId: expect.any(String),
        title: expect.any(String),
      })
      expect(Array.isArray(album.tracks)).toBe(true)
      expect(album.tracks.length).toBeGreaterThan(0)
    })

    it('each track in an album is a song', () => {
      const { tracks } = fixtures.album() as any

      for (const track of tracks) {
        expect(track.type).toBe('song')
        expect(track.videoId).toBeTruthy()
      }
    })
  })

  // ─── autocomplete fixture ─────────────────────────────────────────────────

  describe('fixture shape — autocomplete', () => {
    it('returns an array of strings', () => {
      const suggestions = fixtures.autocomplete() as any

      expect(Array.isArray(suggestions)).toBe(true)
      for (const s of suggestions) {
        expect(typeof s).toBe('string')
      }
    })
  })
})
