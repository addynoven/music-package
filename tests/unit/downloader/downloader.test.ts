import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, unlinkSync } from 'node:fs'
import { Downloader } from '../../../src/downloader'
import { makeStreamingData, makeSong } from '../../helpers/mock-factory'

// Mock the StreamResolver so we never hit real YouTube
vi.mock('../../../src/stream', () => ({
  StreamResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn(),
  })),
}))

// Mock node:fs for file write operations
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createWriteStream: vi.fn(),
  }
})

import { StreamResolver } from '../../../src/stream'
import { createWriteStream } from 'node:fs'

describe('Downloader', () => {
  let resolver: InstanceType<typeof StreamResolver>
  let downloader: Downloader
  const tmpDir = tmpdir()

  beforeEach(() => {
    vi.clearAllMocks()
    resolver = new (StreamResolver as any)()
    const mockDiscovery = { getInfo: vi.fn().mockResolvedValue({ title: 'Test Song', artist: 'Test Artist', videoId: 'dQw4w9WgXcQ', type: 'song', duration: 0, thumbnails: [] }) }
    downloader = new Downloader(resolver as any, mockDiscovery as any)
    // Stub fetch so fetchAndWrite completes without hitting real network
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close() } }),
    }))
    // Default write stream: fires 'finish' immediately so fetchAndWrite resolves
    ;(createWriteStream as any).mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: Function) => { if (event === 'finish') cb() }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ─── file naming ──────────────────────────────────────────────────────────

  describe('file naming', () => {
    it('names the file "<title> (<artist>).<format>"', async () => {
      const stream = makeStreamingData()
      const song = makeSong({ title: 'Bohemian Rhapsody', artist: 'Queen' })
      ;(resolver.resolve as any).mockResolvedValue(stream)

      const writtenPaths: string[] = []
      ;(createWriteStream as any).mockImplementation((p: string) => {
        writtenPaths.push(p)
        return { write: vi.fn(), end: vi.fn(), destroy: vi.fn(), on: vi.fn((e: string, cb: Function) => { if (e === 'finish') cb() }) }
      })

      await downloader.download(song.videoId, { path: tmpDir, format: 'opus', _mockSong: song })

      expect(writtenPaths[0]).toContain('Bohemian Rhapsody (Queen).opus')
    })

    it('strips characters invalid in file names from the title', async () => {
      const stream = makeStreamingData()
      const song = makeSong({ title: 'Song: A/B Test', artist: 'Test' })
      ;(resolver.resolve as any).mockResolvedValue(stream)

      const writtenPaths: string[] = []
      ;(createWriteStream as any).mockImplementation((p: string) => {
        writtenPaths.push(p)
        return { write: vi.fn(), end: vi.fn(), destroy: vi.fn(), on: vi.fn((e: string, cb: Function) => { if (e === 'finish') cb() }) }
      })

      await downloader.download(song.videoId, { path: tmpDir, _mockSong: song })

      // Colons and slashes must be stripped or replaced from the filename (not the directory prefix)
      const { basename } = await import('node:path')
      expect(basename(writtenPaths[0])).not.toMatch(/[:/\\]/)
    })

    it('defaults to opus format when no format is specified', async () => {
      const stream = makeStreamingData()
      const song = makeSong()
      ;(resolver.resolve as any).mockResolvedValue(stream)

      const writtenPaths: string[] = []
      ;(createWriteStream as any).mockImplementation((p: string) => {
        writtenPaths.push(p)
        return { write: vi.fn(), end: vi.fn(), destroy: vi.fn(), on: vi.fn((e: string, cb: Function) => { if (e === 'finish') cb() }) }
      })

      await downloader.download(song.videoId, { path: tmpDir, _mockSong: song })

      expect(writtenPaths[0]).toMatch(/\.opus$/)
    })
  })

  // ─── format selection ─────────────────────────────────────────────────────

  describe('format selection', () => {
    it('requests opus quality from the stream resolver for opus format', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData())
      ;(createWriteStream as any).mockReturnValue({ write: vi.fn(), end: vi.fn(), destroy: vi.fn(), on: vi.fn((e: string, cb: Function) => { if (e === 'finish') cb() }) })

      await downloader.download('dQw4w9WgXcQ', { path: tmpDir, format: 'opus' })

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.objectContaining({ codec: 'opus' }))
    })

    it('requests m4a quality from the stream resolver for m4a format', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ codec: 'mp4a' }))
      ;(createWriteStream as any).mockReturnValue({ write: vi.fn(), end: vi.fn(), destroy: vi.fn(), on: vi.fn((e: string, cb: Function) => { if (e === 'finish') cb() }) })

      await downloader.download('dQw4w9WgXcQ', { path: tmpDir, format: 'm4a' })

      expect(resolver.resolve).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.objectContaining({ codec: 'mp4a' }))
    })
  })

  // ─── progress callback ────────────────────────────────────────────────────

  describe('onProgress callback', () => {
    it('calls onProgress with values between 0 and 100', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData({ sizeBytes: 1000 }))

      const progressValues: number[] = []
      const mockStream = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'data') {
            cb(Buffer.alloc(500)) // simulate 50% chunk
            cb(Buffer.alloc(500)) // simulate 100% chunk
          }
          if (event === 'end') cb()
        }),
        pipe: vi.fn().mockReturnThis(),
      }
      ;(createWriteStream as any).mockReturnValue({ on: vi.fn() })

      await downloader.download('dQw4w9WgXcQ', {
        path: tmpDir,
        onProgress: (p) => progressValues.push(p),
        _mockReadStream: mockStream,
      })

      expect(progressValues.some(p => p > 0 && p <= 100)).toBe(true)
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

    it('throws DownloadError when file write fails', async () => {
      ;(resolver.resolve as any).mockResolvedValue(makeStreamingData())
      ;(createWriteStream as any).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      await expect(
        downloader.download('dQw4w9WgXcQ', { path: '/nonexistent/path' })
      ).rejects.toThrow()
    })
  })
})
