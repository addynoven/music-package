/**
 * Live JioSaavn integration tests — hit the real JioSaavn API with no mocks.
 *
 * These tests verify that the full pipeline works against real responses:
 * search → get real jio: IDs → call browse endpoints → validate shapes.
 *
 * Run with: RUN_LIVE=1 pnpm test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { MusicKit } from '../../src/musickit'

const SKIP = !process.env.RUN_LIVE

describe.skipIf(SKIP)('Live JioSaavn API — real responses', () => {
  let mk: MusicKit

  // IDs resolved from search — populated in beforeAll
  let songId: string
  let albumId: string
  let artistId: string
  let playlistId: string

  beforeAll(async () => {
    mk = await MusicKit.create({ cache: { enabled: false } })

    // Resolve stable IDs via search so tests don't depend on hardcoded values
    const [songs, albums, artists, playlists] = await Promise.all([
      mk.search('Tum Hi Ho Arijit Singh', { filter: 'songs' }) as Promise<any[]>,
      mk.search('Aashiqui 2', { filter: 'albums' }) as Promise<any[]>,
      mk.search('Arijit Singh', { filter: 'artists' }) as Promise<any[]>,
      mk.search('top bollywood hits', { filter: 'playlists' }) as Promise<any[]>,
    ])

    songId     = songs[0]?.videoId
    albumId    = albums[0]?.browseId
    artistId   = artists[0]?.channelId
    playlistId = playlists[0]?.playlistId
  }, 60_000)

  // ─── search — all filters via JioSaavn ────────────────────────────────────

  describe('search', () => {
    it('song search returns jio:-prefixed videoIds', async () => {
      const results = await mk.search('arijit singh', { filter: 'songs' }) as any[]
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].videoId).toMatch(/^jio:/)
      expect(results[0].type).toBe('song')
      expect(results[0].title).toBeTruthy()
      expect(results[0].duration).toBeGreaterThan(0)
    }, 20_000)

    it('album search returns jio:-prefixed browseIds', async () => {
      const results = await mk.search('aashiqui 2', { filter: 'albums' }) as any[]
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].browseId).toMatch(/^jio:/)
      expect(results[0].type).toBe('album')
      expect(results[0].title).toBeTruthy()
    }, 20_000)

    it('artist search returns jio:-prefixed channelIds', async () => {
      const results = await mk.search('arijit singh', { filter: 'artists' }) as any[]
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].channelId).toMatch(/^jio:/)
      expect(results[0].type).toBe('artist')
      expect(results[0].name).toBeTruthy()
    }, 20_000)

    it('playlist search returns jio:-prefixed playlistIds', async () => {
      const results = await mk.search('top bollywood', { filter: 'playlists' }) as any[]
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].playlistId).toMatch(/^jio:/)
      expect(results[0].type).toBe('playlist')
    }, 20_000)

    it('no-filter search returns all four types', async () => {
      const results = await mk.search('arijit singh') as any
      expect(Array.isArray(results.songs)).toBe(true)
      expect(Array.isArray(results.albums)).toBe(true)
      expect(Array.isArray(results.artists)).toBe(true)
      expect(Array.isArray(results.playlists)).toBe(true)
      expect(results.songs.length + results.albums.length + results.artists.length).toBeGreaterThan(0)
    }, 20_000)
  })

  // ─── getStream — JioSaavn 320kbps ─────────────────────────────────────────

  describe('getStream', () => {
    it('returns a real stream URL from JioSaavn CDN', async () => {
      expect(songId).toMatch(/^jio:/)
      const stream = await mk.getStream(songId)

      expect(stream.url).toMatch(/^https?:\/\//)
      expect(stream.url).toMatch(/saavncdn\.com|jiosaavn\.com/)
      expect(stream.codec).toBe('mp4a')
      expect(stream.bitrate).toBeGreaterThan(0)
      expect(stream.expiresAt).toBeGreaterThan(Date.now() / 1000)
    }, 20_000)

    it('high quality returns 320kbps URL', async () => {
      const stream = await mk.getStream(songId, { quality: 'high' })
      expect(stream.url).toContain('_320')
      expect(stream.bitrate).toBe(320_000)
    }, 20_000)

    it('low quality returns 96kbps URL', async () => {
      const stream = await mk.getStream(songId, { quality: 'low' })
      expect(stream.url).toContain('_96')
      expect(stream.bitrate).toBe(96_000)
    }, 20_000)
  })

  // ─── getAlbum — full album with tracks ────────────────────────────────────

  describe('getAlbum', () => {
    it('returns album shape with all required fields', async () => {
      expect(albumId).toMatch(/^jio:/)
      const album = await mk.getAlbum(albumId)

      expect(album.type).toBe('album')
      expect(album.browseId).toBe(albumId)
      expect(album.title).toBeTruthy()
      expect(album.artist).not.toBe('Unknown Artist')
      expect(Array.isArray(album.tracks)).toBe(true)
    }, 20_000)

    it('album tracks are songs with jio:-prefixed videoIds', async () => {
      const album = await mk.getAlbum(albumId)

      expect(album.tracks.length).toBeGreaterThan(0)
      for (const track of album.tracks.slice(0, 3)) {
        expect(track.type).toBe('song')
        expect(track.videoId).toMatch(/^jio:/)
        expect(track.title).toBeTruthy()
      }
    }, 20_000)

    it('album has thumbnails', async () => {
      const album = await mk.getAlbum(albumId)
      expect(album.thumbnails.length).toBeGreaterThan(0)
      expect(album.thumbnails[0].url).toMatch(/^https?:\/\//)
    }, 20_000)
  })

  // ─── getArtist — full artist page ─────────────────────────────────────────

  describe('getArtist', () => {
    it('returns artist shape with all required fields', async () => {
      expect(artistId).toMatch(/^jio:/)
      const artist = await mk.getArtist(artistId)

      expect(artist.type).toBe('artist')
      expect(artist.channelId).toBe(artistId)
      expect(artist.name).toBeTruthy()
      expect(artist.name).not.toBe('Unknown')
    }, 20_000)

    it('artist has songs array with jio:-prefixed videoIds', async () => {
      const artist = await mk.getArtist(artistId)

      expect(Array.isArray(artist.songs)).toBe(true)
      if (artist.songs.length > 0) {
        expect(artist.songs[0].videoId).toMatch(/^jio:/)
        expect(artist.songs[0].type).toBe('song')
      }
    }, 20_000)

    it('artist has albums array', async () => {
      const artist = await mk.getArtist(artistId)
      expect(Array.isArray(artist.albums)).toBe(true)
      expect(Array.isArray(artist.singles)).toBe(true)
    }, 20_000)
  })

  // ─── getPlaylist — full playlist with songs ────────────────────────────────

  describe('getPlaylist', () => {
    it('returns playlist shape with all required fields', async () => {
      expect(playlistId).toMatch(/^jio:/)
      const playlist = await mk.getPlaylist(playlistId)

      expect(playlist.type).toBe('playlist')
      expect(playlist.playlistId).toBe(playlistId)
      expect(playlist.title).toBeTruthy()
    }, 20_000)

    it('playlist has songs array with jio:-prefixed videoIds', async () => {
      const playlist = await mk.getPlaylist(playlistId)

      expect(Array.isArray(playlist.songs)).toBe(true)
      expect(playlist.songs!.length).toBeGreaterThan(0)
      for (const song of playlist.songs!.slice(0, 3)) {
        expect(song.type).toBe('song')
        expect(song.videoId).toMatch(/^jio:/)
        expect(song.title).toBeTruthy()
      }
    }, 20_000)

    it('playlist has thumbnails', async () => {
      const playlist = await mk.getPlaylist(playlistId)
      expect(playlist.thumbnails.length).toBeGreaterThan(0)
    }, 20_000)
  })

  // ─── getRadio — JioSaavn radio station ────────────────────────────────────

  describe('getRadio', () => {
    it('returns Song[] from JioSaavn radio', async () => {
      expect(songId).toMatch(/^jio:/)
      const songs = await mk.getRadio(songId)

      expect(Array.isArray(songs)).toBe(true)
      expect(songs.length).toBeGreaterThan(0)
    }, 30_000)

    it('radio songs have jio:-prefixed videoIds and correct type', async () => {
      const songs = await mk.getRadio(songId)

      for (const song of songs.slice(0, 5)) {
        expect(song.type).toBe('song')
        expect(song.videoId).toMatch(/^jio:/)
        expect(song.title).toBeTruthy()
      }
    }, 30_000)

    it('radio does not include the stationid as a song', async () => {
      const songs = await mk.getRadio(songId)
      // stationid field should have been stripped — no song should have 'stationid' as videoId
      expect(songs.every(s => s.videoId !== 'stationid')).toBe(true)
    }, 30_000)
  })

  // ─── getHome — JioSaavn browse modules ────────────────────────────────────

  describe('getHome', () => {
    it('returns sections — not empty', async () => {
      const sections = await mk.getHome()

      expect(Array.isArray(sections)).toBe(true)
      expect(sections.length).toBeGreaterThan(0)
    }, 20_000)

    it('each section has title and items', async () => {
      const sections = await mk.getHome()

      for (const section of sections) {
        expect(typeof section.title).toBe('string')
        expect(section.title.length).toBeGreaterThan(0)
        expect(Array.isArray(section.items)).toBe(true)
      }
    }, 20_000)

    it('section items are songs or albums — not raw objects', async () => {
      const sections = await mk.getHome()
      const allItems = sections.flatMap(s => s.items)

      expect(allItems.length).toBeGreaterThan(0)
      for (const item of allItems.slice(0, 5)) {
        expect(['song', 'album']).toContain(item.type)
      }
    }, 20_000)
  })
})
