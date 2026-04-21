/**
 * Live API tests — hit real YouTube Music with no mocks or cached fixtures.
 *
 * These tests prove the SDK works against real responses, including cases
 * where static fixtures would hide bugs (e.g. field mapping, empty sections,
 * artist propagation on compilation albums).
 *
 * Run with: RUN_LIVE=1 pnpm test:integration
 *
 * Known stable IDs used:
 *   videoId  uT_HXrrmHX8           — Arijit Singh track (Radio test confirmed 50 results)
 *   artist   UCDxKh1gFWeYsqePvgVzmPoQ — Arijit Singh channel
 *   album    MPREb_HtIOxExZ0ci     — The Arijit Singh Collection (compilation — this is the one
 *                                    that exposed the artist/year swap bug)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { MusicKit } from '../../src/musickit'

const SKIP = !process.env.RUN_LIVE

const VIDEO_ID   = 'uT_HXrrmHX8'
const ARTIST_ID  = 'UCDxKh1gFWeYsqePvgVzmPoQ'
const ALBUM_ID   = 'MPREb_HtIOxExZ0ci'

describe.skipIf(SKIP)('Live API — real YouTube Music responses', () => {
  let mk: MusicKit

  beforeAll(async () => {
    mk = await MusicKit.create({ cache: { enabled: false } })
  }, 30_000)

  // ─── search ───────────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns songs with real metadata — no Unknown fields', async () => {
      const results = await mk.search('arijit singh', { filter: 'songs' })
      const songs = results as any[]

      expect(songs.length).toBeGreaterThan(0)

      for (const song of songs.slice(0, 5)) {
        expect(song.type).toBe('song')
        expect(song.videoId).toBeTruthy()
        expect(song.title).not.toBe('Unknown')
        expect(song.duration).toBeGreaterThan(0)
      }

      // YouTube Music occasionally omits artist metadata for some tracks (artists: []).
      // Assert the majority resolve correctly — not that every single item does.
      const sample = songs.slice(0, 10)
      const withArtist = sample.filter((s: any) => s.artist !== 'Unknown Artist')
      expect(withArtist.length).toBeGreaterThan(sample.length / 2)
    }, 20_000)

    it('returns playlists when filter is "playlists" — not an empty array', async () => {
      const results = await mk.search('top hits playlist', { filter: 'playlists' })
      const playlists = results as any[]

      expect(Array.isArray(playlists)).toBe(true)
      expect(playlists.length).toBeGreaterThan(0)

      const first = playlists[0]
      expect(first.type).toBe('playlist')
      expect(first.playlistId).toBeTruthy()
      expect(first.title).not.toBe('Unknown')
    }, 20_000)
  })

  // ─── getStream ────────────────────────────────────────────────────────────

  describe('getStream', () => {
    it('returns a real stream URL with codec and bitrate', async () => {
      const stream = await mk.getStream(VIDEO_ID)

      expect(stream.url).toMatch(/^https?:\/\//)
      expect(stream.codec).toMatch(/^(opus|mp4a)$/)
      expect(stream.bitrate).toBeGreaterThan(0)
      expect(stream.expiresAt).toBeGreaterThan(Date.now() / 1000)
    }, 20_000)

    it('high quality returns higher bitrate than low quality', async () => {
      const [high, low] = await Promise.all([
        mk.getStream(VIDEO_ID, { quality: 'high' }),
        mk.getStream(VIDEO_ID, { quality: 'low' }),
      ])

      expect(high.bitrate).toBeGreaterThan(low.bitrate)
    }, 30_000)

    it('unknown quality string falls back to high — not low', async () => {
      const high   = await mk.getStream(VIDEO_ID, { quality: 'high' })
      const result = await mk.getStream(VIDEO_ID, { quality: 'ultra' as any })

      // ultra is unknown → should resolve as high, so bitrate must match high
      expect(result.bitrate).toBe(high.bitrate)
    }, 30_000)
  })

  // ─── getAlbum ─────────────────────────────────────────────────────────────

  describe('getAlbum', () => {
    it('returns correct artist and year — not swapped', async () => {
      const album = await mk.getAlbum(ALBUM_ID)

      // The Arijit Singh Collection is a 2023 compilation.
      // Before the fix, artist was "2023" and year was undefined.
      expect(album.type).toBe('album')
      expect(album.title).toBeTruthy()
      expect(album.artist).not.toBe('2023')     // year must not bleed into artist
      expect(album.artist).not.toBe('Unknown Artist')
      if (album.year) {
        expect(album.year).toMatch(/^\d{4}$/)   // year must be a 4-digit string
      }
    }, 20_000)

    it('tracks are not all "Unknown Artist"', async () => {
      const album = await mk.getAlbum(ALBUM_ID)

      expect(album.tracks.length).toBeGreaterThan(0)

      const unknownCount = album.tracks.filter(t => t.artist === 'Unknown Artist').length
      // We allow some unknowns for truly missing metadata, but not ALL
      expect(unknownCount).toBeLessThan(album.tracks.length)
    }, 20_000)
  })

  // ─── getArtist ────────────────────────────────────────────────────────────

  describe('getArtist', () => {
    it('returns the artist with populated songs, albums, singles', async () => {
      const artist = await mk.getArtist(ARTIST_ID)

      expect(artist.type).toBe('artist')
      expect(artist.name).not.toBe('Unknown')
      expect(artist.channelId).toBe(ARTIST_ID)
      expect(artist.songs.length + artist.albums.length + artist.singles.length).toBeGreaterThan(0)
    }, 20_000)

    it('songs in artist sections have real artist names — not all Unknown Artist', async () => {
      const artist = await mk.getArtist(ARTIST_ID)

      if (artist.songs.length > 0) {
        const unknownCount = artist.songs.filter(s => s.artist === 'Unknown Artist').length
        expect(unknownCount).toBeLessThan(artist.songs.length)
      }
    }, 20_000)
  })

  // ─── getHome ──────────────────────────────────────────────────────────────

  describe('getHome', () => {
    it('returns sections — none with empty title and zero items', async () => {
      const sections = await mk.getHome()

      expect(sections.length).toBeGreaterThan(0)

      for (const section of sections) {
        // After the fix, empty sections (title='' AND items=[]) must not appear
        const isEmpty = section.title === '' && section.items.length === 0
        expect(isEmpty).toBe(false)
      }
    }, 20_000)
  })

  // ─── getCharts ────────────────────────────────────────────────────────────

  describe('getCharts', () => {
    it('returns sections — none fully empty', async () => {
      const sections = await mk.getCharts()

      expect(sections.length).toBeGreaterThan(0)

      for (const section of sections) {
        const isEmpty = section.title === '' && section.items.length === 0
        expect(isEmpty).toBe(false)
      }
    }, 20_000)

    it('sections have titles that are real strings', async () => {
      const sections = await mk.getCharts()

      for (const section of sections) {
        expect(typeof section.title).toBe('string')
      }
    }, 20_000)
  })

  // ─── getRadio ─────────────────────────────────────────────────────────────

  describe('getRadio', () => {
    it('returns at least 10 related songs', async () => {
      const songs = await mk.getRadio(VIDEO_ID)

      expect(songs.length).toBeGreaterThan(10)
      expect(songs[0].type).toBe('song')
      expect(songs[0].videoId).toBeTruthy()
    }, 20_000)
  })

  // ─── autocomplete ─────────────────────────────────────────────────────────

  describe('autocomplete', () => {
    it('returns suggestion strings for a partial query', async () => {
      const suggestions = await mk.autocomplete('arij')

      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeGreaterThan(0)
      for (const s of suggestions) {
        expect(typeof s).toBe('string')
        expect(s.length).toBeGreaterThan(0)
      }
    }, 20_000)
  })
})
