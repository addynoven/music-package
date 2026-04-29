import { execFile } from 'node:child_process'
import { Cache } from '../cache'
import { StreamError } from '../errors'
import type { StreamingData, Quality } from '../models'

function parseExpiry(url: string): number {
  try {
    return parseInt(new URL(url).searchParams.get('expire') ?? '0', 10)
  } catch {
    return 0
  }
}

function ytdlpResolve(videoId: string, quality: Quality, cookiesPath?: string): Promise<StreamingData> {
  return new Promise((resolve, reject) => {
    const formatSelector = quality === 'low' ? 'worstaudio' : 'bestaudio'
    const cookiesArgs = cookiesPath ? ['--cookies', cookiesPath] : []
    execFile('yt-dlp', [
      '--no-playlist',
      ...cookiesArgs,
      '--dump-json',
      '-f', formatSelector,
      `https://music.youtube.com/watch?v=${videoId}`,
    ], (err, stdout) => {
      // yt-dlp exits 1 when no JS runtime is available but still writes valid JSON to stdout.
      // Try stdout first; only hard-fail if it's absent or unparseable.
      try {
        if (!stdout?.trim()) throw new StreamError('no output', videoId)
        const json = JSON.parse(stdout)
        const url: string = json.url
        if (!url) throw new StreamError('no url in output', videoId)
        const acodec: string = json.acodec ?? ''
        const codec: 'opus' | 'mp4a' = acodec.includes('opus') ? 'opus' : 'mp4a'
        const bitrateKbps: number = json.abr ?? json.tbr ?? 0
        const sizeBytes: number | undefined = json.filesize ?? json.filesize_approx ?? undefined
        resolve({
          url,
          codec,
          bitrate: Math.round(bitrateKbps * 1000),
          expiresAt: parseExpiry(url),
          ...(sizeBytes != null && { sizeBytes }),
        })
      } catch (parseErr) {
        reject(new Error(err
          ? `yt-dlp failed: ${((err as any).stderr ?? String(err)).slice(0, 200)}`
          : `Failed to parse yt-dlp output: ${parseErr}`
        ))
      }
    })
  })
}

export class StreamResolver {
  constructor(
    private readonly cache: Cache,
    private readonly cookiesPath?: string,
  ) {}

  async resolve(videoId: string, quality: Quality | { codec?: string; quality?: Quality } = 'high'): Promise<StreamingData> {
    const raw: string = typeof quality === 'string' ? quality : (quality.quality ?? 'high')
    const q: Quality = raw === 'low' ? 'low' : 'high'
    const cacheKey = `stream:${videoId}:${q}`

    const cached = this.cache.get<StreamingData>(cacheKey)
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached
    }

    const data = await ytdlpResolve(videoId, q, this.cookiesPath)

    this.cache.set(cacheKey, data, Cache.TTL.STREAM)
    return data
  }
}
