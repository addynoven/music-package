import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { Downloader } from '../../../src/downloader'

// ── helpers ────────────────────────────────────────────────────────────────

function makeProc(overrides: Record<string, any> = {}) {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  stderr.resume = vi.fn()
  return { stdout, stdin, stderr, on: vi.fn(), ...overrides }
}

// ── module mock ────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:stream/promises', () => ({ pipeline: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../src/stream', () => ({
  StreamResolver: vi.fn().mockImplementation(() => ({ resolve: vi.fn() })),
}))

import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { StreamResolver } from '../../../src/stream'

// ── suite ──────────────────────────────────────────────────────────────────

describe('Downloader.streamPCM', () => {
  let downloader: Downloader

  beforeEach(() => {
    vi.clearAllMocks()
    const resolver = new (StreamResolver as any)()
    const discovery = { getInfo: vi.fn() }
    downloader = new Downloader(resolver, discovery as any)
  })

  it('spawns yt-dlp targeting the correct YouTube Music URL', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    downloader.streamPCM('dQw4w9WgXcQ')

    const [cmd, args] = (spawn as any).mock.calls[0]
    expect(cmd).toBe('yt-dlp')
    expect(args).toContain('https://music.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(args).toContain('-')          // stdout output flag
    expect(args).toContain('bestaudio')  // best quality audio
  })

  it('spawns ffmpeg reading from stdin and outputting 48 kHz stereo s16le PCM', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    downloader.streamPCM('dQw4w9WgXcQ')

    const [cmd, args] = (spawn as any).mock.calls[1]
    expect(cmd).toBe('ffmpeg')
    expect(args).toContain('pipe:0')   // read from stdin
    expect(args).toContain('2')        // -ac 2 (stereo)
    expect(args).toContain('48000')    // -ar 48000
    expect(args).toContain('s16le')    // -f s16le (raw PCM)
    expect(args).toContain('pipe:1')   // write to stdout
  })

  it('connects yt-dlp stdout to ffmpeg stdin via pipeline(), not .pipe()', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    const pipeSpy = vi.spyOn(ytdlp.stdout, 'pipe')
    downloader.streamPCM('dQw4w9WgXcQ')

    expect(pipeline).toHaveBeenCalledWith(ytdlp.stdout, ffmpeg.stdin)
    expect(pipeSpy).not.toHaveBeenCalled()
  })

  it('returns the ffmpeg stdout stream', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    const result = downloader.streamPCM('dQw4w9WgXcQ')

    expect(result).toBe(ffmpeg.stdout)
  })

  it('resumes yt-dlp stderr so the process does not stall', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    downloader.streamPCM('dQw4w9WgXcQ')

    expect(ytdlp.stderr.resume).toHaveBeenCalled()
  })

  it('resumes ffmpeg stderr so the process does not stall', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    downloader.streamPCM('dQw4w9WgXcQ')

    expect(ffmpeg.stderr.resume).toHaveBeenCalled()
  })

  it('passes cookies path to yt-dlp when configured', () => {
    const resolver = new (StreamResolver as any)()
    const discovery = { getInfo: vi.fn() }
    const downloaderWithCookies = new Downloader(resolver, discovery as any, '/tmp/cookies.txt')

    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    downloaderWithCookies.streamPCM('dQw4w9WgXcQ')

    const [, args] = (spawn as any).mock.calls[0]
    expect(args).toContain('--cookies')
    expect(args).toContain('/tmp/cookies.txt')
  })

  it('does not pass cookies args when no cookies path is set', () => {
    const ytdlp = makeProc()
    const ffmpeg = makeProc()
    ;(spawn as any)
      .mockReturnValueOnce(ytdlp)
      .mockReturnValueOnce(ffmpeg)

    downloader.streamPCM('dQw4w9WgXcQ')

    const [, args] = (spawn as any).mock.calls[0]
    expect(args).not.toContain('--cookies')
  })
})
