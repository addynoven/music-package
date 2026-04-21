/**
 * Suggestions, Related & Radio — music discovery and "up next" queues.
 *
 *   getSuggestions(id) → recommended "up next" for any song ID.
 *                        YouTube-first: finds the best YouTube match for
 *                        the song, uses YouTube's global recommendation
 *                        engine. Falls back to source-native radio if
 *                        YouTube lookup fails.
 *                        Returns Song[].
 *
 *   getRadio(id)       → continuous station seeded from a song.
 *                        Lower-level than getSuggestions — use it when
 *                        you specifically want the source's own radio.
 *                        Returns Song[].
 *
 *   getRelated(id)     → sidebar-style "you might also like".
 *                        Requires a YouTube video ID.
 *                        Returns Song[].
 *
 * For most UI use cases, prefer getSuggestions — it picks the best
 * strategy automatically regardless of where the ID came from.
 */

import { MusicKit } from 'musicstream-sdk'
import type { Song } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // ─────────────────────────────────────────────
  // getSuggestions — preferred API for "up next"
  // ─────────────────────────────────────────────
  //
  // Works with any song ID from search results.
  // Internally routes through YouTube's recommendation engine for
  // better genre/language accuracy, regardless of source.

  const songs = await mk.search('hips dont lie', { filter: 'songs' })
  const upNext: Song[] = await mk.getSuggestions(songs[0].videoId)

  console.log(`Up next: ${upNext.length} tracks`)
  upNext.slice(0, 5).forEach((s, i) =>
    console.log(`  ${i + 1}. ${s.title} — ${s.artist}`)
  )

  // Stream the first suggestion
  const stream = await mk.getStream(upNext[0].videoId)
  console.log(stream.url)

  // ─────────────────────────────────────────────
  // getRadio — source-native radio station
  // ─────────────────────────────────────────────
  //
  // Seeded from any song ID. ~20 tracks that flow together.
  // Use when you specifically want the source's own radio algorithm.

  const radio: Song[] = await mk.getRadio(songs[0].videoId)
  console.log(`Radio: ${radio.length} tracks`)

  // ─────────────────────────────────────────────
  // getRelated — YouTube editorial recommendations
  // ─────────────────────────────────────────────
  //
  // YouTube video IDs only. Best for sidebar / "you might also like" UI.

  const ytSongs = await mk.search('bohemian rhapsody', { filter: 'songs' })
  const ytId = ytSongs.find(s => !s.videoId.startsWith('jio:'))?.videoId
  if (ytId) {
    const related: Song[] = await mk.getRelated(ytId)
    console.log(`Related: ${related.length} songs`)
    related.slice(0, 5).forEach(s => console.log(`  ${s.title} — ${s.artist}`))
  }

  // ─────────────────────────────────────────────
  // Pattern: infinite queue using getSuggestions
  // ─────────────────────────────────────────────

  async function* infiniteQueue(seedQuery: string): AsyncGenerator<Song> {
    const seeds = await mk.search(seedQuery, { filter: 'songs' })
    if (seeds.length === 0) return

    let currentId = seeds[0].videoId
    const played = new Set<string>()

    while (true) {
      const batch = await mk.getSuggestions(currentId)
      const fresh = batch.filter(s => !played.has(s.videoId))
      if (fresh.length === 0) break

      for (const song of fresh) {
        played.add(song.videoId)
        yield song
        currentId = song.videoId
      }
    }
  }

  let count = 0
  for await (const song of infiniteQueue('hips dont lie')) {
    const s = await mk.getStream(song.videoId)
    console.log(`Now playing: ${song.title} — ${song.artist} (${s.codec})`)
    if (++count >= 10) break
  }

  // ─────────────────────────────────────────────
  // Pattern: discover artists via suggestions
  // ─────────────────────────────────────────────

  async function discoverArtists(query: string): Promise<string[]> {
    const seeds = await mk.search(query, { filter: 'songs' })
    const suggestions: Song[] = await mk.getSuggestions(seeds[0].videoId)
    const artists = [...new Set(suggestions.map((s: Song) => s.artist))]
    return artists.filter((a: string) => a.toLowerCase() !== seeds[0].artist.toLowerCase())
  }

  const discovered = await discoverArtists('shakira')
  console.log(`Similar artists: ${discovered.join(', ')}`)
}

main()
