import { describe, it, expect } from 'vitest'
import { parseYtdlpProgress } from '../../../src/downloader/ytdlp-progress'

// yt-dlp stderr output looks like:
// [download]  50.0% of   4.50MiB at    2.00MiB/s ETA 00:01
// [download] 100% of   4.50MiB at    3.12MiB/s ETA 00:00
// [download]   3.5% of ~ 10.00MiB at  500.00KiB/s ETA 00:18

describe('parseYtdlpProgress', () => {
  it('returns null for non-progress lines', () => {
    expect(parseYtdlpProgress('[download] Destination: song.opus')).toBeNull()
    expect(parseYtdlpProgress('[info] Writing video description')).toBeNull()
    expect(parseYtdlpProgress('')).toBeNull()
    expect(parseYtdlpProgress('[ffmpeg] Merging formats')).toBeNull()
  })

  it('parses a standard progress line', () => {
    const result = parseYtdlpProgress('[download]  50.0% of   4.50MiB at    2.00MiB/s ETA 00:01')
    expect(result).not.toBeNull()
    expect(result!.percent).toBe(50)
  })

  it('parses 100% completion', () => {
    const result = parseYtdlpProgress('[download] 100% of   4.50MiB at    3.12MiB/s ETA 00:00')
    expect(result!.percent).toBe(100)
  })

  it('parses single-digit percent', () => {
    const result = parseYtdlpProgress('[download]   3.5% of ~ 10.00MiB at  500.00KiB/s ETA 00:18')
    expect(result!.percent).toBe(3)
  })

  it('extracts total bytes when unit is MiB', () => {
    const result = parseYtdlpProgress('[download]  50.0% of   4.50MiB at    2.00MiB/s ETA 00:01')
    expect(result!.totalBytes).toBeGreaterThan(0)
    // 4.50 MiB = 4718592 bytes
    expect(result!.totalBytes).toBeCloseTo(4.5 * 1024 * 1024, -3)
  })

  it('extracts total bytes when unit is KiB', () => {
    const result = parseYtdlpProgress('[download]  75.0% of  512.00KiB at  100.00KiB/s ETA 00:01')
    expect(result!.totalBytes).toBeCloseTo(512 * 1024, -3)
  })

  it('extracts total bytes when unit is GiB', () => {
    const result = parseYtdlpProgress('[download]  10.0% of   1.20GiB at    5.00MiB/s ETA 00:04')
    expect(result!.totalBytes).toBeCloseTo(1.2 * 1024 * 1024 * 1024, -6)
  })

  it('computes bytesDownloaded from percent and total', () => {
    const result = parseYtdlpProgress('[download]  50.0% of   4.00MiB at    2.00MiB/s ETA 00:01')
    // 50% of 4MiB = 2MiB
    expect(result!.bytesDownloaded).toBeCloseTo(2 * 1024 * 1024, -3)
  })

  it('handles approximate size marker (~)', () => {
    const result = parseYtdlpProgress('[download]   3.5% of ~ 10.00MiB at  500.00KiB/s ETA 00:18')
    expect(result).not.toBeNull()
    expect(result!.percent).toBe(3)
    expect(result!.totalBytes).toBeCloseTo(10 * 1024 * 1024, -3)
  })

  it('clamps percent to 0-100', () => {
    const result = parseYtdlpProgress('[download] 100% of   4.50MiB at    3.12MiB/s ETA 00:00')
    expect(result!.percent).toBeGreaterThanOrEqual(0)
    expect(result!.percent).toBeLessThanOrEqual(100)
  })
})
