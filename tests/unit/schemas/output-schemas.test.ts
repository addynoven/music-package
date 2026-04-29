import { describe, it, expect } from 'vitest'
import {
  SongSchema,
  AlbumSchema,
  ArtistSchema,
  PlaylistSchema,
  ThumbnailSchema,
  safeParseSong,
  safeParseAlbum,
  safeParseArtist,
  safeParsePlaylist,
} from '../../../src/schemas'

// ── ThumbnailSchema ───────────────────────────────────────────────────────────

describe('ThumbnailSchema', () => {
  it('accepts a valid thumbnail', () => {
    const result = ThumbnailSchema.safeParse({ url: 'https://i.ytimg.com/vi/abc/hq.jpg', width: 320, height: 180 })
    expect(result.success).toBe(true)
  })

  it('rejects missing url', () => {
    const result = ThumbnailSchema.safeParse({ width: 320, height: 180 })
    expect(result.success).toBe(false)
  })

  it('rejects non-string url', () => {
    const result = ThumbnailSchema.safeParse({ url: 123, width: 320, height: 180 })
    expect(result.success).toBe(false)
  })
})

// ── SongSchema ────────────────────────────────────────────────────────────────

describe('SongSchema', () => {
  const validSong = {
    type: 'song',
    videoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    duration: 213,
    thumbnails: [],
  }

  it('accepts a valid song', () => {
    expect(SongSchema.safeParse(validSong).success).toBe(true)
  })

  it('rejects missing videoId', () => {
    const { videoId: _, ...rest } = validSong
    expect(SongSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects missing title', () => {
    const { title: _, ...rest } = validSong
    expect(SongSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects missing artist', () => {
    const { artist: _, ...rest } = validSong
    expect(SongSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects empty videoId', () => {
    expect(SongSchema.safeParse({ ...validSong, videoId: '' }).success).toBe(false)
  })

  it('rejects empty title', () => {
    expect(SongSchema.safeParse({ ...validSong, title: '' }).success).toBe(false)
  })

  it('allows optional album field', () => {
    expect(SongSchema.safeParse({ ...validSong, album: 'Whenever You Need Somebody' }).success).toBe(true)
  })

  it('allows missing album field', () => {
    expect(SongSchema.safeParse(validSong).success).toBe(true)
  })
})

// ── AlbumSchema ───────────────────────────────────────────────────────────────

describe('AlbumSchema', () => {
  const validAlbum = {
    type: 'album',
    browseId: 'MPREb_abc123',
    title: 'Whenever You Need Somebody',
    artist: 'Rick Astley',
    thumbnails: [],
    tracks: [],
  }

  it('accepts a valid album', () => {
    expect(AlbumSchema.safeParse(validAlbum).success).toBe(true)
  })

  it('rejects missing browseId', () => {
    const { browseId: _, ...rest } = validAlbum
    expect(AlbumSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects empty browseId', () => {
    expect(AlbumSchema.safeParse({ ...validAlbum, browseId: '' }).success).toBe(false)
  })

  it('allows optional year', () => {
    expect(AlbumSchema.safeParse({ ...validAlbum, year: '1987' }).success).toBe(true)
  })
})

// ── ArtistSchema ──────────────────────────────────────────────────────────────

describe('ArtistSchema', () => {
  const validArtist = {
    type: 'artist',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    name: 'Rick Astley',
    thumbnails: [],
    songs: [],
    albums: [],
    singles: [],
  }

  it('accepts a valid artist', () => {
    expect(ArtistSchema.safeParse(validArtist).success).toBe(true)
  })

  it('rejects missing channelId', () => {
    const { channelId: _, ...rest } = validArtist
    expect(ArtistSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(ArtistSchema.safeParse({ ...validArtist, name: '' }).success).toBe(false)
  })
})

// ── PlaylistSchema ────────────────────────────────────────────────────────────

describe('PlaylistSchema', () => {
  const validPlaylist = {
    type: 'playlist',
    playlistId: 'PLrEnWoR732-BHrPp_Pm8_VleD68f9s14m',
    title: 'Rick Astley Greatest Hits',
    thumbnails: [],
  }

  it('accepts a valid playlist', () => {
    expect(PlaylistSchema.safeParse(validPlaylist).success).toBe(true)
  })

  it('rejects missing playlistId', () => {
    const { playlistId: _, ...rest } = validPlaylist
    expect(PlaylistSchema.safeParse(rest).success).toBe(false)
  })
})

// ── safe parse helpers ────────────────────────────────────────────────────────

describe('safeParseSong', () => {
  it('returns the song when valid', () => {
    const song = { type: 'song' as const, videoId: 'abc123', title: 'Test', artist: 'Artist', duration: 0, thumbnails: [] }
    expect(safeParseSong(song)).toEqual(song)
  })

  it('returns null when invalid', () => {
    expect(safeParseSong({ type: 'song', videoId: '', title: '', artist: '' })).toBeNull()
  })
})

describe('safeParseAlbum', () => {
  it('returns the album when valid', () => {
    const album = { type: 'album' as const, browseId: 'MPREb_abc', title: 'Album', artist: 'Artist', thumbnails: [], tracks: [] }
    expect(safeParseAlbum(album)).toEqual(album)
  })

  it('returns null when invalid', () => {
    expect(safeParseAlbum({ type: 'album', browseId: '', title: '' })).toBeNull()
  })
})

describe('safeParseArtist', () => {
  it('returns the artist when valid', () => {
    const artist = { type: 'artist' as const, channelId: 'UC123', name: 'Artist', thumbnails: [], songs: [], albums: [], singles: [] }
    expect(safeParseArtist(artist)).not.toBeNull()
  })

  it('returns null when invalid', () => {
    expect(safeParseArtist({ type: 'artist', channelId: '', name: '' })).toBeNull()
  })
})

describe('safeParsePlaylist', () => {
  it('returns the playlist when valid', () => {
    const pl = { type: 'playlist' as const, playlistId: 'PL123', title: 'List', thumbnails: [] }
    expect(safeParsePlaylist(pl)).not.toBeNull()
  })

  it('returns null when invalid', () => {
    expect(safeParsePlaylist({ type: 'playlist', playlistId: '', title: '' })).toBeNull()
  })
})
