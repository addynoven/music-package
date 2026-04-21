/**
 * Download — save audio files to disk.
 *
 * download() fetches the stream, writes the audio file, and tags it
 * automatically (title, artist, cover art).
 *
 * File naming: <title> (<artist>).<format>
 * Example:     Bohemian Rhapsody (Queen).opus
 *
 * NOTE: download() requires a YouTube video URL or ID.
 * To download a specific song, either:
 *   a) Pass a YouTube URL directly, or
 *   b) Search using a YouTube Music search URL to get YouTube IDs.
 */

import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Basic download (YouTube video ID) ---

  await mk.download('fJ9rUzIMcZQ', { path: './music/' })
  // Writes: ./music/Bohemian Rhapsody (Queen).opus

  // --- Specify format ---

  await mk.download('fJ9rUzIMcZQ', { path: './music/', format: 'opus' }) // default
  await mk.download('fJ9rUzIMcZQ', { path: './music/', format: 'm4a' })
  // Writes: ./music/Bohemian Rhapsody (Queen).m4a

  // --- Track progress ---

  await mk.download('fJ9rUzIMcZQ', {
    path: './music/',
    onProgress: (percent: number) => {
      process.stdout.write(`\rDownloading: ${percent.toFixed(1)}%`)
    },
  })
  console.log('\nDone!')

  // --- Download multiple songs ---

  const videoIds = ['fJ9rUzIMcZQ', 'dQw4w9WgXcQ', 'hTWKbfoikeg']

  for (const videoId of videoIds) {
    await mk.download(videoId, {
      path: './music/',
      onProgress: (p) => process.stdout.write(`\r  ${p.toFixed(0)}%`),
    })
    console.log(' ✓')
  }

  // --- Search → download ---
  //
  // Use a YouTube Music search URL to get downloadable YouTube video IDs.

  const songs = await mk.search(
    'https://music.youtube.com/search?q=bohemian+rhapsody',
    { filter: 'songs' }
  )

  for (const song of songs.slice(0, 5)) {
    await mk.download(song.videoId, { path: './queen/' })
    console.log(`Downloaded: ${song.title}`)
  }
}

main()
