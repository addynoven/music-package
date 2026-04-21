/**
 * Streaming — resolve a song ID into a playable audio URL.
 *
 * getStream()   — accepts any ID returned by search(), getAlbum(),
 *                 getArtist(), getPlaylist(), getRadio(), or getSuggestions().
 *                 Routing is automatic regardless of source.
 *
 * getTrack()    — metadata + stream in one call. Works with any song ID.
 *
 * getMetadata() — song metadata only (no stream). Use when you need title,
 *                 artist, duration, thumbnails without paying for a stream URL.
 *
 * Stream URLs are time-limited (~6h). Use isStreamExpired() before reuse.
 */

import { MusicKit, isStreamExpired, getBestThumbnail } from 'musicstream-sdk'
import type { StreamingData, Song } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Basic: search → stream ---

  const songs = await mk.search('tum hi ho', { filter: 'songs' })
  const stream: StreamingData = await mk.getStream(songs[0].videoId)

  console.log(stream.url)       // https://... — feed directly to your audio player
  console.log(stream.codec)     // "opus" or "mp4a"
  console.log(stream.bitrate)   // bits per second (e.g. 320000 = 320kbps)
  console.log(stream.expiresAt) // Unix timestamp — URL is time-limited

  // --- Check expiry before reuse ---
  //
  // Cache stream URLs in your app but verify before playing.
  // isStreamExpired() returns true when the URL is within 5 minutes of expiry.

  if (isStreamExpired(stream)) {
    const fresh = await mk.getStream(songs[0].videoId)
    console.log(fresh.url)
  }

  // --- Quality selection ---

  const high = await mk.getStream(songs[0].videoId, { quality: 'high' }) // default
  const low  = await mk.getStream(songs[0].videoId, { quality: 'low' })

  console.log(high.bitrate)  // higher bitrate (320kbps from JioSaavn)
  console.log(low.bitrate)   // lower bitrate (faster load, smaller data)

  // --- Optional stream fields ---

  console.log(stream.loudnessDb)  // number | undefined — LUFS for normalization
  console.log(stream.sizeBytes)   // number | undefined — total file size

  // --- getMetadata: song info without fetching a stream ---
  //
  // Useful for building a queue UI, showing song details,
  // or enriching search results without burning stream quota.

  const song: Song = await mk.getMetadata(songs[0].videoId)
  console.log(song.title)      // "Tum Hi Ho"
  console.log(song.artist)     // "Arijit Singh"
  console.log(song.duration)   // seconds
  console.log(song.thumbnails) // Thumbnail[]

  // Pick the best thumbnail size for your UI
  const thumb = getBestThumbnail(song.thumbnails, 300) // closest to 300px
  console.log(thumb?.url)

  // --- getTrack: metadata + stream in one call ---
  //
  // Works with any song ID — from JioSaavn search results or YouTube IDs.

  const track = await mk.getTrack(songs[0].videoId)
  console.log(track.title)        // song metadata
  console.log(track.artist)
  console.log(track.stream.url)   // ready to play
  console.log(track.stream.codec)
}

main()
