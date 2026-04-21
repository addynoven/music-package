import type { Innertube } from 'youtubei.js'
import type { Song, Album, Artist, Playlist, Section, SearchResults, SearchFilter, Thumbnail } from '../models'

function extractText(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value.text === 'string') return value.text
  if (typeof value.toString === 'function') {
    const s = value.toString()
    if (s !== '[object Object]') return s
  }
  return ''
}

function mapThumbnails(item: any): Thumbnail[] {
  return (item?.thumbnail?.contents ?? item?.thumbnails ?? []).map((t: any) => ({
    url: t.url ?? '',
    width: t.width ?? 0,
    height: t.height ?? 0,
  }))
}

function mapSongItem(item: any): Song {
  const artist = extractText(item.artists?.[0]?.name) ||
    extractText(item.authors?.[0]?.name) ||
    extractText(item.author?.name) ||
    extractText(item.author) ||  // PlaylistPanelVideo.author is a plain string
    'Unknown Artist'
  return {
    type: 'song',
    videoId: item.video_id ?? item.id ?? '',  // PlaylistPanelVideo uses video_id
    title: extractText(item.title) || 'Unknown',
    artist,
    duration: item.duration?.seconds ?? 0,
    thumbnails: mapThumbnails(item),
  }
}

function mapAlbumItem(item: any): Album {
  const artist = extractText(item.artists?.[0]?.name) || extractText(item.author?.name) || 'Unknown Artist'
  return {
    type: 'album',
    browseId: item.id ?? item.endpoint?.payload?.browseId ?? '',
    title: extractText(item.title) || extractText(item.name) || 'Unknown',
    artist,
    year: item.year,
    thumbnails: mapThumbnails(item),
    tracks: [],
  }
}

function mapArtistItem(item: any): Artist {
  return {
    type: 'artist',
    channelId: item.id ?? item.channel_id ?? '',
    name: extractText(item.name) || extractText(item.title) || 'Unknown',
    thumbnails: mapThumbnails(item),
    songs: [],
    albums: [],
    singles: [],
  }
}

function mapPlaylistItem(item: any): Playlist {
  return {
    type: 'playlist',
    playlistId: item.id ?? '',
    title: extractText(item.title) || 'Unknown',
    thumbnails: mapThumbnails(item),
  }
}

function flatContents(res: any): any[] {
  return (res?.contents ?? []).flatMap((section: any) => section?.contents ?? [])
}

function isEmptySection(title: string, items: any[]): boolean {
  return title === '' && items.length === 0
}

function parseAlbumSubtitle(runs: any[]): { artist: string; year?: string } {
  const YEAR_RE = /^\d{4}$/
  const SKIP = new Set(['album', 'single', 'ep', 'playlist', 'compilation', ' • ', '•'])
  const texts = (runs ?? []).map((r: any) => extractText(r)).filter((t: string) => t && t.trim() !== '' && !SKIP.has(t.toLowerCase().trim()))
  const year = texts.find((t: string) => YEAR_RE.test(t.trim()))
  const artist = texts.find((t: string) => !YEAR_RE.test(t.trim()))
  return { artist: artist ?? 'Unknown Artist', year }
}

export class DiscoveryClient {
  constructor(private readonly yt: Innertube) {}

  async getInfo(videoId: string): Promise<Song> {
    const info = await this.yt.music.getInfo(videoId) as any
    const basic = info?.basic_info ?? {}
    return {
      type: 'song',
      videoId,
      title: extractText(basic.title) || 'Unknown',
      artist: extractText(basic.author) || 'Unknown Artist',
      album: extractText(basic.album?.name) || undefined,
      duration: basic.duration ?? 0,
      thumbnails: (basic.thumbnail ?? []).map((t: any) => ({
        url: t.url ?? '',
        width: t.width ?? 0,
        height: t.height ?? 0,
      })),
    }
  }

  async autocomplete(query: string): Promise<string[]> {
    const res = await this.yt.music.getSearchSuggestions(query) as any[]
    return res.flatMap((section: any) =>
      (section.contents ?? [])
        .map((c: any) => c.suggestion?.text ?? c.query?.text)
        .filter(Boolean)
    )
  }

  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]> {
    const typeMap: Record<SearchFilter, string> = {
      songs: 'song', albums: 'album', artists: 'artist', playlists: 'playlist',
    }

    if (options?.filter) {
      const res = await this.yt.music.search(query, { type: typeMap[options.filter] as any })
      const items = flatContents(res)

      if (options.filter === 'songs') return items.map(mapSongItem)
      if (options.filter === 'albums') return items.map(mapAlbumItem)
      if (options.filter === 'artists') return items.map(mapArtistItem)
      if (options.filter === 'playlists') return items.map(mapPlaylistItem)
      return []
    }

    const res = await this.yt.music.search(query) as any
    const all = flatContents(res)

    return {
      songs: all.filter((i: any) => i.item_type === 'song' || i.duration?.seconds).map(mapSongItem),
      albums: all.filter((i: any) => i.item_type === 'album').map(mapAlbumItem),
      artists: all.filter((i: any) => i.item_type === 'artist').map(mapArtistItem),
      playlists: [],
    }
  }

  async getHome(): Promise<Section[]> {
    const res = await this.yt.music.getHomeFeed() as any
    return (res?.sections ?? res?.contents ?? [])
      .map((s: any) => ({
        title: extractText(s.title) || extractText(s.header?.title) || '',
        items: (s.contents ?? []).map(mapSongItem),
      }))
      .filter((s: Section) => !isEmptySection(s.title, s.items))
  }

  async getArtist(channelId: string): Promise<Artist> {
    const res = await this.yt.music.getArtist(channelId) as any
    if (!res) throw new Error(`Artist not found: ${channelId}`)

    const name = extractText(res.header?.title) || 'Unknown'
    const songs: Song[] = []
    const albums: Album[] = []
    const singles: Album[] = []

    for (const section of res.sections ?? []) {
      const contents = section.contents ?? []
      const title = (extractText(section.title) || extractText(section.header?.title) || '').toLowerCase()
      if (title.includes('song')) songs.push(...contents.map((item: any) => {
        const song = mapSongItem(item)
        return song.artist === 'Unknown Artist' ? { ...song, artist: name } : song
      }))
      else if (title.includes('single')) singles.push(...contents.map(mapAlbumItem))
      else if (title.includes('album') || title.includes('release')) albums.push(...contents.map(mapAlbumItem))
    }

    return {
      type: 'artist',
      channelId,
      name,
      thumbnails: mapThumbnails(res.header),
      songs,
      albums,
      singles,
    }
  }

  async getAlbum(browseId: string): Promise<Album> {
    const res = await this.yt.music.getAlbum(browseId) as any
    if (!res) throw new Error(`Album not found: ${browseId}`)

    const header = res.header
    // MusicDetailHeader exposes .year and .author directly — prefer those over subtitle parsing
    const year: string | undefined = header?.year || parseAlbumSubtitle(header?.subtitle?.runs).year || undefined
    const artist = extractText(header?.author?.name) ||
      extractText(header?.strapline_text_one) ||
      parseAlbumSubtitle(header?.subtitle?.runs).artist

    const tracks = (res.contents ?? []).map((t: any): Song => {
      const trackArtist = extractText(t.artists?.[0]?.name) || extractText(t.authors?.[0]?.name)
      return {
        type: 'song',
        videoId: t.video_id ?? t.id ?? '',
        title: extractText(t.title) || 'Unknown',
        artist: trackArtist || artist,
        duration: t.duration?.seconds ?? 0,
        thumbnails: mapThumbnails(header),
      }
    })

    return {
      type: 'album',
      browseId,
      title: extractText(header?.title) || 'Unknown',
      artist,
      year,
      thumbnails: mapThumbnails(header),
      tracks,
    }
  }

  async getRadio(videoId: string): Promise<Song[]> {
    const res = await this.yt.music.getUpNext(videoId) as any
    return (res?.contents ?? [])
      .map((item: any) => item.primary ?? item)  // unwrap PlaylistPanelVideoWrapper
      .filter((item: any) => item?.video_id || item?.id)
      .map(mapSongItem)
  }

  async getRelated(videoId: string): Promise<Song[]> {
    const res = await this.yt.music.getRelated(videoId) as any
    return (res?.contents ?? []).flatMap((s: any) => s.contents ?? []).map(mapSongItem)
  }

  async getCharts(options?: { country?: string }): Promise<Section[]> {
    const res = await (this.yt.music as any).getExplore?.(options) ?? { sections: [] }
    return (res.sections ?? res.contents ?? [])
      .map((s: any) => ({
        title: extractText(s.title) || extractText(s.header?.title) || '',
        items: (s.contents ?? []).flatMap((item: any) => {
          if (item.contents) return item.contents.map(mapSongItem)
          return [mapSongItem(item)]
        }),
      }))
      .filter((s: Section) => !isEmptySection(s.title, s.items))
  }
}
