import type { LyricLine } from '../models'

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of lrc.split('\n')) {
    const match = line.match(/^\[(\d+):(\d+\.\d+)\]\s*(.*)/)
    if (!match) continue
    const text = match[3].trim()
    if (!text) continue
    const time = parseInt(match[1], 10) * 60 + parseFloat(match[2])
    lines.push({ time, text })
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
