/**
 * Real-world patterns — how MusicKit fits into actual applications.
 */

import { MusicKit } from 'musicstream-sdk'
import type { Song, AudioTrack } from 'musicstream-sdk'

// ─────────────────────────────────────────────
// Pattern 1: CLI music player
// ─────────────────────────────────────────────

async function cliPlayer(query: string) {
  const mk = new MusicKit({ logLevel: "silent" })

  console.log(`Searching for: ${query}`)
  const songs = await mk.search(query, { filter: "songs" })

  if (songs.length === 0) {
    console.log("No results found.")
    return
  }

  const song = songs[0]
  console.log(`Playing: ${song.title} by ${song.artist} (${formatDuration(song.duration)})`)

  const stream = await mk.getStream(song.videoId)
  console.log(`Stream URL: ${stream.url}`)
  console.log(`Codec: ${stream.codec} @ ${Math.round(stream.bitrate / 1000)}kbps`)

  // Pass stream.url to your audio player (mpv, ffplay, etc.)
  // e.g. execa('mpv', [stream.url])
}

// ─────────────────────────────────────────────
// Pattern 2: Discord bot
// ─────────────────────────────────────────────

class MusicBot {
  private mk = new MusicKit({
    logLevel: "warning",
    cache: {
      ttl: { search: 900 }, // 15 min cache for bot reuse
    },
  })

  async play(query: string): Promise<AudioTrack | null> {
    const songs = await this.mk.search(query, { filter: "songs" })
    if (songs.length === 0) return null
    return this.mk.getTrack(songs[0].videoId)
  }

  async queue(queries: string[]): Promise<AudioTrack[]> {
    const tracks: AudioTrack[] = []
    for (const q of queries) {
      const track = await this.play(q)
      if (track) tracks.push(track)
    }
    return tracks
  }
}

// ─────────────────────────────────────────────
// Pattern 3: Download manager
// ─────────────────────────────────────────────

async function downloadPlaylist(artistName: string, outputDir: string) {
  const mk = new MusicKit()

  console.log(`Finding songs by ${artistName}...`)
  const songs = await mk.search(artistName, { filter: "songs" })

  console.log(`Downloading ${songs.length} songs to ${outputDir}`)

  let done = 0
  for (const song of songs) {
    await mk.download(song.videoId, {
      path: outputDir,
      format: "opus",
      onProgress: (p) => {
        process.stdout.write(`\r[${done + 1}/${songs.length}] ${song.title}: ${p.toFixed(0)}%`)
      },
    })
    done++
    console.log() // newline after progress
  }

  console.log(`\nAll done! ${done} songs saved to ${outputDir}`)
}

// ─────────────────────────────────────────────
// Pattern 4: Monitoring with events
// ─────────────────────────────────────────────

function createMonitoredClient() {
  const mk = new MusicKit({ logLevel: "silent" })
  const stats = { requests: 0, cacheHits: 0, errors: 0, totalMs: 0 }

  mk.on("afterRequest", (_, durationMs) => {
    stats.requests++
    stats.totalMs += durationMs
  })

  mk.on("cacheHit", () => {
    stats.cacheHits++
  })

  mk.on("error", () => {
    stats.errors++
  })

  const report = () => ({
    ...stats,
    avgMs: stats.requests > 0 ? Math.round(stats.totalMs / stats.requests) : 0,
    cacheRate: stats.requests > 0
      ? `${Math.round((stats.cacheHits / stats.requests) * 100)}%`
      : "0%",
  })

  return { mk, report }
}

// ─────────────────────────────────────────────
// Pattern 5: Autocomplete endpoint for a web app
// ─────────────────────────────────────────────

// In an Express / Hono / Fastify handler:
//
// app.get('/autocomplete', async (req, res) => {
//   const { q } = req.query
//   if (!q || typeof q !== 'string') return res.json([])
//   const suggestions = await mk.autocomplete(q)
//   res.json(suggestions)
// })

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Run CLI player example
cliPlayer(process.argv[2] ?? "bohemian rhapsody")
