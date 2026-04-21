/**
 * Lyrics — fetch song lyrics by ID.
 *
 * getLyrics(id) → string | null
 *
 * Returns lyrics text when available, null when not.
 * Works with any song ID from search results.
 * YouTube IDs always return null (no lyrics API on YouTube).
 * Platform URLs are resolved automatically.
 */

import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Basic usage ---

  const songs = await mk.search('tum hi ho', { filter: 'songs' })
  const lyrics = await mk.getLyrics(songs[0].videoId)

  if (lyrics) {
    console.log(lyrics)
  } else {
    console.log('Lyrics not available for this track.')
  }

  // --- Direct from a platform URL ---

  const lyricsFromUrl = await mk.getLyrics(
    'https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc'
  )
  console.log(lyricsFromUrl)

  // --- Lyrics + metadata together ---

  const [song, lyricsText] = await Promise.all([
    mk.getMetadata(songs[0].videoId),
    mk.getLyrics(songs[0].videoId),
  ])

  console.log(`${song.title} — ${song.artist}`)
  console.log('---')
  console.log(lyricsText ?? 'No lyrics available')

  // --- Pattern: lyrics display in a player UI ---

  async function loadSongForDisplay(query: string) {
    const results = await mk.search(query, { filter: 'songs' })
    if (results.length === 0) return null

    const id = results[0].videoId
    const [stream, meta, lyrics] = await Promise.all([
      mk.getStream(id),
      mk.getMetadata(id),
      mk.getLyrics(id),
    ])

    return {
      title: meta.title,
      artist: meta.artist,
      duration: meta.duration,
      thumbnails: meta.thumbnails,
      streamUrl: stream.url,
      lyrics,          // string | null — show tab only when truthy
    }
  }

  const display = await loadSongForDisplay('kabhi kabhi aditi')
  if (display) {
    console.log(`Now playing: ${display.title} — ${display.artist}`)
    if (display.lyrics) {
      console.log('\nLyrics:')
      console.log(display.lyrics)
    }
  }
}

main()
