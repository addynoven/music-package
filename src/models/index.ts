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
  subscribers?: string
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
  songs?: Song[]
  songCount?: number
}

export interface Section {
  title: string
  items: (Song | Album | Artist | Playlist)[]
}

export interface WordTime {
  time: number          // seconds from track start
  duration?: number     // seconds; optional — only providers with word-level duration set this (BetterLyrics)
  text: string
}

/**
 * @deprecated Use `WordTime`. `LyricWord` is kept as an alias for v4.0.x compat.
 */
export type LyricWord = WordTime

export interface LyricLine {
  time: number  // seconds (e.g. 17.73)
  text: string
  words?: WordTime[]  // present only when enhanced LRC word-level timestamps exist
}

export type LyricsProviderName =
  | 'better-lyrics'
  | 'lrclib'
  | 'lyrics-ovh'
  | 'kugou'
  | 'simpmusic'
  | 'youtube-native'
  | 'youtube-subtitle'

export interface Lyrics {
  plain: string
  synced: LyricLine[] | null  // null when source only has plain text
  source?: LyricsProviderName  // name of the provider that produced this result
}

export interface StreamingData {
  url: string
  codec: 'opus' | 'mp4a'
  mimeType: string
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

// MediaItem — union of all playable/browsable content types
export type MediaItem = Song | Album | Artist | Playlist

export const SearchFilter = {
  Songs: 'songs',
  Albums: 'albums',
  Artists: 'artists',
  Playlists: 'playlists',
} as const
export type SearchFilter = typeof SearchFilter[keyof typeof SearchFilter]

export type Quality = 'high' | 'low'
export type StreamQuality = Quality

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

export type DownloadFormat = 'opus' | 'm4a'

export interface SearchOptions {
  filter?: SearchFilter
}

export interface StreamOptions {
  quality?: Quality
}

export interface DownloadProgress {
  percent: number
  bytesDownloaded: number
  totalBytes?: number
  filename: string
}

export interface DownloadOptions {
  path?: string
  format?: DownloadFormat
  onProgress?: (progress: DownloadProgress) => void
}

export interface BrowseOptions {
  country?: string
}

export interface RateLimitConfig {
  search?: number
  browse?: number
  stream?: number
  autocomplete?: number
}

export interface CacheTTLConfig {
  stream?: number
  search?: number
  home?: number
  artist?: number
}

export interface CacheConfig {
  dir?: string
  enabled?: boolean
  ttl?: CacheTTLConfig
}

export type SourceName = 'youtube'
export type SourcePreference = 'best' | SourceName[]

/** Spec entry: built-in name string OR a custom LyricsProvider implementation. */
export type LyricsProviderSpec = LyricsProviderName | { name: LyricsProviderName; fetch: (...args: unknown[]) => Promise<Lyrics | null> }

export interface LyricsConfig {
  /**
   * Override the default lyrics provider chain.
   *
   * Pass an array of built-in provider names in your preferred order, or
   * mix in custom `LyricsProvider` instances. Omitted providers are
   * disabled.
   *
   * Default order (when undefined):
   *   ['better-lyrics', 'lrclib', 'simpmusic', 'youtube-native',
   *    'kugou', 'lyrics-ovh', 'youtube-subtitle']
   */
  providers?: LyricsProviderSpec[]
}

export interface MusicKitConfig {
  logLevel?: LogLevel
  logHandler?: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void
  rateLimit?: RateLimitConfig
  minRequestGap?: number
  cache?: CacheConfig
  visitorId?: string
  userAgent?: string
  language?: string
  location?: string
  proxy?: string
  maxRetries?: number
  backoffBase?: number
  backoffMax?: number
  sourceOrder?: SourcePreference
  cookiesPath?: string
  youtubeApiKey?: string
  identify?: {
    acoustidApiKey: string
    songrecBin?: string
  }
  /**
   * Static PoToken passed to every InnerTube client that needs one.
   * Most content streams without a PoToken via ANDROID_VR; web clients
   * increasingly require one. Provide either a static token or a
   * `getPoToken` callback. If both are set, `getPoToken` wins.
   */
  poToken?: string
  /**
   * Async PoToken generator — called per (videoId, client) when a
   * PoToken is needed. Return null to skip PoToken for that call.
   * Use this when your PoToken comes from an external service or a
   * puppeteer-based generator.
   */
  getPoToken?: (videoId: string, client: string) => Promise<string | null>
  /**
   * Lyrics provider chain configuration. See `LyricsConfig`.
   */
  lyrics?: LyricsConfig
  /**
   * Audio analysis configuration.
   * Defaults to `EssentiaAnalysisProvider` when not provided.
   */
  analysis?: {
    /**
     * Custom `AnalysisProvider` implementation. When omitted the default
     * `EssentiaAnalysisProvider` is used.
     */
    provider?: import('../analysis/types').AnalysisProvider
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface MusicKitRequest {
  method: string
  endpoint: string
  headers: Record<string, string>
  body: unknown
}

export const MusicKitErrorCode = {
  RateLimited: 'RATE_LIMITED',
  Forbidden: 'FORBIDDEN',
  VideoUnavailable: 'VIDEO_UNAVAILABLE',
  VideoUnplayable: 'VIDEO_UNPLAYABLE',
  CipherFailure: 'CIPHER_FAILURE',
  NetworkError: 'NETWORK_ERROR',
  ParseError: 'PARSE_ERROR',
  DownloadError: 'DOWNLOAD_ERROR',
  Unknown: 'UNKNOWN',
} as const
export type MusicKitErrorCode = typeof MusicKitErrorCode[keyof typeof MusicKitErrorCode]

export interface MusicKitError extends Error {
  code: MusicKitErrorCode
  endpoint?: string
  statusCode?: number
}

export type MusicKitEvent =
  | 'beforeRequest'
  | 'afterRequest'
  | 'cacheHit'
  | 'cacheMiss'
  | 'rateLimited'
  | 'retry'
  | 'error'

export interface PodcastEpisode {
  type: 'episode'
  guid: string
  title: string
  description: string
  url: string
  mimeType: string
  duration: number
  publishedAt: string
  thumbnails: Thumbnail[]
  season?: number
  episode?: number
  explicit: boolean
}

export interface Podcast {
  type: 'podcast'
  feedUrl: string
  title: string
  description: string
  author: string
  language: string
  link: string
  thumbnails: Thumbnail[]
  episodes: PodcastEpisode[]
}
