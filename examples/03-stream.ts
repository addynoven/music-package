/**
 * Streaming — resolve a video ID into a playable audio URL.
 *
 * The stream URL is temporary (~6 hours) and IP-bound.
 * MusicKit caches it automatically and re-fetches before it expires.
 */

import { MusicKit } from 'musickit'
import type { StreamingData, AudioTrack } from 'musickit'

const mk = new MusicKit()

async function main() {
  // --- Basic stream resolution ---

  const stream: StreamingData = await mk.getStream("fJ9rUzIMcZQ")

  console.log(stream.url)         // "https://rr5---.googlevideo.com/videoplayback?..."
  console.log(stream.codec)       // "opus" | "mp4a"
  console.log(stream.bitrate)     // 160000  (bits per second)
  console.log(stream.expiresAt)   // 1744300800  (Unix timestamp)
  console.log(stream.loudnessDb)  // -7.2  (LUFS, useful for normalization)
  console.log(stream.sizeBytes)   // 3456789

  // Check how long the URL is still valid
  const ttlSeconds = stream.expiresAt - Math.floor(Date.now() / 1000)
  console.log(`URL valid for ${Math.floor(ttlSeconds / 3600)}h ${Math.floor((ttlSeconds % 3600) / 60)}m`)

  // --- Quality selection ---

  const high = await mk.getStream("fJ9rUzIMcZQ", { quality: "high" }) // default — Opus 160kbps
  const low = await mk.getStream("fJ9rUzIMcZQ", { quality: "low" })   // Opus 50kbps

  // --- AudioTrack: metadata + stream in one object ---
  //
  // Use this when you need both song info and the playable URL together,
  // e.g. populating a player UI and starting playback simultaneously.

  const track: AudioTrack = await mk.getTrack("fJ9rUzIMcZQ")

  // Metadata fields
  console.log(track.title)        // "Bohemian Rhapsody"
  console.log(track.artist)       // "Queen"
  console.log(track.album)        // "A Night at the Opera"
  console.log(track.duration)     // 354
  console.log(track.thumbnails)   // [{ url, width, height }, ...]

  // Stream fields
  console.log(track.stream.url)       // ready-to-play URL
  console.log(track.stream.codec)     // "opus"
  console.log(track.stream.bitrate)   // 160000

  // --- Typical usage: search then play ---

  const [topSong] = await mk.search("never gonna give you up", { filter: "songs" })
  const playable = await mk.getTrack(topSong.videoId)

  // Feed to any audio player
  // player.src = playable.stream.url
}

main()
