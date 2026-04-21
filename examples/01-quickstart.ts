/**
 * Quickstart — search for a song and get a playable stream URL.
 */

import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // Search for songs
  const songs = await mk.search('bohemian rhapsody', { filter: 'songs' })
  const song = songs[0]

  console.log(`${song.title} — ${song.artist}`)  // "Bohemian Rhapsody — Queen"
  console.log(`Duration: ${song.duration}s`)

  // Get a playable stream URL
  const stream = await mk.getStream(song.videoId)

  console.log(stream.url)       // https://... — feed to any audio player
  console.log(stream.codec)     // "opus" or "mp4a"
  console.log(stream.bitrate)   // bits per second
  console.log(stream.expiresAt) // Unix timestamp — URL is time-limited

  // Pass the URL to your player
  // execa('mpv', [stream.url])
  // audioElement.src = stream.url
}

main()
