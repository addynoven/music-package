import type { Song } from '../models'

const TITLE_NOISE = /\b(live|cover|remix|karaoke|tribute|instrumental|acoustic|demo|remaster|bamboo|anniversary)\b/i
const ALBUM_NOISE = /\b(party|mix|hits|summer|workout|greatest|essential|ultimate|collection)\b/i

function titleScore(title: string): number {
  return TITLE_NOISE.test(title) ? 0 : 1
}

function albumScore(album?: string): number {
  if (!album) return 1
  return ALBUM_NOISE.test(album) ? 0 : 1
}

// Dominant artist computed only from clean-title songs so cover artists with many
// entries don't bootstrap themselves into the top position.
function dominantCleanArtist(songs: Song[]): string {
  const counts = new Map<string, number>()
  for (const s of songs) {
    if (titleScore(s.title) === 0) continue
    const key = s.artist.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let max = 0
  let dominant = ''
  for (const [artist, count] of counts) {
    if (count > max) { max = count; dominant = artist }
  }
  return dominant
}

export function rankSongs(songs: Song[]): Song[] {
  if (songs.length === 0) return []

  // Duration signal — bucket durations into 10-second slots, score by z-score
  const buckets = songs.map(s => (s.duration ? Math.round(s.duration / 10) : null))
  const validBuckets = buckets.filter((b): b is number => b !== null)
  const mean = validBuckets.length
    ? validBuckets.reduce((a, b) => a + b, 0) / validBuckets.length
    : 0
  const variance = validBuckets.length
    ? validBuckets.reduce((sum, b) => sum + (b - mean) ** 2, 0) / validBuckets.length
    : 0
  const stdDev = Math.sqrt(variance) || 1

  const dominant = dominantCleanArtist(songs)

  const scored = songs.map((s, i) => {
    const ts = titleScore(s.title) * 0.40
    const b = buckets[i] ?? mean
    const z = Math.abs(b - mean) / stdDev
    const ds = Math.max(0, 1 - z / 2) * 0.35
    const as = albumScore(s.album) * 0.15
    const artistBoost = dominant && s.artist.toLowerCase() === dominant ? 0.10 : 0
    return { song: s, score: ts + ds + as + artistBoost }
  })

  return scored.sort((a, b) => b.score - a.score).map(s => s.song)
}
