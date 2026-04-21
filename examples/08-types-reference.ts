/**
 * Types Reference — every type exported by MusicKit.
 *
 * This file is a living reference. It won't run — it's for
 * exploring the type system and what each field means.
 */

import type {
  // --- Core data models ---
  MediaItem,      // Song | Album | Artist | Playlist
  Song,           // type: "song", videoId, title, artist, album?, duration, thumbnails
  Album,          // type: "album", browseId, title, artist, year?, thumbnails, tracks
  Artist,         // type: "artist", channelId, name, subscribers?, thumbnails, songs, albums, singles
  Playlist,       // type: "playlist", playlistId, title, thumbnails, songs?
  Section,        // title + items[] — used in home feed and charts
  Thumbnail,      // { url, width, height }

  // --- Stream data ---
  StreamingData,  // url, codec, bitrate, expiresAt, loudnessDb?, sizeBytes?
  StreamQuality,  // "high" | "low"
  AudioTrack,     // Song + stream: StreamingData  (YouTube video IDs only via getTrack())

  // --- Source plugin interface ---
  AudioSource,    // interface for custom source plugins

  // --- Search ---
  SearchFilter,   // "songs" | "albums" | "artists" | "playlists" — also a const enum
  SearchOptions,  // { filter?: SearchFilter }
  SearchResults,  // { songs, albums, artists, playlists }

  // --- Stream options ---
  StreamOptions,  // { quality?: StreamQuality }

  // --- Download ---
  DownloadFormat,  // "opus" | "m4a"
  DownloadOptions, // { path?, format?, onProgress? }

  // --- Browse ---
  BrowseOptions,   // { country?: string }

  // --- Config ---
  MusicKitConfig,    // full constructor options
  RateLimitConfig,   // { search?, browse?, stream?, autocomplete? }
  CacheConfig,       // { dir?, enabled?, ttl? }
  CacheTTLConfig,    // { stream?, search?, home?, artist? }
  LogLevel,          // "debug" | "info" | "warn" | "error" | "silent"

  // --- Events ---
  MusicKitEvent,     // union of all event name strings
  MusicKitRequest,   // { method, endpoint, headers, body }
  MusicKitError,     // { code: MusicKitErrorCode, message, endpoint?, statusCode? }
  MusicKitErrorCode, // const enum of all error codes
} from 'musicstream-sdk'

import { SearchFilter, MusicKitErrorCode } from 'musicstream-sdk'

// ─────────────────────────────────────────────
// IDs are opaque tokens
// ─────────────────────────────────────────────
//
// IDs returned by search() and browse methods are opaque strings.
// Pass them back to getStream / getAlbum / getArtist / getPlaylist as-is.
// Never construct or parse them — the format is an internal implementation detail.

// ─────────────────────────────────────────────
// Data model shapes
// ─────────────────────────────────────────────

const song: Song = {
  type: 'song',
  videoId: '<opaque-id>',              // from search() — pass to getStream()
  title: 'Tum Hi Ho',
  artist: 'Arijit Singh',
  album: 'Aashiqui 2',                 // optional
  duration: 252,                       // seconds
  thumbnails: [
    { url: 'https://...150x150.jpg', width: 150, height: 150 },
    { url: 'https://...500x500.jpg', width: 500, height: 500 },
  ],
}

const album: Album = {
  type: 'album',
  browseId: '<opaque-id>',             // from search() — pass to getAlbum()
  title: 'Aashiqui 2',
  artist: 'Mohit Chauhan',
  year: '2013',                        // optional
  thumbnails: [{ url: 'https://...', width: 300, height: 300 }],
  tracks: [],                          // Song[] — empty from search, populated by getAlbum()
}

const playlist: Playlist = {
  type: 'playlist',
  playlistId: '<opaque-id>',           // from search() — pass to getPlaylist()
  title: 'Bollywood Top 50',
  thumbnails: [{ url: 'https://...', width: 300, height: 300 }],
  songs: [],                           // Song[] — empty from search, populated by getPlaylist()
}

const artist: Artist = {
  type: 'artist',
  channelId: '<opaque-id>',            // from search() — pass to getArtist()
  name: 'Arijit Singh',
  subscribers: '10M',                  // optional — may not be available for all artists
  thumbnails: [{ url: 'https://...', width: 300, height: 300 }],
  songs: [],                           // Song[] — empty from search, populated by getArtist()
  albums: [],                          // Album[]
  singles: [],                         // Album[]
}

const streamData: StreamingData = {
  url: 'https://...',
  codec: 'opus',                       // "opus" or "mp4a" depending on the track
  bitrate: 320_000,                    // bits per second
  expiresAt: 1744300800,              // Unix timestamp — re-fetch before expiry
  loudnessDb: -7.2,                   // optional — LUFS for normalization
  sizeBytes: 3_456_789,               // optional — total file size
}

// ─────────────────────────────────────────────
// SearchFilter — works as both value and type
// ─────────────────────────────────────────────

const _ = SearchFilter.Songs       // "songs"
const __ = SearchFilter.Albums     // "albums"
const ___ = SearchFilter.Artists   // "artists"
const ____ = SearchFilter.Playlists // "playlists"

const filter: SearchFilter = 'songs'

// ─────────────────────────────────────────────
// Error codes
// ─────────────────────────────────────────────

//   RateLimited         → "RATE_LIMITED"       — 429 from upstream
//   Forbidden           → "FORBIDDEN"           — 403
//   VideoUnavailable    → "VIDEO_UNAVAILABLE"   — removed/doesn't exist
//   VideoUnplayable     → "VIDEO_UNPLAYABLE"    — geo-restricted, age-gated
//   CipherFailure       → "CIPHER_FAILURE"      — stream cipher changed
//   NetworkError        → "NETWORK_ERROR"       — no internet / timeout
//   ParseError          → "PARSE_ERROR"         — API response shape changed
//   DownloadError       → "DOWNLOAD_ERROR"      — file write failed
//   Unknown             → "UNKNOWN"             — unexpected error

const code: MusicKitErrorCode = MusicKitErrorCode.RateLimited

// ─────────────────────────────────────────────
// Event names
// ─────────────────────────────────────────────

//   "beforeRequest"       → (req: MusicKitRequest) => void
//   "afterRequest"        → (req: MusicKitRequest, durationMs: number, status: number) => void
//   "rateLimited"         → (endpoint: string, waitMs: number) => void
//   "cacheHit"            → (key: string, ttlRemaining: number) => void
//   "cacheMiss"           → (key: string) => void
//   "visitorIdRefreshed"  → (oldId: string, newId: string) => void
//   "retry"               → (endpoint: string, attempt: number, reason: string) => void
//   "error"               → (err: MusicKitError) => void

export {}
