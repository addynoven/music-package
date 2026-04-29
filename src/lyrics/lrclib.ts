import { parseLrc } from './lrc-utils'
import type { Lyrics } from '../models'

interface LrclibResponse {
  plainLyrics?: string
  syncedLyrics?: string
}

export async function fetchFromLrclib(artist: string, title: string): Promise<Lyrics | null> {
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title })
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': 'musicstream-sdk (https://github.com/addynoven/music-package)' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as LrclibResponse
    if (!data.plainLyrics) return null
    return {
      plain: data.plainLyrics.trim(),
      synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null,
    }
  } catch {
    return null
  }
}
