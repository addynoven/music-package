import type { Lyrics, LyricLine } from '../models'
import type { LyricsProvider } from './provider'

export const KUGOU_SEARCH_BASE = 'https://mobileservice.kugou.com'
export const KUGOU_LYRICS_BASE = 'https://lyrics.kugou.com'

// ── Internal response shapes ──────────────────────────────────────────────────

interface SongInfo {
  hash: string
  songname: string
  singername: string
  duration: number // seconds
}

interface SearchSongData {
  info: SongInfo[]
}

interface SearchSongResponse {
  data: SearchSongData
}

interface LyricsCandidate {
  id: string | number
  accesskey: string
}

interface SearchLyricsResponse {
  candidates: LyricsCandidate[]
}

interface DownloadLyricsResponse {
  content: string // base64-encoded LRC
}

// ── LRC parser ────────────────────────────────────────────────────────────────

// Matches one or more timestamps at the start of a line: [mm:ss.xx]
const TIMESTAMP_RE = /\[(\d+):(\d+\.\d+)\]/g

function parseTimestamp(mm: string, ss: string): number {
  return parseInt(mm, 10) * 60 + parseFloat(ss)
}

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const rawLine of lrc.split('\n')) {
    // Collect all leading timestamps
    const timestamps: number[] = []
    let lastIndex = 0
    TIMESTAMP_RE.lastIndex = 0

    let m: RegExpExecArray | null
    while ((m = TIMESTAMP_RE.exec(rawLine)) !== null) {
      timestamps.push(parseTimestamp(m[1], m[2]))
      lastIndex = TIMESTAMP_RE.lastIndex
    }

    if (timestamps.length === 0) continue

    const text = rawLine.slice(lastIndex).trim()
    if (!text) continue

    for (const time of timestamps) {
      lines.push({ time, text })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchFromKuGou(
  artist: string,
  title: string,
  duration?: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Lyrics | null> {
  try {
    // Step 1: Search for songs
    const keyword = encodeURIComponent(`${artist} ${title}`)
    const searchUrl = `${KUGOU_SEARCH_BASE}/api/v3/search/song?keyword=${keyword}&pagesize=20&page=1`
    const searchRes = await fetchFn(searchUrl)
    if (!searchRes.ok) return null

    const searchData = (await searchRes.json()) as unknown
    const songs: SongInfo[] = getSongs(searchData)
    if (songs.length === 0) return null

    // Pick the best match
    let chosen: SongInfo | undefined
    if (duration !== undefined) {
      const TOLERANCE = 5 // seconds
      const candidates = songs.filter(s => Math.abs(s.duration - duration) <= TOLERANCE)
      if (candidates.length === 0) return null
      // Pick closest duration among qualifying candidates
      chosen = candidates.reduce((best, s) =>
        Math.abs(s.duration - duration) < Math.abs(best.duration - duration) ? s : best,
      )
    } else {
      chosen = songs[0]
    }

    if (!chosen) return null

    // Step 2: Lyric search by hash
    const durationMs = duration !== undefined ? Math.round(duration * 1000) : undefined
    const lyricSearchParams = new URLSearchParams({
      ver: '1',
      man: 'yes',
      client: 'mobi',
      keyword: title,
      hash: chosen.hash,
    })
    if (durationMs !== undefined) {
      lyricSearchParams.set('duration', String(durationMs))
    }
    const lyricSearchRes = await fetchFn(`${KUGOU_LYRICS_BASE}/search?${lyricSearchParams}`)
    if (!lyricSearchRes.ok) return null

    const lyricSearchData = (await lyricSearchRes.json()) as unknown
    const candidate = getFirstCandidate(lyricSearchData)
    if (!candidate) return null

    // Step 3: Download lyrics
    const downloadParams = new URLSearchParams({
      ver: '1',
      client: 'pc',
      id: String(candidate.id),
      accesskey: candidate.accesskey,
      fmt: 'lrc',
      charset: 'utf8',
    })
    const downloadRes = await fetchFn(`${KUGOU_LYRICS_BASE}/download?${downloadParams}`)
    if (!downloadRes.ok) return null

    const downloadData = (await downloadRes.json()) as unknown
    const b64 = getContent(downloadData)
    if (!b64) return null

    // Step 4: Decode base64 → LRC text
    const lrcText = Buffer.from(b64, 'base64').toString('utf8')

    // Step 5: Parse LRC
    const synced = parseLrc(lrcText)

    if (synced.length === 0) return null

    const plain = synced.map(l => l.text).join('\n')

    return { plain, synced }
  } catch {
    return null
  }
}

export const kugouProvider: LyricsProvider = {
  name: 'kugou',
  fetch: fetchFromKuGou,
}

// ── Defensive JSON accessors ──────────────────────────────────────────────────

function getSongs(data: unknown): SongInfo[] {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('data' in data)
  ) return []

  const d = (data as { data: unknown }).data
  if (typeof d !== 'object' || d === null || !('info' in d)) return []

  const info = (d as { info: unknown }).info
  if (!Array.isArray(info)) return []

  return info.filter((item): item is SongInfo =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Record<string, unknown>).hash === 'string' &&
    typeof (item as Record<string, unknown>).duration === 'number',
  )
}

function getFirstCandidate(data: unknown): LyricsCandidate | null {
  if (typeof data !== 'object' || data === null || !('candidates' in data)) return null

  const candidates = (data as { candidates: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const first = candidates[0] as unknown
  if (
    typeof first !== 'object' ||
    first === null ||
    !('id' in first) ||
    !('accesskey' in first)
  ) return null

  const f = first as Record<string, unknown>
  if (
    (typeof f.id !== 'string' && typeof f.id !== 'number') ||
    typeof f.accesskey !== 'string'
  ) return null

  return { id: f.id as string | number, accesskey: f.accesskey as string }
}

function getContent(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('content' in data)) return null

  const content = (data as { content: unknown }).content
  if (typeof content !== 'string' || content.length === 0) return null

  return content
}
