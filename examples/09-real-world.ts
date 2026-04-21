/**
 * Real-world patterns — how MusicKit fits into actual applications.
 */

import { MusicKit } from 'musicstream-sdk'
import type { Song, StreamingData } from 'musicstream-sdk'

// ─────────────────────────────────────────────
// Pattern 1: CLI music player
// ─────────────────────────────────────────────

async function cliPlayer(query: string) {
  const mk = new MusicKit({ logLevel: 'silent' })

  const songs = await mk.search(query, { filter: 'songs' })
  if (songs.length === 0) {
    console.log('No results found.')
    return
  }

  const song = songs[0]
  console.log(`Playing: ${song.title} by ${song.artist} (${formatDuration(song.duration)})`)

  const stream = await mk.getStream(song.videoId)
  console.log(`Stream: ${stream.codec} @ ${Math.round(stream.bitrate / 1000)}kbps`)

  // Pass stream.url to your audio player (mpv, ffplay, etc.)
  // execa('mpv', [stream.url])
}

// ─────────────────────────────────────────────
// Pattern 2: Discord bot
// ─────────────────────────────────────────────

class MusicBot {
  private mk = new MusicKit({
    logLevel: 'warn',
    cache: { ttl: { search: 900 } }, // 15 min search cache
  })

  async play(query: string): Promise<{ song: Song; stream: StreamingData } | null> {
    const songs = await this.mk.search(query, { filter: 'songs' })
    if (songs.length === 0) return null
    const song = songs[0]
    const stream = await this.mk.getStream(song.videoId)
    return { song, stream }
    // song:   title, artist, duration, thumbnails
    // stream: url, codec, bitrate, expiresAt
  }

  async queue(queries: string[]): Promise<Array<{ song: Song; stream: StreamingData }>> {
    const tracks = []
    for (const q of queries) {
      const result = await this.play(q)
      if (result) tracks.push(result)
    }
    return tracks
  }
}

// ─────────────────────────────────────────────
// Pattern 3: Download manager
// ─────────────────────────────────────────────
//
// download() requires a YouTube video URL or ID.
// Use a YouTube Music search URL to get downloadable IDs.

async function downloadArtist(artistName: string, outputDir: string) {
  const mk = new MusicKit()

  const songs = await mk.search(
    `https://music.youtube.com/search?q=${encodeURIComponent(artistName)}`,
    { filter: 'songs' }
  )

  console.log(`Downloading ${songs.length} songs to ${outputDir}`)

  let done = 0
  for (const song of songs) {
    await mk.download(song.videoId, {
      path: outputDir,
      format: 'opus',
      onProgress: (p) => process.stdout.write(`\r[${done + 1}/${songs.length}] ${song.title}: ${p.toFixed(0)}%`),
    })
    done++
    console.log()
  }

  console.log(`\nDone! ${done} songs saved to ${outputDir}`)
}

// ─────────────────────────────────────────────
// Pattern 4: Playlist streamer
// ─────────────────────────────────────────────

async function streamPlaylist(query: string) {
  const mk = new MusicKit({ logLevel: 'silent' })

  const playlists = await mk.search(query, { filter: 'playlists' })
  if (playlists.length === 0) return

  const playlist = await mk.getPlaylist(playlists[0].playlistId)
  console.log(`Playlist: ${playlist.title} — ${playlist.songs?.length ?? 0} songs`)

  for (const song of playlist.songs ?? []) {
    const stream = await mk.getStream(song.videoId)
    console.log(`Now playing: ${song.title} — ${song.artist}`)
    // stream.url → feed to player
  }
}

// ─────────────────────────────────────────────
// Pattern 5: Radio (infinite play queue)
// ─────────────────────────────────────────────

async function* radioQueue(seedQuery: string): AsyncGenerator<Song> {
  const mk = new MusicKit({ logLevel: 'silent' })
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

// Usage:
// for await (const song of radioQueue('bohemian rhapsody')) {
//   const stream = await mk.getStream(song.videoId)
//   // play stream.url
// }

// ─────────────────────────────────────────────
// Pattern 6: Monitoring with events
// ─────────────────────────────────────────────

function createMonitoredClient() {
  const mk = new MusicKit({ logLevel: 'silent' })
  const stats = { requests: 0, cacheHits: 0, errors: 0, totalMs: 0 }

  mk.on('afterRequest', (_, durationMs) => {
    stats.requests++
    stats.totalMs += durationMs
  })
  mk.on('cacheHit', () => { stats.cacheHits++ })
  mk.on('error', () => { stats.errors++ })

  const report = () => ({
    ...stats,
    avgMs: stats.requests > 0 ? Math.round(stats.totalMs / stats.requests) : 0,
    cacheRate: stats.requests > 0
      ? `${Math.round((stats.cacheHits / stats.requests) * 100)}%`
      : '0%',
  })

  return { mk, report }
}

// ─────────────────────────────────────────────
// Pattern 7: Autocomplete endpoint
// ─────────────────────────────────────────────

// app.get('/autocomplete', async (req, res) => {
//   const q = String(req.query.q ?? '').trim()
//   if (q.length < 2) return res.json([])
//   const suggestions = await mk.autocomplete(q)
//   res.json(suggestions)
// })

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

cliPlayer(process.argv[2] ?? 'bohemian rhapsody')
