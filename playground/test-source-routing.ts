/**
 * Bundle B verification — source routing (T2 + T3 + T4)
 *
 * Demonstrates:
 *   1. With YT_API_KEY set: albums filter returns results (T2 fallback to YT Music)
 *   2. With YT_API_KEY set: songs filter hits googleapis.com (Data API used)
 *   3. With YT_API_KEY set: getAlbum() succeeds via fallback (T3)
 *   4. search({ source: 'youtube' }) does not throw (T4)
 *
 * Run: pnpm exec tsx --env-file=.env playground/test-source-routing.ts
 */

import { MusicKit } from '../src/musickit'
import { configFromEnv, summarizeEnv } from './_env'

// Track which hosts are called
const callsByHost = new Map<string, number>()
const origFetch = globalThis.fetch
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input))
  try {
    const u = new URL(url)
    callsByHost.set(u.host, (callsByHost.get(u.host) ?? 0) + 1)
  } catch { /* ignore */ }
  return origFetch(input, init)
}) as typeof fetch

function resetHosts() {
  callsByHost.clear()
}

function hitGoogleapis(): boolean {
  for (const host of callsByHost.keys()) {
    if (host.includes('googleapis.com')) return true
  }
  return false
}

function pass(msg: string) { console.log(`  PASS  ${msg}`) }
function fail(msg: string) { console.log(`  FAIL  ${msg}`) }
function check(condition: boolean, msg: string) { condition ? pass(msg) : fail(msg) }

async function main() {
  console.log('env:', summarizeEnv())

  const hasApiKey = !!process.env.YT_API_KEY
  if (!hasApiKey) {
    console.log('\nWARN: YT_API_KEY not set — T2/T4 checks will run without Data API; fallback behavior only.')
  }

  const config = configFromEnv()
  const mk = await MusicKit.create(config)

  // Trigger lazy source registration
  await (mk as any).ensureClients()

  console.log('\nRegistered sources:')
  for (const s of mk.sources) console.log(`  - ${s.name}`)

  if (hasApiKey) {
    check(mk.sources.length === 2, `T2: both sources registered (got ${mk.sources.length})`)
    check(mk.sources[0].name === 'youtube-data-api', `T2: Data API is first (got ${mk.sources[0].name})`)
    check(mk.sources[1].name === 'youtube-music', `T2: YT Music is second (got ${mk.sources[1].name})`)
  } else {
    check(mk.sources.length === 1, `no-key: only one source registered (got ${mk.sources.length})`)
  }

  // ── Check 1: album search returns non-empty (T2 fallback to YT Music) ───────
  console.log('\n--- Check 1: albums filter returns results (T2 fallback)')
  resetHosts()
  let albumSearchResult: any[] = []
  try {
    albumSearchResult = await mk.search('Adele', { filter: 'albums', limit: 5 }) as any[]
    console.log(`  albums returned: ${albumSearchResult.length}`)
    for (const a of albumSearchResult.slice(0, 3)) console.log(`    -> ${a.title} — ${a.artist}`)
    check(albumSearchResult.length > 0, 'albums filter returns non-empty results')
  } catch (e: any) {
    fail(`albums filter threw: ${e.message}`)
  }

  // ── Check 2: songs filter hits googleapis.com (when key set) ─────────────────
  console.log('\n--- Check 2: songs filter hits googleapis.com')
  resetHosts()
  try {
    const songs = await mk.search('Adele Hello', { filter: 'songs', limit: 3 }) as any[]
    console.log(`  songs returned: ${songs.length}`)
    for (const s of songs.slice(0, 2)) console.log(`    -> ${s.title} — ${s.artist}`)
    if (hasApiKey) {
      check(hitGoogleapis(), 'songs filter hit googleapis.com (Data API used)')
    } else {
      check(songs.length > 0, 'songs filter returns results (InnerTube)')
    }
  } catch (e: any) {
    fail(`songs filter threw: ${e.message}`)
  }

  // ── Check 3: getAlbum succeeds via fallback (T3) ──────────────────────────────
  console.log('\n--- Check 3: getAlbum succeeds (T3 routing through source list)')
  if (albumSearchResult.length > 0) {
    const browseId = albumSearchResult[0]?.browseId
    if (browseId) {
      try {
        resetHosts()
        const album = await mk.getAlbum(browseId)
        console.log(`  -> ${album.title} — ${album.artist} (${album.tracks?.length ?? 0} tracks)`)
        check(album.type === 'album', 'getAlbum returns an Album object')
        check(album.title !== 'Unknown', 'getAlbum title is populated')
      } catch (e: any) {
        fail(`getAlbum threw: ${e.message}`)
      }
    } else {
      console.log('  (skipped — album browseId not available)')
    }
  } else {
    // Fallback to a known browseId for Adele's 30
    const knownBrowseId = 'MPREb_4pL8gzRtw1v'
    try {
      resetHosts()
      const album = await mk.getAlbum(knownBrowseId)
      console.log(`  -> ${album.title} — ${album.artist} (${album.tracks?.length ?? 0} tracks)`)
      check(album.type === 'album', 'getAlbum returns an Album object via fallback')
    } catch (e: any) {
      fail(`getAlbum threw: ${e.message}`)
    }
  }

  // ── Check 4: source override 'youtube' does not throw (T4) ───────────────────
  console.log('\n--- Check 4: search({ source: "youtube" }) does not throw (T4)')
  try {
    const results = await mk.search('Adele', { filter: 'songs', source: 'youtube', limit: 2 }) as any[]
    console.log(`  returned ${results.length} results`)
    pass(`source: 'youtube' override does not throw`)
  } catch (e: any) {
    fail(`source: 'youtube' threw: ${e.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
