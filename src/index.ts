export { MusicKit } from './musickit'
export { Cache } from './cache'
export { RateLimiter } from './rate-limiter'
export { RetryEngine, HttpError, NonRetryableError } from './retry'
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
export { Queue } from './queue'
export type { RepeatMode } from './queue'
export { Identifier } from './identifier'
export { MusicKitEmitter } from './events'
export { Logger } from './logger'

// Value exports (usable at runtime)
export { version } from '../package.json'
export { SearchFilter } from './models'
export { MusicKitErrorCode } from './models'
export { getBestThumbnail } from './utils/thumbnails'
export { isStreamExpired } from './utils/stream-utils'
export { resolveInput, resolveSpotifyUrl } from './utils/url-resolver'
export { PodcastClient } from './podcast'
export { parseLrc, getActiveLine, getActiveLineIndex, formatTimestamp, offsetLrc, serializeLrc } from './lyrics/lrc-utils'
export { betterLyricsProvider, fetchFromBetterLyrics, BETTER_LYRICS_BASE } from './lyrics/better-lyrics'
export { lrclibProvider, fetchFromLrclib } from './lyrics/lrclib'
export { lyricsOvhProvider, fetchFromLyricsOvh } from './lyrics/lyrics-ovh'
export { kugouProvider, fetchFromKuGou, KUGOU_SEARCH_BASE, KUGOU_LYRICS_BASE } from './lyrics/kugou'
export { fetchFromSimpMusic, simpMusicProvider } from './lyrics/simpmusic'
export { YouTubeNativeLyricsProvider } from './lyrics/youtube-native'
export { YouTubeSubtitleLyricsProvider } from './lyrics/youtube-subtitle'
export { LyricsRegistry } from './lyrics/registry'
export type { RegistryPosition } from './lyrics/registry'
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

// Analysis
export { EssentiaAnalysisProvider } from './analysis/essentia-provider'
export type { EssentiaInstance } from './analysis/essentia-provider'

// Type exports
export type { IdentifyResult } from './identifier'
export type { LyricsProvider, LyricsProviderName } from './lyrics/provider'
export type { Analysis, AnalysisProvider, Tempo, Key, Energy, Onsets, AnalysisSection, EnergyPoint, Camelot } from './analysis/types'

export type {
  // Data models
  Song,
  Album,
  Artist,
  Playlist,
  Podcast,
  PodcastEpisode,
  Section,
  Thumbnail,
  MediaItem,
  StreamingData,
  AudioTrack,
  SearchResults,
  Lyrics,
  LyricLine,
  LyricWord,
  WordTime,

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
