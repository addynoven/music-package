export interface Thumbnail {
  url: string
  width: number
  height: number
}

export interface Song {
  type: 'song'
  videoId: string
  title: string
  artist: string
  album?: string
  duration: number
  thumbnails: Thumbnail[]
}

export interface Album {
  type: 'album'
  browseId: string
  title: string
  artist: string
  year?: string
  thumbnails: Thumbnail[]
  tracks: Song[]
}

export interface Artist {
  type: 'artist'
  channelId: string
  name: string
  thumbnails: Thumbnail[]
  songs: Song[]
  albums: Album[]
  singles: Album[]
}

export interface Playlist {
  type: 'playlist'
  playlistId: string
  title: string
  thumbnails: Thumbnail[]
}

export interface Section {
  title: string
  items: (Song | Album | Artist | Playlist)[]
}

export interface StreamingData {
  url: string
  codec: 'opus' | 'mp4a'
  bitrate: number
  expiresAt: number
  loudnessDb?: number
  sizeBytes?: number
}

export interface AudioTrack extends Song {
  stream: StreamingData
}

export interface SearchResults {
  songs: Song[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

export const SearchFilter = {
  Songs: 'songs',
  Albums: 'albums',
  Artists: 'artists',
  Playlists: 'playlists',
} as const
export type SearchFilter = typeof SearchFilter[keyof typeof SearchFilter]

export type Quality = 'high' | 'low'
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

export interface RateLimitConfig {
  search?: number
  browse?: number
  stream?: number
  autocomplete?: number
}

export interface CacheConfig {
  dir?: string
  enabled?: boolean
  ttl?: {
    stream?: number
    search?: number
    home?: number
    artist?: number
  }
}

export interface MusicKitConfig {
  logLevel?: LogLevel
  logHandler?: (level: LogLevel, message: string) => void
  rateLimit?: RateLimitConfig
  minRequestGap?: number
  cache?: CacheConfig
  visitorId?: string
  userAgent?: string
  language?: string
  proxy?: string
  maxRetries?: number
  backoffBase?: number
  backoffMax?: number
}
