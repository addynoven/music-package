import type { LyricLine, WordTime } from '../models'

const WORD_TAG_RE = /<(\d+):(\d+\.\d+)>([^<]*)/g

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of lrc.split('\n')) {
    const match = line.match(/^\[(\d+):(\d+\.\d+)\]\s*(.*)/)
    if (!match) continue
    const raw = match[3].trim()
    if (!raw) continue
    const time = parseInt(match[1], 10) * 60 + parseFloat(match[2])

    if (raw.includes('<')) {
      const words: WordTime[] = []
      let m: RegExpExecArray | null
      WORD_TAG_RE.lastIndex = 0
      while ((m = WORD_TAG_RE.exec(raw)) !== null) {
        const wordText = m[3].trim()
        if (wordText) words.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), duration: 0, text: wordText })
      }
      if (words.length > 0) {
        lines.push({ time, text: words.map(w => w.text).join(' '), words })
        continue
      }
    }

    lines.push({ time, text: raw })
  }
  return lines
}

export function getActiveLineIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) idx = i
    else break
  }
  return idx
}

export function getActiveLine(lines: LyricLine[], currentTime: number): LyricLine | null {
  const idx = getActiveLineIndex(lines, currentTime)
  return idx === -1 ? null : lines[idx]
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const mm = String(mins).padStart(2, '0')
  const ss = secs.toFixed(2).padStart(5, '0')
  return `[${mm}:${ss}]`
}

export function offsetLrc(lines: LyricLine[], offsetMs: number): LyricLine[] {
  return lines.map(line => ({
    ...line,
    time: Math.max(0, line.time + offsetMs / 1000),
  }))
}

export function serializeLrc(lines: LyricLine[]): string {
  if (lines.length === 0) return ''
  return lines.map(line => `${formatTimestamp(line.time)} ${line.text}`).join('\n')
}
