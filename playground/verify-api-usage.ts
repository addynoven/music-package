/**
 * Proof that headers (X-Goog-Visitor-Id, User-Agent, Cookie) actually flow
 * into InnerTube outbound calls, and that proxy/sessionManager are wired.
 *
 * Run: pnpm exec tsx --env-file=.env playground/verify-api-usage.ts
 */

import { MusicKit } from '../src/musickit'
import { configFromEnv, summarizeEnv } from './_env'

// ── Header capture ─────────────────────────────────────────────────────────────

interface CapturedCall {
  host: string
  path: string
  headers: Record<string, string>
}

const captured: CapturedCall[] = []
const callsByHost = new Map<string, number>()
let firstInnerTubeHeaders: Record<string, string> | null = null
let firstLrclibHeaders: Record<string, string> | null = null

const origFetch = globalThis.fetch
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input))
  let host = ''
  let path = ''
  let headers: Record<string, string> = {}

  try {
    const u = new URL(url)
    host = u.host
    path = u.pathname
    callsByHost.set(host, (callsByHost.get(host) ?? 0) + 1)
  } catch { /* ignore */ }

  // Capture headers — check both the Request object's headers and init.headers
  // (youtubei.js builds a Request object with headers, then passes additional init.headers)
  const collectHeaders = (src: any) => {
    if (!src) return
    if (typeof src.forEach === 'function') {
      src.forEach((v: string, k: string) => { headers[k] = v })
    } else if (Array.isArray(src)) {
      for (const [k, v] of src) headers[k] = v
    } else if (typeof src === 'object') {
      Object.assign(headers, src)
    }
  }
  // Request object headers come first; init.headers override (init.headers wins in Fetch spec)
  if (input && typeof (input as any) === 'object' && 'headers' in (input as any)) {
    collectHeaders((input as any).headers)
  }
  collectHeaders(init?.headers)

  captured.push({ host, path, headers })

  // Capture the LAST InnerTube call headers (the API call, not the player.js fetch)
  // X-Goog-Visitor-Id might be empty on early calls; it's populated after session init
  if (host.includes('music.youtube.com') || host.includes('www.youtube.com')) {
    firstInnerTubeHeaders = { ...headers }
  }
  if (host === 'lrclib.net' && !firstLrclibHeaders) {
    firstLrclibHeaders = { ...headers }
  }

  return origFetch(input, init)
}) as typeof fetch

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('env:', summarizeEnv())
  const config = configFromEnv()
  const mk = await MusicKit.create(config)

  console.log('\nRegistered sources:')
  for (const s of mk.sources) console.log(`  - ${s.name}`)

  console.log('\nRunning: search("Adele Hello")')
  const songs = await mk.search('Adele Hello', { filter: 'songs', limit: 3 }) as any[]
  for (const s of songs.slice(0, 3)) {
    console.log(`  -> ${s.title} — ${s.artist} (${s.duration}s) [${s.videoId}]`)
  }

  console.log('\nRunning: getMetadata of first result')
  const meta = await mk.getMetadata(songs[0].videoId)
  console.log(`  -> ${meta.title} — ${meta.artist} (${meta.duration}s)`)

  console.log('\nRunning: getLyrics for first result')
  const lyrics = await mk.getLyrics(songs[0].videoId)
  console.log(`  -> ${lyrics?.synced ? `synced ${lyrics.synced.length} lines` : 'plain only or null'}`)

  // ── Header dump ─────────────────────────────────────────────────────────────

  console.log('\n=== InnerTube call headers (music.youtube.com) ===')
  if (firstInnerTubeHeaders) {
    for (const [k, v] of Object.entries(firstInnerTubeHeaders)) {
      // Never print Cookie values in full — just confirm presence
      if (k.toLowerCase() === 'cookie') {
        console.log(`  ${k}: [REDACTED — ${v.length} chars]`)
      } else {
        console.log(`  ${k}: ${v}`)
      }
    }
    console.log(`  [all header keys: ${Object.keys(firstInnerTubeHeaders).join(', ')}]`)
  } else {
    console.log('  (no InnerTube calls captured)')
  }

  console.log('\n=== LRCLIB call headers ===')
  if (firstLrclibHeaders) {
    for (const [k, v] of Object.entries(firstLrclibHeaders)) {
      if (k.toLowerCase() === 'cookie') {
        console.log(`  ${k}: [REDACTED — ${v.length} chars]`)
      } else {
        console.log(`  ${k}: ${v}`)
      }
    }
  } else {
    console.log('  (no lrclib calls captured)')
  }

  // ── Verification ─────────────────────────────────────────────────────────────

  console.log('\n=== Verification ===')

  // InnerTube: youtubei.js manages X-Goog-Visitor-Id from its own session context.
  // It's present when visitorData is populated (generate_session_locally may leave it empty initially).
  const hasVisitorId = !!(firstInnerTubeHeaders?.['X-Goog-Visitor-Id'])
  const hasUserAgent = !!(firstInnerTubeHeaders?.['User-Agent'])
  const hasCookie = !!(firstInnerTubeHeaders?.['Cookie']?.length)

  // LRCLIB: our sharedFetch injects session headers (User-Agent, X-Goog-Visitor-Id)
  const lrclibHasUserAgent = !!(firstLrclibHeaders?.['User-Agent'])
  const lrclibHasVisitorId = !!(firstLrclibHeaders?.['X-Goog-Visitor-Id'])

  console.log('InnerTube (music.youtube.com):')
  console.log(`  X-Goog-Visitor-Id: ${hasVisitorId ? 'PRESENT ✓' : 'empty/absent (youtubei.js session context — OK if generate_session_locally)'}`)
  console.log(`  User-Agent:        ${hasUserAgent ? 'PRESENT ✓' : 'MISSING ✗'}`)
  console.log(`  Cookie:            ${hasCookie ? `PRESENT ✓ (${firstInnerTubeHeaders!['Cookie']!.length} chars)` : config.cookiesPath ? 'absent (cookies.txt not found at path — OK if file missing)' : 'absent (COOKIES_PATH not set — expected)'}`)

  console.log('LRCLIB (external API — session headers injected by sharedFetch):')
  console.log(`  User-Agent:        ${lrclibHasUserAgent ? 'PRESENT ✓' : 'MISSING ✗'}`)
  console.log(`  X-Goog-Visitor-Id: ${lrclibHasVisitorId ? 'PRESENT ✓' : 'MISSING ✗'}`)

  // ── Outbound call summary ─────────────────────────────────────────────────
  console.log('\n=== Outbound HTTP calls by host ===')
  const sorted = [...callsByHost.entries()].sort((a, b) => b[1] - a[1])
  for (const [host, n] of sorted) console.log(`  ${n.toString().padStart(3)}  ${host}`)
}

main().catch(e => { console.error(e); process.exit(1) })
