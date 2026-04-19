/**
 * Download — save audio files to disk.
 *
 * MusicKit resolves the stream URL, downloads the audio,
 * and writes ID3/Opus tags automatically.
 *
 * File naming: <title> (<artist>).<format>
 * Example:     Bohemian Rhapsody (Queen).opus
 */

import { MusicKit } from 'musickit'

const mk = new MusicKit()

async function main() {
  // --- Basic download ---

  await mk.download("fJ9rUzIMcZQ", { path: "./music/" })
  // Writes: ./music/Bohemian Rhapsody (Queen).opus

  // --- Specify format ---

  await mk.download("fJ9rUzIMcZQ", {
    path: "./music/",
    format: "opus",  // "opus" (default) | "m4a"
  })

  await mk.download("fJ9rUzIMcZQ", {
    path: "./music/",
    format: "m4a",
  })
  // Writes: ./music/Bohemian Rhapsody (Queen).m4a

  // --- Track download progress ---

  await mk.download("fJ9rUzIMcZQ", {
    path: "./music/",
    onProgress: (percent: number) => {
      process.stdout.write(`\rDownloading: ${percent.toFixed(1)}%`)
    },
  })
  console.log("\nDone!")

  // --- Download multiple songs (sequentially) ---

  const videoIds = ["fJ9rUzIMcZQ", "dQw4w9WgXcQ", "hTWKbfoikeg"]

  for (const videoId of videoIds) {
    console.log(`Downloading ${videoId}...`)
    await mk.download(videoId, {
      path: "./music/",
      onProgress: (p) => process.stdout.write(`\r  ${p.toFixed(0)}%`),
    })
    console.log(" ✓")
  }

  // --- Download from search results ---

  const songs = await mk.search("queen greatest hits", { filter: "songs" })

  for (const song of songs.slice(0, 5)) {
    await mk.download(song.videoId, { path: "./queen/" })
    console.log(`Downloaded: ${song.title}`)
  }
}

main()
