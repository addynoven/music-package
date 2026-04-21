/**
 * Events — hook into MusicKit's internal lifecycle.
 *
 * Events let you observe and react to what MusicKit is doing
 * without modifying its behavior. Useful for:
 *   - Custom logging / metrics
 *   - UI feedback ("rate limited...", "retrying...")
 *   - Debugging the anti-ban layer
 */

import { MusicKit } from 'musicstream-sdk'
import type { MusicKitRequest, MusicKitError, MusicKitErrorCode } from 'musicstream-sdk'

const mk = new MusicKit({ logLevel: 'silent' }) // silence built-in logs, use our own

// --- beforeRequest ---
// Fires before every outgoing HTTP request.

mk.on('beforeRequest', (req: MusicKitRequest) => {
  console.log(`→ ${req.method} ${req.endpoint}`)
  // req.endpoint  — "search" | "browse" | "autocomplete" | "stream" | ...
  // req.headers   — the full headers object
  // req.body      — request body (for POST requests)
})

// --- afterRequest ---
// Fires after every completed request.

mk.on('afterRequest', (req: MusicKitRequest, durationMs: number, status: number) => {
  console.log(`← ${req.endpoint} ${status} (${durationMs}ms)`)
})

// --- rateLimited ---
// Fires when MusicKit pauses before a request due to rate limiting.

mk.on('rateLimited', (endpoint: string, waitMs: number) => {
  console.log(`Rate limited on [${endpoint}] — waiting ${waitMs}ms`)
})

// --- cacheHit ---
// Fires when a cached result is returned instead of making a network request.

mk.on('cacheHit', (key: string, ttlRemaining: number) => {
  console.log(`Cache hit: ${key} (${Math.round(ttlRemaining / 60)}min remaining)`)
})

// --- cacheMiss ---
// Fires when no cached result exists and a network request will be made.

mk.on('cacheMiss', (key: string) => {
  console.log(`Cache miss: ${key}`)
})

// --- visitorIdRefreshed ---
// Fires when the session visitor ID expires and a new one is generated.
// Normal behavior — happens every ~30 days.

mk.on('visitorIdRefreshed', (oldId: string, newId: string) => {
  console.log('Session ID rotated')
  // Persist newId if you're managing session state externally
})

// --- retry ---
// Fires when a request fails and MusicKit is about to retry.

mk.on('retry', (endpoint: string, attempt: number, reason: string) => {
  console.log(`Retrying ${endpoint} (attempt ${attempt}/3): ${reason}`)
})

// --- error ---
// Fires when a request fails after all retries are exhausted.

mk.on('error', (err: MusicKitError) => {
  console.error(`Error [${err.code}]: ${err.message}`)

  if (err.code === 'RATE_LIMITED') {
    notifyAdmin(`Rate limit hit: ${err.endpoint}`)
  }

  if (err.code === 'VIDEO_UNAVAILABLE') {
    console.warn('Track unavailable, skipping')
  }

  if (err.code === 'CIPHER_FAILURE') {
    console.error('Stream cipher broken — update musicstream-sdk to the latest version')
  }
})

// --- Remove a listener ---

const handler = (key: string) => console.log(`hit: ${key}`)
mk.on('cacheHit', handler)
mk.off('cacheHit', handler)

// --- Example: build a simple request logger ---

async function withLogging() {
  const requests: Array<{ endpoint: string; durationMs: number }> = []

  mk.on('afterRequest', (req, durationMs) => {
    requests.push({ endpoint: req.endpoint, durationMs })
  })

  await mk.search('bohemian rhapsody')
  await mk.getHome()

  console.log('Request log:')
  for (const r of requests) {
    console.log(`  ${r.endpoint}: ${r.durationMs}ms`)
  }
}

withLogging()

function notifyAdmin(msg: string) {
  console.error(`[ADMIN ALERT] ${msg}`)
}
