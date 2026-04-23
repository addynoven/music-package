import { execFile } from 'node:child_process'
import type { Innertube } from 'youtubei.js'
import { Platform } from 'youtubei.js/agnostic'
import { Cache } from '../cache'
import type { StreamingData, Quality } from '../models'

function patchEvalIfNeeded() {
  try {
    const shim = Platform.shim
    if (shim && typeof shim.eval === 'function') {
      Platform.load({
        ...shim,
        eval: (data: any, env: any) => {
          const fn = new Function(...Object.keys(env), (data as any).output ?? data)
          return fn(...Object.values(env))
        },
      })
    }
  } catch {
    // platform not loaded yet — no-op
  }
}

function parseExpiry(url: string): number {
  try {
    return parseInt(new URL(url).searchParams.get('expire') ?? '0', 10)
  } catch {
    return 0
  }
}

function ytdlpResolve(videoId: string, quality: Quality): Promise<StreamingData> {
  return new Promise((resolve, reject) => {
    const formatSelector = quality === 'low' ? 'worstaudio' : 'bestaudio'
    execFile('yt-dlp', [
      '--no-playlist',
      '--dump-json',
      '-f', formatSelector,
      `https://music.youtube.com/watch?v=${videoId}`,
    ], (err, stdout) => {
      if (err) {
        reject(new Error(`yt-dlp failed: ${((err as any).stderr ?? String(err)).slice(0, 200)}`))
        return
      }
      try {
        const json = JSON.parse(stdout)
        const url: string = json.url
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
        reject(new Error(`Failed to parse yt-dlp output: ${parseErr}`))
      }
    })
  })
}

export class StreamResolver {
  constructor(
    private readonly cache: Cache,
    readonly yt: Innertube,
  ) {
    patchEvalIfNeeded()
  }

  async resolve(videoId: string, quality: Quality | { codec?: string; quality?: Quality } = 'high'): Promise<StreamingData> {
    const raw: string = typeof quality === 'string' ? quality : (quality.quality ?? 'high')
    const q: Quality = raw === 'low' ? 'low' : 'high'
    const cacheKey = `stream:${videoId}:${q}`

    const cached = this.cache.get<StreamingData>(cacheKey)
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached
    }

    const data = await ytdlpResolve(videoId, q)

    this.cache.set(cacheKey, data, Cache.TTL.STREAM)
    return data
  }
}
