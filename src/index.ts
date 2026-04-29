export { MusicKit } from './musickit'
export { Cache } from './cache'
export { RateLimiter } from './rate-limiter'
export { RetryEngine, HttpError } from './retry'
export {
  MusicKitBaseError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  StreamError,
} from './errors'
export { SessionManager } from './session'
export { DiscoveryClient } from './discovery'
export { StreamResolver } from './stream'
export { Downloader } from './downloader'
export { MusicKitEmitter } from './events'
export { Logger } from './logger'

// Value exports (usable at runtime)
export { version } from '../package.json'
export { SearchFilter } from './models'
export { MusicKitErrorCode } from './models'
export { getBestThumbnail } from './utils/thumbnails'
export { isStreamExpired } from './utils/stream-utils'
export { JIOSAAVN_LANGUAGES } from './sources/jiosaavn'
export { parseLrc, getActiveLine, getActiveLineIndex, formatTimestamp, offsetLrc, serializeLrc } from './lyrics/lrc-utils'
export {
  ThumbnailSchema,
  SongSchema,
  AlbumSchema,
  ArtistSchema,
  PlaylistSchema,
  safeParseSong,
  safeParseAlbum,
  safeParseArtist,
  safeParsePlaylist,
} from './schemas'

// Type exports
export type {
  // Data models
  Song,
  Album,
  Artist,
  Playlist,
  Section,
  Thumbnail,
  MediaItem,
  StreamingData,
  AudioTrack,
  SearchResults,
  Lyrics,
  LyricLine,

  // Options & config
  SearchOptions,
  StreamOptions,
  StreamQuality,
  Quality,
  DownloadFormat,
  DownloadOptions,
  DownloadProgress,
  BrowseOptions,
  LogLevel,
  RateLimitConfig,
  CacheConfig,
  CacheTTLConfig,
  MusicKitConfig,
  SourceName,
  SourcePreference,

  // Events
  MusicKitEvent,
  MusicKitRequest,
  MusicKitError,
} from './models'
