/**
 * Configuration — full MusicKit config reference.
 *
 * All options are optional. MusicKit works out of the box with zero config.
 * Override only what you need.
 */

import { MusicKit } from 'musicstream-sdk'
import type { AudioSource, Song, StreamingData, SearchResults, SearchFilter } from 'musicstream-sdk'

// --- Zero config (recommended starting point) ---

const mk = new MusicKit()

// --- Full config with all options ---

const mkAdvanced = new MusicKit({
  // Rate limiting — max requests per minute per endpoint
  // Defaults: search=10, browse=20, stream=5, autocomplete=30
  rateLimit: {
    search: 20,
    browse: 30,
    stream: 10,
    autocomplete: 60,
  },

  // Minimum gap between any two requests (milliseconds)
  // Default: 100ms
  minRequestGap: 50,

  // Maximum backoff time when retrying after errors (milliseconds)
  // Default: 60_000ms (60s)
  backoffMax: 120_000,

  // Max retry attempts before throwing
  // Default: 3
  maxRetries: 5,

  // --- Session ---

  // Bring your own visitor ID — skips auto-generation
  // Default: auto-generated and cached for 30 days
  visitorId: 'CgtBQnlVMnBiVFJPYyiD7pK_BjIKCgJVUxIEGgAgWg%3D%3D',

  // Override the User-Agent sent with every request
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',

  // YouTube Music locale — sets hl (language) and gl (country) on the Innertube session.
  // Affects YT Music home feed, search language, and chart region.
  // JioSaavn language is per-call via getHome({ language }) — not set here.
  language: 'ja',   // BCP-47 code (e.g. 'hi', 'ja', 'ko', 'en')
  location: 'JP',   // ISO 3166-1 alpha-2 code (e.g. 'IN', 'JP', 'US')

  // --- Caching ---

  cache: {
    // Directory for the SQLite database
    // Default: OS temp dir + /musickit-cache/
    dir: './my_cache',

    // Disable caching entirely (not recommended — causes re-fetching)
    // Default: true
    enabled: true,

    // Override cache TTLs (seconds)
    ttl: {
      stream: 18_000,  // 5 hours  (default: 21_600)
      search: 600,     // 10 minutes (default: 300)
      home:   28_800,  // 8 hours
      artist: 3_600,   // 1 hour
    },
  },

  // --- Logging ---

  logLevel: 'debug',  // 'debug' | 'info' | 'warn' | 'error' | 'silent'  (default: 'info')
})

// --- Custom audio sources ---
//
// Register your own source to add new platforms or override existing behavior.
// See 13-custom-source.ts for a full walkthrough.

class MyCustomSource implements AudioSource {
  readonly name = 'my-source'

  canHandle(query: string): boolean {
    return query.startsWith('custom:')
  }

  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[]> {
    return []
  }

  async getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData> {
    return { url: '', codec: 'mp4a', bitrate: 0, expiresAt: 0 }
  }

  async getMetadata(id: string): Promise<Song> {
    return { type: 'song', videoId: id, title: '', artist: '', duration: 0, thumbnails: [] }
  }
}

const mkCustom = new MusicKit()
mkCustom.registerSource(new MyCustomSource())

// --- Common presets ---

// Silence all logs (e.g. in a CLI with its own output)
const quiet = new MusicKit({ logLevel: 'silent' })

// Long-running bot — longer cache TTLs to reduce API calls
const bot = new MusicKit({
  cache: {
    ttl: {
      search: 1_800,  // 30 minutes
      home:   86_400, // 24 hours
    },
  },
  minRequestGap: 200,
})

// Development / debugging — no cache, full logs
const dev = new MusicKit({
  logLevel: 'debug',
  cache: { enabled: false },
})
