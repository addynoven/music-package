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

function parseCodec(mimeType: string): 'opus' | 'mp4a' {
  return mimeType.includes('opus') ? 'opus' : 'mp4a'
}

function parseExpiry(url: string): number {
  try {
    return parseInt(new URL(url).searchParams.get('expire') ?? '0', 10)
  } catch {
    return 0
  }
}

export class StreamResolver {
  constructor(
    private readonly cache: Cache,
    private readonly yt: Innertube,
  ) {
    patchEvalIfNeeded()
  }

  async resolve(videoId: string, quality: Quality | { codec?: string; quality?: Quality } = 'high'): Promise<StreamingData> {
    const q: Quality = typeof quality === 'string' ? quality : (quality.quality ?? 'high')
    const cacheKey = `stream:${videoId}:${q}`

    const cached = this.cache.get<StreamingData>(cacheKey)
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached
    }

    const info = await this.yt.music.getInfo(videoId)
    const formats = info.streaming_data?.adaptive_formats ?? []
    const audioFmts = formats.filter((f: any) => f.has_audio && !f.has_video)

    if (!audioFmts.length) {
      throw new Error(`No audio formats found for videoId: ${videoId}`)
    }

    const fmt = q === 'high'
      ? audioFmts.sort((a: any, b: any) => b.bitrate - a.bitrate)[0]
      : audioFmts.sort((a: any, b: any) => a.bitrate - b.bitrate)[0]

    const url = await (fmt as any).decipher((this.yt as any).session.player)

    const data: StreamingData = {
      url,
      codec: parseCodec((fmt as any).mime_type ?? ''),
      bitrate: (fmt as any).bitrate ?? 0,
      expiresAt: parseExpiry(url),
      ...((fmt as any).loudness_db !== undefined && { loudnessDb: (fmt as any).loudness_db }),
      ...((fmt as any).content_length !== undefined && { sizeBytes: parseInt((fmt as any).content_length, 10) }),
    }

    this.cache.set(cacheKey, data, Cache.TTL.STREAM)
    return data
  }
}
