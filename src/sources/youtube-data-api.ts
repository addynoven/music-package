import { NotFoundError, NetworkError } from '../errors'
import type { AudioSource } from './audio-source'
import type { Song, StreamingData, SearchResults, SearchFilter, Thumbnail } from '../models'
import type { StreamResolver } from '../stream'

const YT_API = 'https://www.googleapis.com/youtube/v3'

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')
}

function mapThumbnails(thumbs: Record<string, { url: string; width: number; height: number }>): Thumbnail[] {
  return Object.values(thumbs).map(t => ({ url: t.url, width: t.width, height: t.height }))
}

// YouTube Music auto-generates "<Artist> - Topic" channels for label uploads —
// these are the most trustworthy artist signal the Data API exposes.
const TOPIC_SUFFIX = / - Topic$/
const TITLE_NOISE = /\s*[\(\[【][^\)\]】]*(official|video|audio|lyrics?|explicit|instrumental|hq|hd|4k|live|cover|remix|remaster|m\/?v|visualizer)[^\)\]】]*[\)\]】]/gi

function extractArtistTitle(rawTitle: string, channelTitle: string): { title: string; artist: string } {
  const cleanTitle = rawTitle.replace(TITLE_NOISE, '').trim()

  if (TOPIC_SUFFIX.test(channelTitle)) {
    return { artist: channelTitle.replace(TOPIC_SUFFIX, '').trim(), title: cleanTitle }
  }

  const dash = cleanTitle.indexOf(' - ')
  if (dash !== -1) {
    return {
      artist: cleanTitle.slice(0, dash).trim(),
      title: cleanTitle.slice(dash + 3).trim(),
    }
  }

  return { title: cleanTitle, artist: channelTitle.trim() }
}

async function ytFetch<T>(url: URL): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new NetworkError(`YouTube Data API error ${res.status}: ${body.slice(0, 200)}`, res.status)
  }
  return res.json() as Promise<T>
}

interface YTSearchItem {
  id: { kind: string; videoId?: string }
  snippet: {
    title: string
    channelTitle: string
    thumbnails: Record<string, { url: string; width: number; height: number }>
  }
}

interface YTVideoItem {
  id: string
  snippet: {
    title: string
    channelTitle: string
    thumbnails: Record<string, { url: string; width: number; height: number }>
  }
  contentDetails: { duration: string }
}

export class YouTubeDataAPISource implements AudioSource {
  readonly name = 'youtube-data-api'

  constructor(
    private readonly apiKey: string,
    private readonly resolver: StreamResolver,
  ) {}

  canHandle(_query: string): boolean {
    return true
  }

  async search(
    query: string,
    options: { filter?: SearchFilter; limit?: number } = {},
  ): Promise<SearchResults | Song[]> {
    // Data API only handles video search — return empty for non-song filters
    if (options.filter && options.filter !== 'songs') return []

    const maxResults = Math.min(options.limit ?? 10, 50)

    const searchUrl = new URL(`${YT_API}/search`)
    searchUrl.searchParams.set('part', 'snippet')
    searchUrl.searchParams.set('q', query)
    searchUrl.searchParams.set('type', 'video')
    searchUrl.searchParams.set('videoCategoryId', '10') // 10 = YouTube "Music" category
    searchUrl.searchParams.set('maxResults', String(maxResults))
    searchUrl.searchParams.set('key', this.apiKey)

    const searchData = await ytFetch<{ items: YTSearchItem[] }>(searchUrl)

    const videoIds = searchData.items
      .filter(item => item.id?.videoId)
      .map(item => item.id.videoId!)

    if (videoIds.length === 0) {
      return options.filter === 'songs' ? [] : { songs: [], albums: [], artists: [], playlists: [] }
    }

    // Batch fetch for duration — only 1 quota unit for up to 50 IDs
    const videosUrl = new URL(`${YT_API}/videos`)
    videosUrl.searchParams.set('part', 'snippet,contentDetails')
    videosUrl.searchParams.set('id', videoIds.join(','))
    videosUrl.searchParams.set('key', this.apiKey)

    const videosData = await ytFetch<{ items: YTVideoItem[] }>(videosUrl)

    const detailMap = new Map<string, YTVideoItem>()
    for (const item of videosData.items ?? []) detailMap.set(item.id, item)

    const songs: Song[] = videoIds
      .map(id => {
        const detail = detailMap.get(id)
        if (!detail) return null
        const { title, artist } = extractArtistTitle(detail.snippet.title, detail.snippet.channelTitle)
        return {
          type: 'song' as const,
          videoId: id,
          title,
          artist,
          duration: parseDuration(detail.contentDetails?.duration ?? ''),
          thumbnails: mapThumbnails(detail.snippet.thumbnails ?? {}),
        } satisfies Song
      })
      .filter((s): s is Song => s !== null)

    return options.filter === 'songs' ? songs : { songs, albums: [], artists: [], playlists: [] }
  }

  async getMetadata(id: string): Promise<Song> {
    const url = new URL(`${YT_API}/videos`)
    url.searchParams.set('part', 'snippet,contentDetails')
    url.searchParams.set('id', id)
    url.searchParams.set('key', this.apiKey)

    const data = await ytFetch<{ items: YTVideoItem[] }>(url)
    const item = data.items?.[0]
    if (!item) throw new NotFoundError(`Video not found: ${id}`, id)

    const { title, artist } = extractArtistTitle(item.snippet.title, item.snippet.channelTitle)
    return {
      type: 'song',
      videoId: id,
      title,
      artist,
      duration: parseDuration(item.contentDetails?.duration ?? ''),
      thumbnails: mapThumbnails(item.snippet.thumbnails ?? {}),
    }
  }

  async getStream(id: string, quality: 'high' | 'low' = 'high'): Promise<StreamingData> {
    return this.resolver.resolve(id, quality)
  }
}
