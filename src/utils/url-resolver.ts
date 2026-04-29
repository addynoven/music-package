const YOUTUBE_WATCH_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?|youtu\.be\/)(.+)/
const YTM_BASE = 'music.youtube.com'
const SPOTIFY_TRACK_RE = /^https?:\/\/open\.spotify\.com\/track\//
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i

/**
 * Resolves any URL to the canonical ID or query string the source pipeline expects.
 *
 * youtube.com/watch?v=ID, youtu.be/ID       → "ID"
 * music.youtube.com/watch?v=ID              → "ID"
 * music.youtube.com/browse/BROWSE_ID        → "BROWSE_ID"
 * music.youtube.com/playlist?list=ID        → "ID"
 * music.youtube.com/search?q=QUERY          → decoded query string
 * Everything else                           → input unchanged
 */
export function resolveInput(input: string): string {
  if (!input) return input

  const yt = resolveYouTubeUrl(input)
  if (yt !== null) return yt

  const ytm = resolveYouTubeMusicUrl(input)
  if (ytm !== null) return ytm

  return input
}

function resolveYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1)
      return id || null
    }

    if (host === 'youtube.com') {
      const v = url.searchParams.get('v')
      return v || null
    }

    return null
  } catch {
    return null
  }
}

/**
 * Resolves a Spotify track URL to a "Title Artist" search query by scraping
 * the open.spotify.com page title. Returns null for non-track URLs or failures.
 */
export async function resolveSpotifyUrl(url: string): Promise<string | null> {
  if (!SPOTIFY_TRACK_RE.test(url)) return null

  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!resp.ok) return null
    const html = await resp.text()
    const m = TITLE_RE.exec(html)
    if (!m) return null

    // "Song Title - song and lyrics by Artist Name | Spotify"
    let raw = m[1].trim()
    raw = raw.replace(/\s*-\s*song\s+and\s+lyrics\s+by\s+/i, ' ')
    raw = raw.replace(/\s*\|\s*Spotify\s*$/i, '')
    return raw.trim() || null
  } catch {
    return null
  }
}

function resolveYouTubeMusicUrl(input: string): string | null {
  try {
    const url = new URL(input)
    if (url.hostname !== YTM_BASE) return null

    const segments = url.pathname.split('/').filter(Boolean)

    // /watch?v=ID
    if (segments[0] === 'watch') {
      const v = url.searchParams.get('v')
      return v || null
    }

    // /browse/BROWSE_ID
    if (segments[0] === 'browse' && segments[1]) {
      return segments[1]
    }

    // /playlist?list=ID
    if (segments[0] === 'playlist') {
      const list = url.searchParams.get('list')
      return list || null
    }

    // /search?q=QUERY
    if (segments[0] === 'search') {
      const q = url.searchParams.get('q')
      return q ? decodeURIComponent(q.replace(/\+/g, ' ')) : null
    }

    return null
  } catch {
    return null
  }
}
