/**
 * Streaming — resolve a song ID into a playable audio URL.
 *
 * getStream() accepts any ID returned by search(), getAlbum(),
 * getArtist(), getPlaylist(), or getRadio(). Routing is automatic.
 *
 * Stream URLs are time-limited. Check expiresAt before reuse.
 */

import { MusicKit } from 'musicstream-sdk'
import type { StreamingData } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Basic: search → stream ---

  const songs = await mk.search('tum hi ho', { filter: 'songs' })
  const stream: StreamingData = await mk.getStream(songs[0].videoId)

  console.log(stream.url)       // https://... — feed directly to your audio player
  console.log(stream.codec)     // "opus" or "mp4a"
  console.log(stream.bitrate)   // bits per second (e.g. 320000 = 320kbps)
  console.log(stream.expiresAt) // Unix timestamp — URL expires, re-fetch when stale

  // Check how long the URL is still valid
  const ttlSeconds = stream.expiresAt - Math.floor(Date.now() / 1000)
  console.log(`URL valid for ${Math.floor(ttlSeconds / 3600)}h ${Math.floor((ttlSeconds % 3600) / 60)}m`)

  // --- Quality selection ---

  const high = await mk.getStream(songs[0].videoId, { quality: 'high' }) // default
  const low  = await mk.getStream(songs[0].videoId, { quality: 'low' })

  console.log(high.bitrate)  // higher bitrate
  console.log(low.bitrate)   // lower bitrate (faster load, smaller data)

  // --- Optional stream fields ---

  console.log(stream.loudnessDb)  // number | undefined — LUFS for normalization
  console.log(stream.sizeBytes)   // number | undefined — total file size

  // --- getTrack: metadata + stream in one call (YouTube video IDs only) ---
  //
  // Use this when you have a YouTube video URL or ID and want both
  // the song metadata and stream URL together.
  //
  // For IDs returned by search(), use getStream() + the Song from search results.

  const track = await mk.getTrack('fJ9rUzIMcZQ')  // YouTube video ID
  console.log(track.title)        // "Bohemian Rhapsody"
  console.log(track.artist)       // "Queen"
  console.log(track.stream.url)   // ready to play
}

main()
