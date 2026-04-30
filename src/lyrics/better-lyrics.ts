export interface WordTime {
  time: number      // seconds from track start
  duration: number  // seconds
  text: string      // single word, no whitespace
}

export interface LyricLine {
  time: number
  text: string
  words?: WordTime[]
}

export interface Lyrics {
  plain: string
  synced: LyricLine[] | null
}

export const BETTER_LYRICS_BASE = 'https://lyrics-api.boidu.dev'

// ---------------------------------------------------------------------------
// Time parsing
// Handles: "MM:SS.fff", "HH:MM:SS.fff", bare seconds ("12.45")
// ---------------------------------------------------------------------------
function parseTime(raw: string): number {
  const s = raw.trim()
  if (s.includes(':')) {
    const parts = s.split(':')
    if (parts.length === 2) {
      // MM:SS.fff
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    }
    if (parts.length === 3) {
      // HH:MM:SS.fff
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
    }
  }
  // bare seconds
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// ---------------------------------------------------------------------------
// Tiny regex-based TTML parser — no external deps
// ---------------------------------------------------------------------------

// Pull the value of a named attribute from a tag string (handles single and double quotes)
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i')
  const m = re.exec(tag)
  return m ? m[1] : null
}

// Decode basic XML entities
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// Extract text content from a simple element (strips all child tags, decodes entities)
function innerText(content: string): string {
  return decodeEntities(content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function parseTtml(ttml: string): LyricLine[] | null {
  // Normalise line endings
  const xml = ttml.replace(/\r\n?/g, '\n')

  // Extract <p ...>...</p> blocks — use non-greedy to avoid crossing paragraphs
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
  const lines: LyricLine[] = []

  let pMatch: RegExpExecArray | null
  while ((pMatch = pRe.exec(xml)) !== null) {
    const pAttrs = pMatch[1]
    const pBody = pMatch[2]

    const beginRaw = getAttr(pAttrs, 'begin')
    if (beginRaw === null) continue

    const lineTime = parseTime(beginRaw)

    // Extract <span ...>...</span> children
    const spanRe = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi
    const words: WordTime[] = []

    let spanMatch: RegExpExecArray | null
    while ((spanMatch = spanRe.exec(pBody)) !== null) {
      const spanAttrs = spanMatch[1]
      const spanContent = spanMatch[2]

      const sBeginRaw = getAttr(spanAttrs, 'begin')
      const sEndRaw = getAttr(spanAttrs, 'end')
      const wordText = innerText(spanContent)

      if (sBeginRaw !== null && sEndRaw !== null && wordText.length > 0) {
        const sBegin = parseTime(sBeginRaw)
        const sEnd = parseTime(sEndRaw)
        words.push({
          time: sBegin,
          duration: Math.max(0, sEnd - sBegin),
          text: wordText,
        })
      }
    }

    const text = words.length > 0
      ? words.map(w => w.text).join(' ')
      : innerText(pBody)

    if (text.length === 0) continue

    const line: LyricLine = { time: lineTime, text }
    if (words.length > 0) line.words = words
    lines.push(line)
  }

  return lines.length > 0 ? lines : null
}

// ---------------------------------------------------------------------------
// Public fetcher
// ---------------------------------------------------------------------------
export async function fetchFromBetterLyrics(
  artist: string,
  title: string,
  duration?: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Lyrics | null> {
  try {
    const params = new URLSearchParams({ s: title, a: artist })
    if (duration !== undefined && duration > 0) params.set('d', String(Math.round(duration)))

    const url = `${BETTER_LYRICS_BASE}/getLyrics?${params}`
    const res = await fetchFn(url, {
      headers: { Accept: 'application/xml, text/xml, */*' },
    })

    if (!res.ok) return null

    // The API returns JSON: { ttml: "<tt>...</tt>" }
    const data = (await res.json()) as Record<string, unknown>
    const ttml = typeof data['ttml'] === 'string' ? data['ttml'] : null
    if (!ttml) return null

    const synced = parseTtml(ttml)

    const plain = synced
      ? synced.map(l => l.text).join('\n')
      : ''

    if (!plain) return null

    return { plain, synced }
  } catch {
    return null
  }
}
