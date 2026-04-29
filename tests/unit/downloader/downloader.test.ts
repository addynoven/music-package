import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { Downloader } from '../../../src/downloader'
import { makeStreamingData, makeSong } from '../../helpers/mock-factory'

vi.mock('../../../src/stream', () => ({
  StreamResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn(),
  })),
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, createWriteStream: vi.fn() }
})

import { StreamResolver } from '../../../src/stream'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

function makeYtdlpMock(exitCode = 0) {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  const stderr = new EventEmitter() as any
  stderr.resume = vi.fn()
  proc.stderr = stderr
  process.nextTick(() => proc.emit('close', exitCode))
  return proc
}

describe('Downloader', () => {
  let resolver: InstanceType<typeof StreamResolver>
  let downloader: Downloader
  const tmpDir = tmpdir()

  beforeEach(() => {
    vi.clearAllMocks()
    resolver = new (StreamResolver as any)()
    const mockDiscovery = { getInfo: vi.fn().mockResolvedValue({ title: 'Test Song', artist: 'Test Artist', videoId: 'dQw4w9WgXcQ', type: 'song', duration: 0, thumbnails: [] }) }
    downloader = new Downloader(resolver as any, mockDiscovery as any)

    const makeWriteStream = () => ({
      write: vi.fn(), end: vi.fn(), destroy: vi.fn(), on: vi.fn(),
      once: vi.fn((event: string, cb: Function) => { if (event === 'finish') cb() }),
    })
    ;(createWriteStream as any).mockReturnValue(makeWriteStream())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ─── file naming ──────────────────────────────────────────────────────────

  describe('file naming', () => {
    it('names the file "<title> (<artist>).<format>"', async () => {
      const stream = makeStreamingData({ _meta: { title: 'Bohemian Rhapsody', artist: 'Queen' } } as any)
      const song = makeSong({ title: 'Bohemian Rhapsody', artist: 'Queen' })
      ;(resolver.resolve as any).mockResolvedValue(stream)
      vi.mocked(spawn).mockImplementation(() => makeYtdlpMock() as any)

      await downloader.download(song.videoId, { path: tmpDir, format: 'opus', _mockSong: song })

      const outputArg = vi.mocked(spawn).mock.calls[0][1].find((a: string, i: number, arr: string[]) => arr[i - 1] === '-o')
      expect(outputArg).toContain('Bohemian Rhapsody (Queen).opus')
    })

    it('strips characters invalid in file names from the title', async () => {
      const song = makeSong({ title: 'Song: A/B Test', artist: 'Test' })
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData())
      vi.mocked(spawn).mockImplementation(() => makeYtdlpMock() as any)

      await downloader.download(song.videoId, { path: tmpDir, _mockSong: song })

      const { basename } = await import('node:path')
      const outputArg = vi.mocked(spawn).mock.calls[0][1].find((a: string, i: number, arr: string[]) => arr[i - 1] === '-o') ?? ''
      expect(basename(outputArg)).not.toMatch(/[:/\\]/)
    })

    it('defaults to opus format when no format is specified', async () => {
      const song = makeSong()
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData())
      vi.mocked(spawn).mockImplementation(() => makeYtdlpMock() as any)

      await downloader.download(song.videoId, { path: tmpDir, _mockSong: song })

      const outputArg = vi.mocked(spawn).mock.calls[0][1].find((a: string, i: number, arr: string[]) => arr[i - 1] === '-o') ?? ''
      expect(outputArg).toMatch(/\.opus$/)
    })
  })

  // ─── format selection ─────────────────────────────────────────────────────

  describe('format selection', () => {
    it('requests opus codec from the stream resolver for opus format', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData())
      vi.mocked(spawn).mockImplementation(() => makeYtdlpMock() as any)

      await downloader.download('dQw4w9WgXcQ', { path: tmpDir, format: 'opus' })

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.objectContaining({ codec: 'opus' }))
    })

    it('requests m4a codec from the stream resolver for m4a format', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ codec: 'mp4a' }))
      vi.mocked(spawn).mockImplementation(() => makeYtdlpMock() as any)

      await downloader.download('dQw4w9WgXcQ', { path: tmpDir, format: 'm4a' })

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.objectContaining({ codec: 'mp4a' }))
    })
  })

  // ─── progress callback ────────────────────────────────────────────────────

  describe('onProgress callback', () => {
    it('receives a DownloadProgress object, not a bare number', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ sizeBytes: 1000 }))

      const received: any[] = []
      const mockStream = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'data') { cb(Buffer.alloc(500)); cb(Buffer.alloc(500)) }
          if (event === 'end') cb()
        }),
        pipe: vi.fn().mockReturnThis(),
      }
      ;(createWriteStream as any).mockReturnValue({ on: vi.fn() })

      await downloader.download('dQw4w9WgXcQ', {
        path: tmpDir,
        onProgress: (p) => received.push(p),
        _mockReadStream: mockStream,
        _mockSong: makeSong({ title: 'Test Song', artist: 'Test Artist' }),
      })

      expect(received.length).toBeGreaterThan(0)
      const first = received[0]
      expect(typeof first).toBe('object')
      expect(typeof first.percent).toBe('number')
      expect(typeof first.bytesDownloaded).toBe('number')
      expect(typeof first.filename).toBe('string')
    })

    it('percent is between 0 and 100', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ sizeBytes: 1000 }))

      const percents: number[] = []
      const mockStream = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'data') { cb(Buffer.alloc(300)); cb(Buffer.alloc(700)) }
          if (event === 'end') cb()
        }),
        pipe: vi.fn().mockReturnThis(),
      }
      ;(createWriteStream as any).mockReturnValue({ on: vi.fn() })

      await downloader.download('dQw4w9WgXcQ', {
        path: tmpDir,
        onProgress: (p) => percents.push(p.percent),
        _mockReadStream: mockStream,
        _mockSong: makeSong({ title: 'Test Song', artist: 'Test Artist' }),
      })

      expect(percents.every(p => p >= 0 && p <= 100)).toBe(true)
      expect(percents[percents.length - 1]).toBe(100)
    })

    it('filename in progress matches the download filename', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ sizeBytes: 100 }))

      const filenames: string[] = []
      const mockStream = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'data') cb(Buffer.alloc(100))
          if (event === 'end') cb()
        }),
        pipe: vi.fn().mockReturnThis(),
      }
      ;(createWriteStream as any).mockReturnValue({ on: vi.fn() })

      const song = makeSong({ title: 'Bohemian Rhapsody', artist: 'Queen' })
      await downloader.download(song.videoId, {
        path: tmpDir,
        format: 'opus',
        onProgress: (p) => filenames.push(p.filename),
        _mockReadStream: mockStream,
        _mockSong: song,
      })

      expect(filenames[0]).toBe('Bohemian Rhapsody (Queen).opus')
    })

    it('bytesDownloaded accumulates correctly across chunks', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ sizeBytes: 1000 }))

      const snapshots: number[] = []
      const mockStream = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'data') { cb(Buffer.alloc(200)); cb(Buffer.alloc(300)); cb(Buffer.alloc(500)) }
          if (event === 'end') cb()
        }),
        pipe: vi.fn().mockReturnThis(),
      }
      ;(createWriteStream as any).mockReturnValue({ on: vi.fn() })

      await downloader.download('dQw4w9WgXcQ', {
        path: tmpDir,
        onProgress: (p) => snapshots.push(p.bytesDownloaded),
        _mockReadStream: mockStream,
        _mockSong: makeSong({ title: 'Test Song', artist: 'Test Artist' }),
      })

      expect(snapshots).toEqual([200, 500, 1000])
    })
  })

  // ─── error handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws when stream resolution fails', async () => {
      ;(resolver.resolve as any).mockRejectedValue(new Error('Video unavailable'))

      await expect(
        downloader.download('bad-id', { path: tmpDir })
      ).rejects.toThrow('Video unavailable')
    })

    it('throws when yt-dlp exits with non-zero code', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData())
      vi.mocked(spawn).mockImplementation(() => makeYtdlpMock(1) as any)

      await expect(
        downloader.download('dQw4w9WgXcQ', { path: tmpDir })
      ).rejects.toThrow('yt-dlp download failed')
    })
  })
})
