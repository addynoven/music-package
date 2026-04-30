import type { Innertube } from 'youtubei.js'
import { StreamError } from '../errors'
import type { StreamingData, Quality } from '../models'
import type { StreamClient } from './multi-client'

export interface InnertubeResolveOptions {
  quality?: Quality
  client?: StreamClient
}

export interface InnertubeResolveResult {
  stream: StreamingData
  videoType: string | null
  isPrivateTrack: boolean
  clientUsed: StreamClient
}

const PRIVATE_TRACK = 'MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK'

function parseExpiry(url: string): number {
  try {
    return parseInt(new URL(url).searchParams.get('expire') ?? '0', 10)
  } catch {
    return 0
  }
}

function buildStreamingData(url: string, format: any): StreamingData {
  const mime: string = format.mime_type ?? ''
  const codec: 'opus' | 'mp4a' = mime.includes('opus') ? 'opus' : 'mp4a'
  const data: StreamingData = {
    url,
    codec,
    mimeType: mime || (codec === 'opus' ? 'audio/webm; codecs=opus' : 'audio/mp4'),
    bitrate: typeof format.bitrate === 'number' ? format.bitrate : 0,
    expiresAt: parseExpiry(url),
  }
  if (typeof format.loudness_db === 'number') data.loudnessDb = format.loudness_db
  if (typeof format.content_length === 'number') data.sizeBytes = format.content_length
  else if (typeof format.content_length === 'string') {
    const n = parseInt(format.content_length, 10)
    if (!Number.isNaN(n)) data.sizeBytes = n
  }
  return data
}

/**
 * Resolves a stream URL via InnerTube — the fast path. Returns in <500ms typical
 * vs 2-3s for the yt-dlp shell-out.
 *
 * Reads `videoDetails.musicVideoType` from the raw player response (youtubei.js
 * doesn't surface it as a typed field). `MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK`
 * indicates a user-uploaded library track; the caller should skip HEAD validation
 * for those because their CDN URLs 403 on unauthenticated HEAD requests.
 *
 * The function is permissive: chooseFormat is tried with `format: 'opus'` first,
 * then `format: 'mp4a'`. If both throw, a typed StreamError is raised so the
 * caller can fall back (typically to yt-dlp).
 */
export async function resolveViaInnertube(
  yt: Innertube,
  videoId: string,
  options?: InnertubeResolveOptions,
): Promise<InnertubeResolveResult> {
  const clientUsed: StreamClient = options?.client ?? 'YTMUSIC'
  const qualityHint = options?.quality === 'low' ? 'medium' : 'best'

  let info: any
  try {
    info = await yt.music.getInfo(videoId)
  } catch (err) {
    throw new StreamError(`InnerTube getInfo failed: ${(err as Error).message}`, videoId)
  }

  const playerResponse = info?.page?.[0]
  const videoDetails = playerResponse?.videoDetails
  const videoType: string | null = typeof videoDetails?.musicVideoType === 'string'
    ? videoDetails.musicVideoType
    : null
  const isPrivateTrack = videoType === PRIVATE_TRACK

  let format: any
  try {
    format = info.chooseFormat({ type: 'audio', quality: qualityHint, format: 'opus' })
  } catch {
    try {
      format = info.chooseFormat({ type: 'audio', quality: qualityHint, format: 'mp4a' })
    } catch (err) {
      throw new StreamError(
        `chooseFormat failed for both opus and mp4a: ${(err as Error).message}`,
        videoId,
      )
    }
  }

  if (!format) {
    throw new StreamError('chooseFormat returned no format', videoId)
  }

  let url: string
  try {
    const player = (yt as any)?.session?.player
    url = await format.decipher(player)
  } catch (err) {
    throw new StreamError(`format.decipher failed: ${(err as Error).message}`, videoId)
  }

  if (!url) {
    throw new StreamError('decipher returned empty url', videoId)
  }

  const stream = buildStreamingData(url, format)
  return { stream, videoType, isPrivateTrack, clientUsed }
}
