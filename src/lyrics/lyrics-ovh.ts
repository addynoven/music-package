import type { Lyrics } from '../models'

export async function fetchFromLyricsOvh(artist: string, title: string): Promise<Lyrics | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { lyrics?: string }
    const plain = data.lyrics?.trim()
    if (!plain) return null
    return { plain, synced: null }
  } catch {
    return null
  }
}
