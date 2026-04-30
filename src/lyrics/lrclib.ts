import { parseLrc } from './lrc-utils'
import type { Lyrics } from '../models'

const UA = 'musicstream-sdk (https://github.com/addynoven/music-package)'

interface LrclibTrack {
  id: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  plainLyrics?: string
  syncedLyrics?: string
}

function toLyrics(data: LrclibTrack): Lyrics | null {
  if (!data.plainLyrics) return null
  return {
    plain: data.plainLyrics.trim(),
    synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null,
  }
}

// Strict match: LRCLIB `/api/get` accepts artist + title + optional duration
// (±2s tolerance server-side). Returns null if no exact match — never returns
// lyrics from a different recording.
async function getStrict(
  artist: string,
  title: string,
  duration: number | undefined,
  fetchFn: typeof fetch,
): Promise<Lyrics | null> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title })
  if (duration && duration > 0) params.set('duration', String(Math.round(duration)))

  const res = await fetchFn(`https://lrclib.net/api/get?${params}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  return toLyrics(await res.json() as LrclibTrack)
}

// Fallback: `/api/search` returns multiple candidates. We prefer the one with
// synced lyrics AND closest duration to the playback track. Without a known
// duration we can't safely guess, so we just pick the first synced result.
async function searchClosest(
  artist: string,
  title: string,
  duration: number | undefined,
  fetchFn: typeof fetch,
): Promise<Lyrics | null> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title })
  const res = await fetchFn(`https://lrclib.net/api/search?${params}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null

  const candidates = (await res.json()) as LrclibTrack[]
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const synced = candidates.filter(c => c.syncedLyrics)
  const pool = synced.length ? synced : candidates

  let chosen: LrclibTrack
  if (duration && duration > 0) {
    const sorted = [...pool].sort((a, b) => {
      const da = Math.abs((a.duration ?? Infinity) - duration)
      const db = Math.abs((b.duration ?? Infinity) - duration)
      return da - db
    })
    chosen = sorted[0]
    // Reject if even the closest is wildly off — would mean wrong recording.
    if (Math.abs((chosen.duration ?? Infinity) - duration) > 5) return null
  } else {
    chosen = pool[0]
  }

  return toLyrics(chosen)
}

export async function fetchFromLrclib(
  artist: string,
  title: string,
  duration?: number,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<Lyrics | null> {
  try {
    return (await getStrict(artist, title, duration, fetchFn))
        ?? (await searchClosest(artist, title, duration, fetchFn))
  } catch {
    return null
  }
}
