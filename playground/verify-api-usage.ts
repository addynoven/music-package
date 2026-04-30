/**
 * Proof that the Data API path is actually firing.
 *
 * Monkey-patches global fetch and counts outbound requests by host.
 * Also checks which source the SDK registered.
 *
 * Run: pnpm exec tsx --env-file=.env playground/verify-api-usage.ts
 */

import { MusicKit } from '../src/musickit'
import { configFromEnv, summarizeEnv } from './_env'

const callsByHost = new Map<string, number>()
const calls: { host: string; path: string }[] = []

const origFetch = globalThis.fetch
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input))
  try {
    const u = new URL(url)
    callsByHost.set(u.host, (callsByHost.get(u.host) ?? 0) + 1)
    calls.push({ host: u.host, path: u.pathname })
  } catch {
    // ignore non-URL inputs
  }
  return origFetch(input, init)
}) as typeof fetch

async function main() {
  console.log('env:', summarizeEnv())
  const mk = await MusicKit.create(configFromEnv())

  console.log('\nRegistered sources:')
  for (const s of mk.sources) console.log(`  - ${s.name}`)

  console.log('\nRunning: search("Adele Hello")')
  const songs = await mk.search('Adele Hello', { filter: 'songs', limit: 3 }) as any[]
  for (const s of songs.slice(0, 3)) {
    console.log(`  → ${s.title} — ${s.artist} (${s.duration}s) [${s.videoId}]`)
  }

  console.log('\nRunning: getMetadata of first result')
  const meta = await mk.getMetadata(songs[0].videoId)
  console.log(`  → ${meta.title} — ${meta.artist} (${meta.duration}s)`)

  console.log('\nRunning: getLyrics for first result')
  const lyrics = await mk.getLyrics(songs[0].videoId)
  console.log(`  → ${lyrics?.synced ? `synced ${lyrics.synced.length} lines` : 'plain only or null'}`)

  console.log('\n=== Outbound HTTP calls by host ===')
  const sorted = [...callsByHost.entries()].sort((a, b) => b[1] - a[1])
  for (const [host, n] of sorted) console.log(`  ${n.toString().padStart(3)}  ${host}`)

  const youtubeApi = calls.filter(c => c.host === 'www.googleapis.com')
  const ytm = calls.filter(c => c.host === 'music.youtube.com' || c.host === 'www.youtube.com')
  const lrclib = calls.filter(c => c.host === 'lrclib.net')

  console.log('\n=== Detail ===')
  console.log(`googleapis.com (YT Data API):  ${youtubeApi.length} calls`)
  for (const c of youtubeApi) console.log(`    ${c.path}`)
  console.log(`youtube.com / music.youtube.com (InnerTube): ${ytm.length} calls`)
  for (const c of ytm.slice(0, 5)) console.log(`    ${c.path}`)
  if (ytm.length > 5) console.log(`    ... and ${ytm.length - 5} more`)
  console.log(`lrclib.net:                    ${lrclib.length} calls`)
  for (const c of lrclib) console.log(`    ${c.path}`)

  console.log('\n=== Verdict ===')
  if (youtubeApi.length > 0) {
    console.log('✓ YouTube Data API IS being used (search + getMetadata go through googleapis.com)')
  } else {
    console.log('✗ YouTube Data API was NOT called — search must have gone through InnerTube')
  }
  if (ytm.length > 0) {
    console.log('  ℹ youtube.com/music.youtube.com calls = stream resolution (InnerTube — expected, the Data API has no stream endpoint)')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
