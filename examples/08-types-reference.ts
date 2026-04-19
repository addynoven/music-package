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
  MediaItem,      // base type for any playable item
  Song,           // MediaItem with type: "song"
  Album,          // album with browse ID and optional tracks
  Artist,         // artist page with songs, albums, singles
  Playlist,       // user or YouTube-generated playlist
  Section,        // a group of items (used in home feed, charts)
  Thumbnail,      // image with url, width, height

  // --- Stream data ---
  StreamingData,  // resolved stream URL + metadata
  StreamQuality,  // "high" | "low"
  AudioTrack,     // Song + StreamingData combined

  // --- Search ---
  SearchFilter,   // "songs" | "albums" | "artists" | "playlists" | enum
  SearchOptions,  // { filter?: SearchFilter }
  SearchResults,  // { songs, albums, artists, playlists }

  // --- Stream options ---
  StreamOptions,  // { quality?: StreamQuality }

  // --- Download ---
  DownloadFormat,  // "opus" | "m4a"
  DownloadOptions, // { path, format?, onProgress? }

  // --- Browse ---
  BrowseOptions,   // { country?: string }  (used in getCharts)

  // --- Config ---
  MusicKitConfig,     // full constructor options
  RateLimitConfig,    // { search?, browse?, stream?, autocomplete? }
  CacheConfig,        // { dir?, enabled?, ttl? }
  CacheTTLConfig,     // { stream?, search?, home?, artist? }
  LogLevel,           // "debug" | "info" | "warning" | "error" | "silent"

  // --- Events ---
  MusicKitEvent,      // union of all event names
  MusicKitRequest,    // { method, endpoint, headers, body }
  MusicKitError,      // { code, message, endpoint?, statusCode? }
  MusicKitErrorCode,  // enum of all error codes
} from 'musickit'

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
// Error codes
// ─────────────────────────────────────────────

// MusicKitErrorCode enum values:
//
//   RateLimited         → 429 from YouTube — backing off
//   Forbidden           → 403 — visitor ID refreshed and retried
//   VideoUnavailable    → video was removed or doesn't exist
//   VideoUnplayable     → geo-restricted, age-gated, or premium
//   CipherFailure       → YouTube changed the stream cipher — update the package
//   NetworkError        → no internet / request timeout
//   ParseError          → YouTube changed their API response shape
//   DownloadError       → file write failed (permissions, disk space)
//   Unknown             → unexpected error

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
