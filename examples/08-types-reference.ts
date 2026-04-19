/**
 * Types Reference — every type exported by MusicKit.
 *
 * This file is a living reference. It won't run — it's for
 * exploring the type system and what each field means.
 *
 * All types are available for both TypeScript and JavaScript users
 * via the bundled .d.ts files.
 */

import type {
  // --- Core data models ---
  MediaItem,      // Song | Album | Artist | Playlist
  Song,           // type: "song", videoId, title, artist, album?, duration, thumbnails
  Album,          // type: "album", browseId, title, artist, year?, thumbnails, tracks
  Artist,         // type: "artist", channelId, name, subscribers?, thumbnails, songs, albums, singles
  Playlist,       // type: "playlist", playlistId, title, thumbnails
  Section,        // title + items[] — used in home feed and charts
  Thumbnail,      // { url, width, height }

  // --- Stream data ---
  StreamingData,  // url, codec, bitrate, expiresAt, loudnessDb?, sizeBytes?
  StreamQuality,  // "high" | "low"
  AudioTrack,     // Song + stream: StreamingData

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
  MusicKitConfig,     // full constructor options
  RateLimitConfig,    // { search?, browse?, stream?, autocomplete? }
  CacheConfig,        // { dir?, enabled?, ttl? }
  CacheTTLConfig,     // { stream?, search?, home?, artist? }
  LogLevel,           // "debug" | "info" | "warn" | "error" | "silent"

  // --- Events ---
  MusicKitEvent,      // union of all event name strings
  MusicKitRequest,    // { method, endpoint, headers, body }
  MusicKitError,      // { code: MusicKitErrorCode, message, endpoint?, statusCode? }
  MusicKitErrorCode,  // const enum of all error codes
} from 'musicstream-sdk'

import { SearchFilter, MusicKitErrorCode } from 'musicstream-sdk'

// ─────────────────────────────────────────────
// Data model shapes (for reference)
// ─────────────────────────────────────────────

const song: Song = {
  type: "song",
  videoId: "fJ9rUzIMcZQ",
  title: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",       // optional
  duration: 354,                        // seconds
  thumbnails: [
    { url: "https://...", width: 226, height: 226 },
    { url: "https://...", width: 576, height: 576 },
  ],
}

const album: Album = {
  type: "album",
  browseId: "MPREb_4pL8gzRtw1v",
  title: "A Night at the Opera",
  artist: "Queen",
  year: "1975",                         // optional
  thumbnails: [{ url: "https://...", width: 226, height: 226 }],
  tracks: [],                           // Song[] — populated by getAlbum(), not search()
}

const artist: Artist = {
  type: "artist",
  channelId: "UCiMhD4jzUqG-IgPzUmmytRQ",
  name: "Queen",
  subscribers: "10M",                  // optional — display string from YouTube
  thumbnails: [{ url: "https://...", width: 900, height: 900 }],
  songs: [],                            // Song[] — populated by getArtist(), not search()
  albums: [],                           // Album[]
  singles: [],                          // Album[]
}

const stream: StreamingData = {
  url: "https://rr5---sn-something.googlevideo.com/videoplayback?...",
  codec: "opus",                        // "opus" | "mp4a"
  bitrate: 160000,                      // bits per second
  expiresAt: 1744300800,               // Unix timestamp (~6 hours from resolution)
  loudnessDb: -7.2,                    // optional — LUFS value for normalization
  sizeBytes: 3456789,                  // optional — total audio file size
}

const track: AudioTrack = {
  ...song,
  stream,
}

// ─────────────────────────────────────────────
// SearchFilter — works as both value and type
// ─────────────────────────────────────────────

// As a value (for autocomplete-friendly code):
const _ = SearchFilter.Songs      // "songs"
const __ = SearchFilter.Albums    // "albums"
const ___ = SearchFilter.Artists  // "artists"

// As a type annotation:
const filter: SearchFilter = "songs"

// ─────────────────────────────────────────────
// Error codes
// ─────────────────────────────────────────────

// MusicKitErrorCode values:
//
//   RateLimited         → "RATE_LIMITED"       — 429 from YouTube
//   Forbidden           → "FORBIDDEN"           — 403
//   VideoUnavailable    → "VIDEO_UNAVAILABLE"   — removed/doesn't exist
//   VideoUnplayable     → "VIDEO_UNPLAYABLE"    — geo-restricted, age-gated
//   CipherFailure       → "CIPHER_FAILURE"      — YouTube changed stream cipher
//   NetworkError        → "NETWORK_ERROR"       — no internet / timeout
//   ParseError          → "PARSE_ERROR"         — YouTube changed API shape
//   DownloadError       → "DOWNLOAD_ERROR"      — file write failed
//   Unknown             → "UNKNOWN"             — unexpected error

const code: MusicKitErrorCode = MusicKitErrorCode.RateLimited

// ─────────────────────────────────────────────
// Event names
// ─────────────────────────────────────────────

// MusicKitEvent values:
//
//   "beforeRequest"       → (req: MusicKitRequest) => void
//   "afterRequest"        → (req: MusicKitRequest, durationMs: number, status: number) => void
//   "rateLimited"         → (endpoint: string, waitMs: number) => void
//   "cacheHit"            → (key: string, ttlRemaining: number) => void
//   "cacheMiss"           → (key: string) => void
//   "visitorIdRefreshed"  → (oldId: string, newId: string) => void
//   "retry"               → (endpoint: string, attempt: number, reason: string) => void
//   "error"               → (err: MusicKitError) => void

export {}
