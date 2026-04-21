/**
 * Related & Radio — seed-based music discovery.
 *
 *   getRadio(id)    → auto-generated station seeded from a song
 *                     returns Song[] — typically ~20 tracks
 *                     accepts any Song ID from search results
 *
 *   getRelated(id)  → similar tracks for a song
 *                     returns Song[]
 *                     requires a YouTube video URL or ID
 */

import { MusicKit } from 'musicstream-sdk'
import type { Song } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // ─────────────────────────────────────────────
  // getRadio — seed from any search result
  // ─────────────────────────────────────────────

  const songs = await mk.search('tum hi ho', { filter: 'songs' })
  const radio: Song[] = await mk.getRadio(songs[0].videoId)

  console.log(`Radio: ${radio.length} tracks`)
  radio.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} — ${s.artist}`))

  // Stream any track from the radio
  const stream = await mk.getStream(radio[0].videoId)
  console.log(stream.url)

  // ─────────────────────────────────────────────
  // getRelated — YouTube video IDs only
  // ─────────────────────────────────────────────

  const related: Song[] = await mk.getRelated('fJ9rUzIMcZQ')  // YouTube video ID
  console.log(`Related: ${related.length} songs`)
  related.slice(0, 5).forEach(s => console.log(`  ${s.title} — ${s.artist}`))

  // ─────────────────────────────────────────────
  // Radio vs Related
  // ─────────────────────────────────────────────
  //
  // getRadio  → continuous playback queue. ~20 songs that flow well together.
  //             Best for "play more like this" UX.
  //
  // getRelated → editorial "you might also like". Better for sidebar recommendations.
  //              Requires YouTube video ID.

  // ─────────────────────────────────────────────
  // Pattern: infinite radio queue
  // ─────────────────────────────────────────────

  async function* infiniteRadio(seedQuery: string): AsyncGenerator<Song> {
    const seeds = await mk.search(seedQuery, { filter: 'songs' })
    if (seeds.length === 0) return

    let currentSeed = seeds[0].videoId
    const played = new Set<string>()

    while (true) {
      const batch = await mk.getRadio(currentSeed)
      const fresh = batch.filter(s => !played.has(s.videoId))
      if (fresh.length === 0) break

      for (const song of fresh) {
        played.add(song.videoId)
        yield song
        currentSeed = song.videoId
      }
    }
  }

  let count = 0
  for await (const song of infiniteRadio('bohemian rhapsody')) {
    const s = await mk.getStream(song.videoId)
    console.log(`Now playing: ${song.title} — ${song.artist} (${s.codec})`)
    if (++count >= 10) break
  }

  // ─────────────────────────────────────────────
  // Pattern: discover artists via radio
  // ─────────────────────────────────────────────

  async function discoverArtists(query: string): Promise<string[]> {
    const songs = await mk.search(query, { filter: 'songs' })
    const radio = await mk.getRadio(songs[0].videoId)
    const artists = [...new Set(radio.map(s => s.artist))]
    return artists.filter(a => a.toLowerCase() !== songs[0].artist.toLowerCase())
  }

  const discovered = await discoverArtists('arijit singh')
  console.log(`Related artists: ${discovered.join(', ')}`)
}

main()
