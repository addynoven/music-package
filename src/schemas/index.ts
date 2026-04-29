import { z } from 'zod'
import type { Song, Album, Artist, Playlist } from '../models'

export const ThumbnailSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
})

export const SongSchema = z.object({
  type: z.literal('song'),
  videoId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  duration: z.number(),
  thumbnails: z.array(ThumbnailSchema),
  album: z.string().optional(),
})

export const AlbumSchema = z.object({
  type: z.literal('album'),
  browseId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  year: z.string().optional(),
  thumbnails: z.array(ThumbnailSchema),
  tracks: z.array(z.any()),
})

export const ArtistSchema = z.object({
  type: z.literal('artist'),
  channelId: z.string().min(1),
  name: z.string().min(1),
  thumbnails: z.array(ThumbnailSchema),
  songs: z.array(z.any()),
  albums: z.array(z.any()),
  singles: z.array(z.any()),
})

export const PlaylistSchema = z.object({
  type: z.literal('playlist'),
  playlistId: z.string().min(1),
  title: z.string().min(1),
  thumbnails: z.array(ThumbnailSchema),
})

export function safeParseSong(data: unknown): Song | null {
  const result = SongSchema.safeParse(data)
  return result.success ? (result.data as Song) : null
}

export function safeParseAlbum(data: unknown): Album | null {
  const result = AlbumSchema.safeParse(data)
  return result.success ? (result.data as Album) : null
}

export function safeParseArtist(data: unknown): Artist | null {
  const result = ArtistSchema.safeParse(data)
  return result.success ? (result.data as Artist) : null
}

export function safeParsePlaylist(data: unknown): Playlist | null {
  const result = PlaylistSchema.safeParse(data)
  return result.success ? (result.data as Playlist) : null
}
