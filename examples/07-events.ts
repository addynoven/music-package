/**
 * Events — hook into MusicKit's internal lifecycle.
 *
 * Events let you observe and react to what MusicKit is doing
 * without modifying its behavior. Useful for:
 *   - Custom logging / metrics
 *   - UI feedback ("buffering...", "rate limited...")
 *   - Debugging the anti-ban layer
 */

import { MusicKit } from 'musickit'
import type { MusicKitRequest, MusicKitError, MusicKitErrorCode } from 'musickit'

const mk = new MusicKit({ logLevel: "silent" }) // silence built-in logs, use our own

// --- beforeRequest ---
// Fires before every outgoing HTTP request.
// Useful for logging, metrics, or modifying requests.

mk.on("beforeRequest", (req: MusicKitRequest) => {
  console.log(`→ ${req.method} ${req.endpoint}`)
  // req.endpoint  — "search" | "browse" | "autocomplete" | "stream" | ...
  // req.headers   — the full headers object
  // req.body      — request body (for POST requests)
})

// --- afterRequest ---
// Fires after every completed request.

mk.on("afterRequest", (req: MusicKitRequest, durationMs: number, status: number) => {
  console.log(`← ${req.endpoint} ${status} (${durationMs}ms)`)
})

// --- rateLimited ---
// Fires when MusicKit pauses before a request due to rate limiting.

mk.on("rateLimited", (endpoint: string, waitMs: number) => {
  console.log(`Rate limited on [${endpoint}] — waiting ${waitMs}ms`)
})

// --- cacheHit ---
// Fires when a cached result is returned instead of making a network request.

mk.on("cacheHit", (key: string, ttlRemaining: number) => {
  console.log(`Cache hit: ${key} (${Math.round(ttlRemaining / 60)}min remaining)`)
})

// --- cacheMiss ---
// Fires when no cached result exists and a network request will be made.

mk.on("cacheMiss", (key: string) => {
  console.log(`Cache miss: ${key}`)
})

// --- visitorIdRefreshed ---
// Fires when the visitor ID expires and a new one is generated.
// Normal behavior — happens every ~30 days.

mk.on("visitorIdRefreshed", (oldId: string, newId: string) => {
  console.log("Visitor ID rotated")
  // Store newId somewhere if you're persisting state externally
})

// --- retry ---
// Fires when a request fails and MusicKit is about to retry.

mk.on("retry", (endpoint: string, attempt: number, reason: string) => {
  console.log(`Retrying ${endpoint} (attempt ${attempt}/3): ${reason}`)
})

// --- error ---
// Fires when a request fails after all retries are exhausted.

mk.on("error", (err: MusicKitError) => {
  console.error(`Error [${err.code}]: ${err.message}`)

  if (err.code === MusicKitErrorCode.RateLimited) {
    // 429 — YouTube is rate limiting us
    notifyAdmin("YouTube rate limit hit")
  }

  if (err.code === MusicKitErrorCode.VideoUnavailable) {
    // Video was removed or geo-restricted
    console.warn("Video unavailable, skipping")
  }

  if (err.code === MusicKitErrorCode.CipherFailure) {
    // YouTube changed their cipher — update @distube/ytdl-core
    console.error("Stream cipher broken — update musickit to the latest version")
  }
})

// --- Remove a listener ---

const handler = (key: string) => console.log(`hit: ${key}`)
mk.on("cacheHit", handler)
mk.off("cacheHit", handler)

// --- Example: build a simple request logger ---

async function withLogging() {
  const requests: Array<{ endpoint: string; durationMs: number }> = []

  mk.on("afterRequest", (req, durationMs) => {
    requests.push({ endpoint: req.endpoint, durationMs })
  })

  await mk.search("queen")
  await mk.getHome()

  console.log("Request log:")
  for (const r of requests) {
    console.log(`  ${r.endpoint}: ${r.durationMs}ms`)
  }
}

withLogging()

function notifyAdmin(msg: string) {
  console.error(`[ADMIN ALERT] ${msg}`)
}
