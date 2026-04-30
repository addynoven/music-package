import { parseLrc } from './lrc-utils'
import type { Lyrics } from '../models'
import type { LyricsProvider } from './provider'

export const SIMPMUSIC_BASE = 'https://api-lyrics.simpmusic.org'

// ---------------------------------------------------------------------------
// Raw API shapes (defensive — all fields optional)
// ---------------------------------------------------------------------------

interface SimpMusicLyricItem {
  videoId?: unknown
  syncedLyrics?: unknown
  plainLyric?: unknown
}

interface SimpMusicApiResponse {
  data?: SimpMusicLyricItem[] | null
  success?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function toLyrics(item: SimpMusicLyricItem): Lyrics | null {
  const synced = toStringOrNull(item.syncedLyrics)
  const plain = toStringOrNull(item.plainLyric)

  if (!synced && !plain) return null

  const syncedLines = synced ? parseLrc(synced) : null

  const plainText = plain
    ?? (syncedLines ? syncedLines.map(l => l.text).join('\n') : null)

  if (!plainText) return null

  return {
    plain: plainText,
    synced: syncedLines && syncedLines.length > 0 ? syncedLines : null,
  }
}

async function fetchItem(
  url: string,
  fetchFn: typeof globalThis.fetch,
): Promise<SimpMusicLyricItem | null> {
  const res = await fetchFn(url)
  if (!res.ok) return null

  const body = (await res.json()) as SimpMusicApiResponse
  const item = body?.data?.[0]
  return item ?? null
}

// ---------------------------------------------------------------------------
// Public fetcher
// ---------------------------------------------------------------------------

/**
 * Fetches lyrics from SimpMusic. Tries title+artist lookup first, then
 * falls back to videoId-based lookup if the first returns no syncedLyric.
 *
 * Returns null on any error or no usable result.
 */
export async function fetchFromSimpMusic(
  artist: string,
  title: string,
  duration?: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  videoId?: string,
): Promise<Lyrics | null> {
  try {
    // Step 1 — search by "title artist"
    const q = encodeURIComponent(`${title} ${artist}`)
    const searchItem = await fetchItem(
      `${SIMPMUSIC_BASE}/v1/search?q=${q}&limit=1`,
      fetchFn,
    )

    if (searchItem) {
      const syncedPresent = toStringOrNull(searchItem.syncedLyrics) !== null
      const plainPresent  = toStringOrNull(searchItem.plainLyric) !== null

      if (syncedPresent || plainPresent) {
        const result = toLyrics(searchItem)
        if (result) return result
      }
    }

    // Step 2 — videoId-based fallback when search returned nothing useful
    if (!videoId) return null

    const videoItem = await fetchItem(
      `${SIMPMUSIC_BASE}/v1/${encodeURIComponent(videoId)}`,
      fetchFn,
    )
    if (!videoItem) return null

    return toLyrics(videoItem)
  } catch {
    return null
  }
}

export const simpMusicProvider: LyricsProvider = {
  name: 'simpmusic',
  fetch: (artist, title, duration, fetchFn, videoId) =>
    fetchFromSimpMusic(artist, title, duration, fetchFn, videoId),
}
