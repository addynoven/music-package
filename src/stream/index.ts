import { execFile } from 'node:child_process'
import { Cache } from '../cache'
import { StreamError } from '../errors'
import type { StreamingData, Quality } from '../models'
import { resolveViaInnertube } from './innertube-resolver'
import { tryClients, STREAM_CLIENT_FALLBACK_ORDER } from './multi-client'
import type { StreamClient } from './multi-client'
import type { InnertubePool } from './innertube-pool'

function parseExpiry(url: string): number {
  try {
    return parseInt(new URL(url).searchParams.get('expire') ?? '0', 10)
  } catch {
    return 0
  }
}

function ytdlpResolve(videoId: string, quality: Quality, cookiesPath?: string, proxy?: string): Promise<StreamingData> {
  return new Promise((resolve, reject) => {
    const formatSelector = quality === 'low' ? 'worstaudio' : 'bestaudio'
    const cookiesArgs = cookiesPath ? ['--cookies', cookiesPath] : []
    const proxyArgs = proxy ? ['--proxy', proxy] : []
    execFile('yt-dlp', [
      '--no-playlist',
      ...cookiesArgs,
      ...proxyArgs,
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
        const mimeType = codec === 'opus' ? 'audio/webm; codecs=opus' : 'audio/mp4'
        const bitrateKbps: number = json.abr ?? json.tbr ?? 0
        const sizeBytes: number | undefined = json.filesize ?? json.filesize_approx ?? undefined
        resolve({
          url,
          codec,
          mimeType,
          bitrate: Math.round(bitrateKbps * 1000),
          expiresAt: parseExpiry(url),
          ...(sizeBytes != null && { sizeBytes }),
          _meta: { title: json.title ?? '', artist: json.artist ?? json.uploader ?? '' },
        } as any)
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
    private readonly proxy?: string,
    private readonly pool?: InnertubePool,
    private readonly onFallback?: (videoId: string, reason: string) => void,
  ) {}

  /**
   * Resolves a stream URL.
   *
   * Chain (each step short-circuits on success):
   *   1. SQLite cache (~6h TTL) — `cache.get` then `isUrlExpired` check
   *   2. InnerTube fast-path via `tryClients` walking `STREAM_CLIENT_FALLBACK_ORDER`.
   *      Each client is fetched from the pool then passed to `resolveViaInnertube`.
   *      Skipped if no InnertubePool was provided.
   *   3. yt-dlp shell-out — universal fallback (~2-3s). Used when (2) is
   *      unavailable or all clients failed, or for tracks that genuinely can't
   *      be played from InnerTube (geo-blocked, age-restricted, etc.).
   */
  async resolve(videoId: string, quality: Quality | { codec?: string; quality?: Quality } = 'high'): Promise<StreamingData> {
    const raw: string = typeof quality === 'string' ? quality : (quality.quality ?? 'high')
    const q: Quality = raw === 'low' ? 'low' : 'high'
    const cacheKey = `stream:${videoId}:${q}`

    const cached = this.cache.get<StreamingData>(cacheKey)
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached
    }

    let data: StreamingData | undefined

    if (this.pool) {
      // Collect per-client errors locally so we can surface the last one to
      // onFallback when all clients fail (tryClients returns null in that case
      // and does not expose the accumulated errors to callers).
      const clientErrors: { client: StreamClient; error: Error }[] = []

      const tried = await tryClients(
        STREAM_CLIENT_FALLBACK_ORDER,
        async (client) => {
          try {
            const yt = await this.pool!.get(client)
            const result = await resolveViaInnertube(yt, videoId, { quality: q, client })
            return result.stream
          } catch (err) {
            clientErrors.push({
              client,
              error: err instanceof Error ? err : new Error(String(err)),
            })
            // Re-throw so tryClients also records it and moves to the next client
            throw err
          }
        },
      )

      if (tried !== null) {
        data = tried.result
      } else {
        // All clients failed — fire onFallback once with the most informative error.
        if (this.onFallback) {
          const last = clientErrors[clientErrors.length - 1]
          const reason = last
            ? `${last.client}: ${last.error.message}`
            : 'All InnerTube clients failed'
          this.onFallback(videoId, reason)
        }
      }
    }

    if (!data) {
      data = await ytdlpResolve(videoId, q, this.cookiesPath, this.proxy)
    }

    this.cache.set(cacheKey, data, Cache.TTL.STREAM)
    return data
  }
}
