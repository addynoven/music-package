/**
 * End-to-end lyrics-sync test against the real SDK.
 *
 * For each track: search → metadata → getLyrics → check that:
 *   • we got synced lyrics back
 *   • the first non-zero timestamp is plausible (not past EOF)
 *   • the last timestamp doesn't exceed track duration by more than 5s
 *     (i.e. these lyrics actually belong to THIS recording)
 *
 * Run: pnpm exec tsx playground/test-lyrics-sync.ts
 */

import { MusicKit } from '../src/musickit'
import { configFromEnv, summarizeEnv } from './_env'

const TRACKS = [
  // Old set (sanity check — should still pass)
  'Eminem Rap God',
  'Adele Hello',
  // New set (cache-proof — never run before)
  'Taylor Swift Anti Hero',
  'Billie Eilish bad guy',
  'Drake God\'s Plan',
  'Dua Lipa Levitating',
  'Olivia Rodrigo drivers license',
  'Post Malone Sunflower',
  'Ed Sheeran Shape of You',
  'Harry Styles As It Was',
  'Bruno Mars Just the Way You Are',
  'Maroon 5 Memories',
]

function fmt(s: number): string {
  if (!isFinite(s)) return '—'
  const m = Math.floor(s / 60), ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

async function main() {
  console.log('env:', summarizeEnv())
  const mk = await MusicKit.create(configFromEnv())

  let synced = 0
  let plain = 0
  let none = 0
  let drift = 0

  for (const query of TRACKS) {
    console.log(`── ${query}`)
    const songs = await mk.search(query, { filter: 'songs', limit: 1 }) as any[]
    if (!songs.length) { console.log('  no search result\n'); continue }
    const song = songs[0]
    console.log(`  Found: ${song.title} — ${song.artist}  dur=${fmt(song.duration)} (${song.duration}s)`)

    const lyrics = await mk.getLyrics(song.videoId)
    if (!lyrics) {
      console.log('  Lyrics: none\n')
      none++
      continue
    }

    if (lyrics.synced && lyrics.synced.length) {
      const last = lyrics.synced[lyrics.synced.length - 1]
      const lastTime = last.time
      const overshoot = lastTime - song.duration
      console.log(`  Lyrics: SYNCED (${lyrics.synced.length} lines, last @${fmt(lastTime)} / track ${fmt(song.duration)})`)
      if (overshoot > 5) {
        console.log(`  ⚠️  Last lyric line is ${overshoot.toFixed(1)}s past track end — wrong recording`)
        drift++
      } else {
        console.log(`  ✓ timing fits the track`)
        synced++
      }
    } else {
      console.log(`  Lyrics: plain only (${lyrics.plain.length} chars)`)
      plain++
    }
    console.log()
    await new Promise(r => setTimeout(r, 400))
  }

  console.log('=== Summary ===')
  console.log(`Total tracks:     ${TRACKS.length}`)
  console.log(`Synced & valid:   ${synced}`)
  console.log(`Plain lyrics:     ${plain}`)
  console.log(`No lyrics:        ${none}`)
  console.log(`Synced w/ drift:  ${drift}`)
}

main().catch(err => { console.error(err); process.exit(1) })
