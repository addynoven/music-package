import { decryptStreamUrl } from './decrypt'
import { DefaultJioSaavnClient } from './client'
import type { JioSaavnClient, RawSong, RawAlbumResult, RawArtistResult, RawPlaylistResult } from './client'
import type { AudioSource } from '../audio-source'
import type { Song, Album, Artist, Playlist, Section, SearchResults, StreamingData, SearchFilter, Thumbnail } from '../../models'

const YOUTUBE_URL_RE = /youtube\.com|youtu\.be/
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const IMAGE_SIZES = ['50x50', '150x150', '500x500']

function keyToTitle(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const BITRATE: Record<'high' | 'low', { suffix: string; bitrate: number }> = {
  high: { suffix: '_320', bitrate: 320_000 },
  low:  { suffix: '_96',  bitrate: 96_000  },
}

// ─── image helpers ────────────────────────────────────────────────────────────

function imageToThumbnails(image: unknown): Thumbnail[] {
  if (!image) return []
  const base = typeof image === 'string'
    ? image
    : Array.isArray(image) ? (image[0] as any)?.link ?? '' : ''
  if (!base) return []
  return IMAGE_SIZES.map(size => {
    const [w, h] = size.split('x').map(Number)
    return {
      url: base.replace(/150x150|50x50/, size).replace(/^http:/, 'https:'),
      width: w,
      height: h,
    }
  })
}

// ─── mappers ──────────────────────────────────────────────────────────────────

function mapSong(raw: RawSong): Song {
  const primaryArtist = raw.more_info?.artistMap?.primary_artists?.[0]?.name
    ?? raw.subtitle
    ?? 'Unknown Artist'
  return {
    type: 'song',
    videoId: `jio:${raw.id}`,
    title: raw.title,
    artist: primaryArtist,
    album: raw.more_info?.album,
    duration: parseInt(raw.more_info?.duration ?? '0', 10),
    thumbnails: imageToThumbnails(raw.image),
  }
}

function mapAlbum(raw: RawAlbumResult): Album {
  const primaryArtist = raw.more_info?.artistMap?.primary_artists?.[0]?.name ?? 'Unknown Artist'
  return {
    type: 'album',
    browseId: `jio:${raw.id}`,
    title: raw.title,
    artist: primaryArtist,
    year: raw.year,
    thumbnails: imageToThumbnails(raw.image),
    tracks: [],
  }
}

function mapArtist(raw: RawArtistResult): Artist {
  return {
    type: 'artist',
    channelId: `jio:${raw.id}`,
    name: raw.name,
    thumbnails: imageToThumbnails(raw.image),
    songs: [],
    albums: [],
    singles: [],
  }
}

function mapPlaylist(raw: RawPlaylistResult): Playlist {
  return {
    type: 'playlist',
    playlistId: `jio:${raw.id}`,
    title: raw.title,
    thumbnails: imageToThumbnails(raw.image),
  }
}

function stripPrefix(id: string): string {
  return id.startsWith('jio:') ? id.slice(4) : id
}

function extractExpiry(url: string): number {
  const match = url.match(/[?&](?:Expires|expires)=(\d+)/)
  return match ? parseInt(match[1], 10) : Math.floor(Date.now() / 1000) + 3600
}

// ─── source ───────────────────────────────────────────────────────────────────

export class JioSaavnSource implements AudioSource {
  readonly name = 'jiosaavn'

  constructor(private readonly client: JioSaavnClient = new DefaultJioSaavnClient()) {}

  canHandle(query: string): boolean {
    if (query.startsWith('jio:')) return true
    if (query.includes('jiosaavn.com')) return true
    if (YOUTUBE_URL_RE.test(query)) return false
    if (YOUTUBE_ID_RE.test(query)) return false
    return true
  }

  async search(query: string, options: { filter?: SearchFilter; limit?: number } = {}): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]> {
    const { filter } = options

    if (filter === 'songs') {
      const raw = await this.client.searchSongs(query, 0, 20)
      return (raw.results ?? []).map(mapSong)
    }

    if (filter === 'albums') {
      const raw = await this.client.searchAlbums(query, 0, 20)
      return (raw.results ?? []).map(mapAlbum)
    }

    if (filter === 'artists') {
      const raw = await this.client.searchArtists(query, 0, 20)
      return (raw.results ?? []).map(mapArtist)
    }

    if (filter === 'playlists') {
      const raw = await this.client.searchPlaylists(query, 0, 20)
      return (raw.results ?? []).map(mapPlaylist)
    }

    // no filter — use autocomplete.get for all types in one shot
    const raw = await this.client.searchAll(query)
    return {
      songs: (raw.songs?.data ?? []).map(s => ({
        type: 'song' as const,
        videoId: `jio:${s.id}`,
        title: s.title,
        artist: s.more_info?.primary_artists ?? 'Unknown Artist',
        duration: 0,
        thumbnails: imageToThumbnails(s.image),
      })),
      albums: (raw.albums?.data ?? []).map(a => ({
        type: 'album' as const,
        browseId: `jio:${a.id}`,
        title: a.title,
        artist: a.more_info?.music ?? 'Unknown Artist',
        year: a.more_info?.year,
        thumbnails: imageToThumbnails(a.image),
        tracks: [],
      })),
      artists: (raw.artists?.data ?? []).map(a => ({
        type: 'artist' as const,
        channelId: `jio:${a.id}`,
        name: a.title,
        thumbnails: imageToThumbnails(a.image),
        songs: [],
        albums: [],
        singles: [],
      })),
      playlists: (raw.playlists?.data ?? []).map(p => ({
        type: 'playlist' as const,
        playlistId: `jio:${p.id}`,
        title: p.title,
        thumbnails: imageToThumbnails(p.image),
      })),
    }
  }

  async getStream(id: string, quality: 'high' | 'low' = 'high'): Promise<StreamingData> {
    const raw = await this.client.getSong(stripPrefix(id))
    const song = raw.songs?.[0]
    if (!song) throw new Error(`JioSaavn: song not found — ${id}`)

    const decrypted = decryptStreamUrl(song.more_info.encrypted_media_url)
    const { suffix, bitrate } = BITRATE[quality]
    const url = decrypted.replace('_96', suffix)

    return { url, codec: 'mp4a', bitrate, expiresAt: extractExpiry(url) }
  }

  async getMetadata(id: string): Promise<Song> {
    const raw = await this.client.getSong(stripPrefix(id))
    const song = raw.songs?.[0]
    if (!song) throw new Error(`JioSaavn: song not found — ${id}`)
    return { ...mapSong(song), videoId: id.startsWith('jio:') ? id : `jio:${id}` }
  }

  async getAlbum(id: string): Promise<Album> {
    const raw = await this.client.getAlbum(stripPrefix(id))
    const artist = raw.more_info?.artistMap?.primary_artists?.[0]?.name ?? 'Unknown Artist'
    const browseId = id.startsWith('jio:') ? id : `jio:${id}`
    return {
      type: 'album',
      browseId,
      title: raw.title,
      artist,
      year: raw.year,
      thumbnails: imageToThumbnails(raw.image),
      tracks: (raw.list ?? []).map(s => ({ ...mapSong(s) })),
    }
  }

  async getArtist(id: string): Promise<Artist> {
    const raw = await this.client.getArtist(stripPrefix(id))
    const channelId = id.startsWith('jio:') ? id : `jio:${id}`
    return {
      type: 'artist',
      channelId,
      name: raw.name,
      thumbnails: imageToThumbnails(raw.image),
      songs: (raw.topSongs ?? []).map(mapSong),
      albums: (raw.topAlbums ?? []).map(mapAlbum),
      singles: (raw.singles ?? []).map(s => ({
        type: 'album' as const,
        browseId: `jio:${s.id}`,
        title: s.title,
        artist: s.more_info?.artistMap?.primary_artists?.[0]?.name ?? raw.name,
        thumbnails: imageToThumbnails(s.image),
        tracks: [],
      })),
    }
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const raw = await this.client.getPlaylist(stripPrefix(id))
    const playlistId = id.startsWith('jio:') ? id : `jio:${id}`
    return {
      type: 'playlist',
      playlistId,
      title: raw.title,
      thumbnails: imageToThumbnails(raw.image),
      songs: (raw.list ?? []).map(mapSong),
    }
  }

  async getRadio(id: string): Promise<Song[]> {
    const strippedId = stripPrefix(id)
    const { stationid } = await this.client.createEntityStation(strippedId)
    const raw = await this.client.getRadioSongs(stationid, 20)
    return Object.entries(raw)
      .filter(([key, val]) => key !== 'stationid' && typeof val === 'object' && val !== null && 'song' in val)
      .map(([, val]) => mapSong((val as { song: RawSong }).song))
  }

  async getLyrics(id: string): Promise<string | null> {
    try {
      const raw = await this.client.getLyrics(stripPrefix(id))
      if (!raw.lyrics) return null
      return raw.lyrics.replace(/<br\s*\/?>/gi, '\n')
    } catch {
      return null
    }
  }

  async getHome(language?: string): Promise<Section[]> {
    const raw = await this.client.getHome(language)
    const sections: Section[] = []
    for (const [key, val] of Object.entries(raw)) {
      if (!Array.isArray(val) || val.length === 0) continue
      const items = val
        .filter((item: any) => item?.type && ['song', 'album', 'playlist'].includes(item.type))
        .map((item: any) => {
          if (item.type === 'song') return mapSong(item as RawSong)
          if (item.type === 'album') return mapAlbum(item as RawAlbumResult)
          return mapPlaylist(item)
        })
      if (items.length > 0) {
        sections.push({ title: keyToTitle(key), items })
      }
    }
    return sections
  }
}
