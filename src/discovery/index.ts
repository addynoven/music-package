import type { Innertube } from 'youtubei.js'
import type { Song, Album, Artist, Section, SearchResults, SearchFilter, Thumbnail } from '../models'

function mapThumbnails(item: any): Thumbnail[] {
  return (item?.thumbnail?.contents ?? item?.thumbnails ?? []).map((t: any) => ({
    url: t.url ?? '',
    width: t.width ?? 0,
    height: t.height ?? 0,
  }))
}

function mapSongItem(item: any): Song {
  const artist = item.artists?.[0]?.name ?? item.author?.name ?? 'Unknown Artist'
  return {
    type: 'song',
    videoId: item.id ?? '',
    title: item.title ?? 'Unknown',
    artist,
    duration: item.duration?.seconds ?? 0,
    thumbnails: mapThumbnails(item),
  }
}

function mapAlbumItem(item: any): Album {
  const artist = item.artists?.[0]?.name ?? item.author?.name ?? 'Unknown Artist'
  return {
    type: 'album',
    browseId: item.id ?? item.endpoint?.payload?.browseId ?? '',
    title: item.title ?? item.name ?? 'Unknown',
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
    name: item.name ?? item.title ?? 'Unknown',
    thumbnails: mapThumbnails(item),
    songs: [],
    albums: [],
    singles: [],
  }
}

function flatContents(res: any): any[] {
  return (res?.contents ?? []).flatMap((section: any) => section?.contents ?? [])
}

export class DiscoveryClient {
  constructor(private readonly yt: Innertube) {}

  async autocomplete(query: string): Promise<string[]> {
    const res = await this.yt.music.getSearchSuggestions(query) as any[]
    return res.flatMap((section: any) =>
      (section.contents ?? [])
        .map((c: any) => c.suggestion?.text ?? c.query?.text)
        .filter(Boolean)
    )
  }

  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[] | Album[] | Artist[]> {
    const typeMap: Record<SearchFilter, string> = {
      songs: 'song', albums: 'album', artists: 'artist', playlists: 'playlist',
    }

    if (options?.filter) {
      const res = await this.yt.music.search(query, { type: typeMap[options.filter] as any })
      const items = flatContents(res)

      if (options.filter === 'songs') return items.map(mapSongItem)
      if (options.filter === 'albums') return items.map(mapAlbumItem)
      if (options.filter === 'artists') return items.map(mapArtistItem)
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
    return (res?.sections ?? res?.contents ?? []).map((s: any) => ({
      title: s.title?.text ?? s.header?.title?.text ?? '',
      items: (s.contents ?? []).map(mapSongItem),
    }))
  }

  async getArtist(channelId: string): Promise<Artist> {
    const res = await this.yt.music.getArtist(channelId) as any
    if (!res) throw new Error(`Artist not found: ${channelId}`)

    const name = res.header?.title?.text ?? 'Unknown'
    const songs: Song[] = []
    const albums: Album[] = []
    const singles: Album[] = []

    for (const section of res.sections ?? []) {
      const contents = section.contents ?? []
      const title = (section.title?.text ?? section.header?.title?.text ?? '').toLowerCase()
      if (title.includes('song')) songs.push(...contents.map(mapSongItem))
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

    const tracks = (res.contents ?? []).map((t: any): Song => ({
      type: 'song',
      videoId: t.id ?? '',
      title: t.title ?? 'Unknown',
      artist: t.artists?.[0]?.name ?? 'Unknown Artist',
      duration: t.duration?.seconds ?? 0,
      thumbnails: mapThumbnails(res.header),
    }))

    return {
      type: 'album',
      browseId,
      title: res.header?.title?.text ?? 'Unknown',
      artist: res.header?.subtitle?.runs?.[2]?.text ?? 'Unknown Artist',
      year: res.header?.subtitle?.runs?.[4]?.text,
      thumbnails: mapThumbnails(res.header),
      tracks,
    }
  }

  async getRadio(videoId: string): Promise<Song[]> {
    const res = await this.yt.music.getUpNext(videoId) as any
    return (res?.contents ?? []).map(mapSongItem)
  }

  async getRelated(videoId: string): Promise<Song[]> {
    const res = await this.yt.music.getRelated(videoId) as any
    return (res?.contents ?? []).flatMap((s: any) => s.contents ?? []).map(mapSongItem)
  }

  async getCharts(options?: { country?: string }): Promise<Section[]> {
    const res = await (this.yt.music as any).getExplore?.(options) ?? { sections: [] }
    return (res.sections ?? []).map((s: any) => ({
      title: s.title?.text ?? '',
      items: (s.contents ?? []).map(mapSongItem),
    }))
  }
}
