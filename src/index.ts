export { MusicKit } from './musickit'
export { Cache } from './cache'
export { RateLimiter } from './rate-limiter'
export { RetryEngine, HttpError } from './retry'
export { SessionManager } from './session'
export { DiscoveryClient } from './discovery'
export { StreamResolver } from './stream'
export { Downloader } from './downloader'
export { MusicKitEmitter } from './events'

// Value exports (usable at runtime)
export { SearchFilter } from './models'
export { MusicKitErrorCode } from './models'
export { getBestThumbnail } from './utils/thumbnails'
export { isStreamExpired } from './utils/stream-utils'
export { JIOSAAVN_LANGUAGES } from './sources/jiosaavn'

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

  // Options & config
  SearchOptions,
  StreamOptions,
  StreamQuality,
  Quality,
  DownloadFormat,
  DownloadOptions,
  BrowseOptions,
  LogLevel,
  RateLimitConfig,
  CacheConfig,
  CacheTTLConfig,
  MusicKitConfig,

  // Events
  MusicKitEvent,
  MusicKitRequest,
  MusicKitError,
} from './models'
