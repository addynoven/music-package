import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PodcastClient } from '../../../src/podcast'

// Minimal but realistic RSS fixture covering all fields we care about
const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <description>A podcast about testing</description>
    <link>https://example.com</link>
    <language>en-us</language>
    <itunes:author>Test Author</itunes:author>
    <itunes:image href="https://example.com/cover.jpg"/>
    <item>
      <title>Episode 1</title>
      <description>First episode description</description>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="12345678"/>
      <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
      <guid>ep-001</guid>
      <itunes:duration>1:02:30</itunes:duration>
      <itunes:episode>1</itunes:episode>
      <itunes:season>1</itunes:season>
      <itunes:explicit>yes</itunes:explicit>
    </item>
    <item>
      <title>Episode 2</title>
      <description>Second episode</description>
      <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" length="9876543"/>
      <pubDate>Mon, 08 Jan 2024 00:00:00 +0000</pubDate>
      <guid>ep-002</guid>
      <itunes:duration>45:00</itunes:duration>
      <itunes:image href="https://example.com/ep2-art.jpg"/>
      <itunes:explicit>no</itunes:explicit>
    </item>
    <item>
      <title>Blog post (no audio)</title>
      <description>This item has no enclosure and should be filtered out</description>
      <pubDate>Mon, 15 Jan 2024 00:00:00 +0000</pubDate>
      <guid>not-an-episode</guid>
    </item>
  </channel>
</rss>`

describe('PodcastClient.parse()', () => {
  let client: PodcastClient

  beforeEach(() => { client = new PodcastClient() })

  it('maps channel-level metadata', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.type).toBe('podcast')
    expect(pod.title).toBe('Test Podcast')
    expect(pod.description).toBe('A podcast about testing')
    expect(pod.author).toBe('Test Author')
    expect(pod.language).toBe('en-us')
    expect(pod.link).toBe('https://example.com')
    expect(pod.feedUrl).toBe('https://example.com/feed.rss')
  })

  it('extracts feed-level thumbnail from itunes:image', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.thumbnails[0].url).toBe('https://example.com/cover.jpg')
  })

  it('filters out items without an audio enclosure', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes).toHaveLength(2)
  })

  it('maps episode core fields', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    const ep = pod.episodes[0]
    expect(ep.type).toBe('episode')
    expect(ep.title).toBe('Episode 1')
    expect(ep.description).toBe('First episode description')
    expect(ep.url).toBe('https://example.com/ep1.mp3')
    expect(ep.mimeType).toBe('audio/mpeg')
    expect(ep.guid).toBe('ep-001')
    expect(ep.explicit).toBe(true)
  })

  it('parses duration in HH:MM:SS format to seconds', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[0].duration).toBe(3750) // 1h 2m 30s
  })

  it('parses duration in MM:SS format to seconds', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[1].duration).toBe(2700) // 45m
  })

  it('maps season and episode numbers', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[0].season).toBe(1)
    expect(pod.episodes[0].episode).toBe(1)
  })

  it('maps explicit flag — no means false', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[1].explicit).toBe(false)
  })

  it('uses episode-level itunes:image when present', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[1].thumbnails[0].url).toBe('https://example.com/ep2-art.jpg')
  })

  it('falls back to feed image for episodes without their own art', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[0].thumbnails[0].url).toBe('https://example.com/cover.jpg')
  })

  it('converts pubDate to ISO 8601', async () => {
    const pod = await client.parse(FEED_XML, 'https://example.com/feed.rss')
    expect(pod.episodes[0].publishedAt).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('PodcastClient.getFeed()', () => {
  let client: PodcastClient

  beforeEach(() => {
    vi.restoreAllMocks()
    client = new PodcastClient()
  })

  it('fetches the URL and returns a parsed Podcast', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(FEED_XML, { status: 200 })
    )
    const pod = await client.getFeed('https://example.com/feed.rss')
    expect(pod.title).toBe('Test Podcast')
    expect(pod.episodes).toHaveLength(2)
  })

  it('throws NetworkError on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 })
    )
    await expect(client.getFeed('https://example.com/bad.rss')).rejects.toThrow('404')
  })
})
