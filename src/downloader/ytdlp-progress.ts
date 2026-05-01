const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)(B|KiB|MiB|GiB|TiB)/

const UNIT_BYTES: Record<string, number> = {
  B: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
  TiB: 1024 * 1024 * 1024 * 1024,
}

export interface YtdlpProgressResult {
  percent: number
  totalBytes: number
  bytesDownloaded: number
}

export function parseYtdlpProgress(line: string): YtdlpProgressResult | null {
  const m = line.match(PROGRESS_RE)
  if (!m) return null

  const percent = Math.min(100, Math.max(0, Math.floor(parseFloat(m[1]))))
  const totalBytes = parseFloat(m[2]) * (UNIT_BYTES[m[3]] ?? 1)
  const bytesDownloaded = totalBytes * (percent / 100)

  return { percent, totalBytes, bytesDownloaded }
}
