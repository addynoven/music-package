/**
 * Configuration — full MusicKit config reference.
 *
 * All options are optional. MusicKit works out of the box with zero config.
 * Override only what you need.
 */

import { MusicKit } from 'musickit'

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

  // Maximum backoff time when retrying after errors (seconds)
  // Default: 60s
  backoffMax: 120,

  // --- Session ---

  // Bring your own visitor ID — skips auto-generation
  // Default: auto-generated from YouTube and cached for 30 days
  visitorId: "CgtBQnlVMnBiVFJPYyiD7pK_BjIKCgJVUxIEGgAgWg%3D%3D",

  // Override the User-Agent sent with every request
  // Default: realistic Chrome on Windows UA string
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",

  // Content language for search results and home feed
  // Default: "en"
  language: "ja",

  // --- Caching ---

  cache: {
    // Directory for SQLite database and cached files
    // Default: OS temp dir + /musickit-cache/
    dir: "./my_cache",

    // Disable caching entirely (not recommended — causes re-fetching)
    // Default: true
    enabled: true,

    // Override TTLs (seconds)
    ttl: {
      stream: 18000,   // 5 hours (default: ~6h, matches YouTube URL expiry)
      search: 600,     // 10 minutes (default: 300s)
      home: 28800,     // 8 hours
      artist: 3600,    // 1 hour
    },
  },

  // --- Logging ---

  // Log level — controls what MusicKit prints to stderr
  // "debug" | "info" | "warning" | "error" | "silent"
  // Default: "info"
  logLevel: "debug",

  // Replace the default logger entirely
  // Receives pre-formatted log strings
  logHandler: (level, message) => {
    // Send to your own logging system
    console.log(`[${level.toUpperCase()}] ${message}`)
  },

  // --- Advanced ---

  // Route all requests through a proxy
  // Default: none
  proxy: "socks5://127.0.0.1:1080",
})

// --- Common patterns ---

// Silence all MusicKit logs (e.g. in a CLI app with its own UI)
const quiet = new MusicKit({ logLevel: "silent" })

// Aggressive caching for a bot that runs continuously
const botClient = new MusicKit({
  cache: {
    ttl: {
      search: 1800,   // 30 minutes — bot reuses search results longer
      home: 86400,    // 24 hours
    },
  },
  minRequestGap: 200, // extra conservative
})

// Development / debugging — no cache, full logs
const dev = new MusicKit({
  logLevel: "debug",
  cache: { enabled: false },
})
