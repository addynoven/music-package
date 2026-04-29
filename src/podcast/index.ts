import Parser from 'rss-parser'
import type { Podcast, PodcastEpisode, Thumbnail } from '../models'
import { NetworkError } from '../errors'

type CustomFeed = {
  author?: string
  image?: { $: { href: string } } | string
  language?: string
}

type CustomItem = {
  duration?: string
  episode?: string
  season?: string
  episodeImage?: { $: { href: string } } | string
  explicit?: string
}

const parser = new Parser<CustomFeed, CustomItem>({
  customFields: {
    feed: [
      ['itunes:author', 'author'],
      ['itunes:image', 'image'],
    ] as any,
    item: [
      ['itunes:duration', 'duration'],
      ['itunes:episode', 'episode'],
      ['itunes:season', 'season'],
      ['itunes:image', 'episodeImage'],
      ['itunes:explicit', 'explicit'],
    ] as any,
  },
})

export class PodcastClient {
  async getFeed(url: string): Promise<Podcast> {
    const resp = await fetch(url)
    if (!resp.ok) throw new NetworkError(`RSS fetch failed: ${resp.status}`, resp.status)
    const xml = await resp.text()
    return this.parse(xml, url)
  }

  async parse(xml: string, feedUrl: string): Promise<Podcast> {
    const feed = await parser.parseString(xml)

    const feedImageUrl = extractImageUrl((feed as any).image)
    const feedThumbnails: Thumbnail[] = feedImageUrl
      ? [{ url: feedImageUrl, width: 0, height: 0 }]
      : []

    const episodes: PodcastEpisode[] = (feed.items ?? [])
      .filter(item => !!item.enclosure?.url)
      .map(item => {
        const epImageUrl = extractImageUrl((item as any).episodeImage) ?? feedImageUrl
        const thumbnails: Thumbnail[] = epImageUrl
          ? [{ url: epImageUrl, width: 0, height: 0 }]
          : []

        return {
          type: 'episode' as const,
          guid: item.guid ?? item.link ?? item.enclosure!.url,
          title: item.title ?? 'Untitled',
          description: item.contentSnippet ?? item.content ?? '',
          url: item.enclosure!.url,
          mimeType: item.enclosure?.type ?? 'audio/mpeg',
          duration: parseDuration((item as any).duration),
          publishedAt: item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date().toISOString(),
          thumbnails,
          season: (item as any).season ? parseInt((item as any).season) : undefined,
          episode: (item as any).episode ? parseInt((item as any).episode) : undefined,
          explicit:
            (item as any).explicit === 'yes' || (item as any).explicit === 'true',
        }
      })

    return {
      type: 'podcast',
      feedUrl,
      title: feed.title ?? '',
      description: feed.description ?? '',
      author: (feed as any).author ?? '',
      language: feed.language ?? '',
      link: feed.link ?? '',
      thumbnails: feedThumbnails,
      episodes,
    }
  }
}

function extractImageUrl(image: unknown): string | null {
  if (!image) return null
  if (typeof image === 'string') return image
  if (typeof image === 'object' && image !== null) {
    const obj = image as Record<string, any>
    if (obj.$?.href) return obj.$.href
    if (obj.url) return obj.url
    if (obj.href) return obj.href
  }
  return null
}

function parseDuration(duration?: string): number {
  if (!duration) return 0
  const trimmed = duration.trim()
  const parts = trimmed.split(':').map(Number)
  if (parts.length === 1) return isNaN(parts[0]) ? 0 : parts[0]
  if (parts.length === 2) return (parts[0] * 60) + parts[1]
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
}
