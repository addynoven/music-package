import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { StreamResolver } from '../stream'
import type { DiscoveryClient } from '../discovery'
import type { Song } from '../models'

type DownloadFormat = 'opus' | 'm4a'

interface DownloadOptions {
  path?: string
  format?: DownloadFormat
  onProgress?: (percent: number) => void
  _mockSong?: Song
  _mockReadStream?: NodeJS.ReadableStream
}

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

function sanitize(name: string): string {
  return name.replace(INVALID_CHARS, '').trim()
}

function ytdlpDownload(videoId: string, destFile: string, format: DownloadFormat, cookiesPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cookiesArgs = cookiesPath ? ['--cookies', cookiesPath] : []
    const proc = spawn('yt-dlp', [
      '--no-playlist',
      ...cookiesArgs,
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '-f', format === 'm4a' ? 'bestaudio[ext=m4a]/bestaudio' : 'bestaudio[ext=webm]/bestaudio',
      '-x', '--audio-format', format,
      '-o', destFile,
      `https://music.youtube.com/watch?v=${videoId}`,
    ])
    let err = ''
    proc.stderr.on('data', (d: Buffer) => { err += d })
    proc.on('error', (spawnErr) => reject(new Error(`yt-dlp not found or failed to start: ${spawnErr.message}`)))
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`yt-dlp download failed: ${err.slice(0, 200)}`))
      else resolve()
    })
  })
}

export class Downloader {
  constructor(
    private readonly resolver: StreamResolver,
    private readonly discovery: DiscoveryClient,
    private readonly cookiesPath?: string,
  ) {}

  streamAudio(videoId: string): NodeJS.ReadableStream {
    const cookiesArgs = this.cookiesPath ? ['--cookies', this.cookiesPath] : []
    const proc = spawn('yt-dlp', [
      '--no-playlist',
      ...cookiesArgs,
      '-f', 'bestaudio',
      '-o', '-',
      `https://music.youtube.com/watch?v=${videoId}`,
    ])
    proc.stderr.resume()
    return proc.stdout
  }


  streamPCMFromUrl(url: string): NodeJS.ReadableStream {
    const ffmpeg = spawn('ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-hide_banner', '-loglevel', 'error',
      '-i', url,
      '-ac', '2',
      '-ar', '48000',
      '-f', 's16le',
      'pipe:1',
    ])
    ffmpeg.stderr.resume()
    return ffmpeg.stdout
  }

  streamPCM(videoId: string): NodeJS.ReadableStream {
    const cookiesArgs = this.cookiesPath ? ['--cookies', this.cookiesPath] : []
    const ytdlp = spawn('yt-dlp', [
      '--no-playlist',
      ...cookiesArgs,
      '-f', 'bestaudio',
      '-o', '-',
      `https://music.youtube.com/watch?v=${videoId}`,
    ])
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-ac', '2',
      '-ar', '48000',
      '-f', 's16le',
      'pipe:1',
    ])
    ytdlp.stderr.resume()
    ffmpeg.stderr.resume()
    ytdlp.stdout.pipe(ffmpeg.stdin)
    ytdlp.on('error', (err: Error) => ffmpeg.stdin.destroy(err))
    return ffmpeg.stdout
  }

  async download(videoId: string, options: DownloadOptions = {}): Promise<void> {
    const format = options.format ?? 'opus'
    const codec = format === 'm4a' ? 'mp4a' : 'opus'

    const [stream, song] = await Promise.all([
      this.resolver.resolve(videoId, { codec } as any),
      options._mockSong
        ? Promise.resolve(options._mockSong)
        : this.discovery.getInfo(videoId),
    ])

    const filename = `${sanitize(song.title)} (${sanitize(song.artist)}).${format}`
    const dest = join(options.path ?? '.', filename)

    if (options._mockReadStream) {
      const writeStream = createWriteStream(dest)
      return this.readWithProgress(options._mockReadStream, writeStream as any, stream.sizeBytes, options.onProgress)
    }

    const { mkdir } = await import('node:fs/promises')
    await mkdir(options.path ?? '.', { recursive: true })

    const writeStream = createWriteStream(dest)

    try {
      await this.fetchAndWrite(stream.url, writeStream, stream.sizeBytes, options.onProgress)
    } catch (err: any) {
      writeStream.destroy()
      // If the direct URL fails (e.g. 403 / PO token), fall back to yt-dlp
      if (err.message?.includes('403') || err.message?.includes('audio fetch failed')) {
        const { unlink } = await import('node:fs/promises')
        await unlink(dest).catch(() => {})
        await ytdlpDownload(videoId, dest, format, this.cookiesPath)
      } else {
        throw err
      }
    }
  }

  private async fetchAndWrite(
    url: string,
    writeStream: ReturnType<typeof createWriteStream>,
    totalBytes?: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: audio fetch failed`)
    }

    const { Readable } = await import('node:stream')
    const readable = Readable.fromWeb(response.body as any)

    return new Promise<void>((resolve, reject) => {
      let downloaded = 0
      // Register writeStream error listener immediately — not inside 'end',
      // so errors that occur before the stream ends (e.g. ENOENT) are caught.
      writeStream.on('error', (err) => { writeStream.destroy(); reject(err) })
      readable.on('data', (chunk: Buffer) => {
        writeStream.write(chunk)
        downloaded += chunk.length
        if (onProgress && totalBytes) {
          onProgress(Math.round((downloaded / totalBytes) * 100))
        }
      })
      readable.on('error', (err) => { writeStream.destroy(); reject(err) })
      readable.on('end', () => {
        writeStream.end()
        writeStream.once('finish', resolve)
      })
    })
  }

  private readWithProgress(
    readable: NodeJS.ReadableStream,
    writeStream: { on: (e: string, cb: Function) => void },
    totalBytes?: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let downloaded = 0

      readable.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (onProgress && totalBytes) {
          onProgress(Math.round((downloaded / totalBytes) * 100))
        }
      })

      readable.on('error', reject)
      readable.on('end', resolve)
      ;(readable as any).pipe?.(writeStream)
    })
  }
}
