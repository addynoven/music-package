const BASE_URL = 'https://www.jiosaavn.com/api.php'
const COMMON_PARAMS = '_format=json&_marker=0&api_version=4'

export interface RawArtist {
  id: string
  name: string
  role: string
  image?: string
  type?: string
  perma_url?: string
}

export interface RawSong {
  id: string
  title: string
  subtitle?: string
  more_info: {
    duration: string
    artistMap: {
      primary_artists: RawArtist[]
      featured_artists: RawArtist[]
      artists: RawArtist[]
    }
    album?: string
    encrypted_media_url: string
  }
  image: unknown
}

export interface RawAlbumResult {
  id: string
  title: string
  header_desc?: string
  perma_url?: string
  year?: string
  type: string
  play_count?: string
  language?: string
  explicit_content?: string
  image: unknown
  more_info?: {
    artistMap?: {
      primary_artists?: RawArtist[]
      featured_artists?: RawArtist[]
      artists?: RawArtist[]
    }
  }
}

export interface RawArtistResult {
  id: string
  name: string
  role?: string
  image?: unknown
  type?: string
  perma_url?: string
}

export interface RawPlaylistResult {
  id: string
  title: string
  type: string
  image: unknown
  perma_url?: string
  more_info?: { song_count?: string; language?: string }
  explicit_content?: string
}

export interface RawSearchResponse<T> {
  total: number | string
  start: number | string
  results: T[]
}

export interface RawSongResponse {
  songs: RawSong[]
}

export interface RawAlbumDetail {
  id: string
  title: string
  image: unknown
  year?: string
  more_info?: {
    artistMap?: {
      primary_artists?: RawArtist[]
    }
  }
  list: RawSong[]
}

export interface RawArtistDetail {
  artistId?: string
  id?: string
  name: string
  image?: string
  follower_count?: string
  topSongs?: RawSong[]
  topAlbums?: RawAlbumResult[]
  singles?: RawSong[]
}

export interface RawPlaylistDetail {
  id: string
  title: string
  image: unknown
  list: RawSong[]
  list_count?: string
}

export interface RawStationResponse {
  stationid: string
}

export type RawRadioSongsResponse = Record<string, { song: RawSong } | string>

// getBrowseModules response — each key is a module name (e.g. "new_albums", "charts")
// Values are direct arrays of items, OR nested objects for non-music modules (radio, shows)
export type RawBrowseModulesResponse = Record<string, unknown>

export interface RawSearchAllResponse {
  songs: { data: Array<{ id: string; title: string; image: unknown; more_info: { album?: string; primary_artists?: string; language?: string } }>; position: number }
  albums: { data: Array<{ id: string; title: string; image: unknown; more_info: { music?: string; year?: string; language?: string } }>; position: number }
  artists: { data: Array<{ id: string; title: string; image: unknown; type: string }>; position: number }
  playlists: { data: Array<{ id: string; title: string; image: unknown; perma_url?: string; more_info?: { language?: string } }>; position: number }
  topquery?: { data: unknown[]; position: number }
}

export interface RawLyricsResponse {
  lyrics: string
  snippet?: string
  lyrics_copyright?: string
  id?: string
}

export interface JioSaavnClient {
  searchSongs(query: string, page: number, limit: number): Promise<RawSearchResponse<RawSong>>
  searchAlbums(query: string, page: number, limit: number): Promise<RawSearchResponse<RawAlbumResult>>
  searchArtists(query: string, page: number, limit: number): Promise<RawSearchResponse<RawArtistResult>>
  searchPlaylists(query: string, page: number, limit: number): Promise<RawSearchResponse<RawPlaylistResult>>
  searchAll(query: string): Promise<RawSearchAllResponse>
  getSong(id: string): Promise<RawSongResponse>
  getAlbum(albumId: string): Promise<RawAlbumDetail>
  getArtist(artistId: string): Promise<RawArtistDetail>
  getPlaylist(playlistId: string, page?: number, limit?: number): Promise<RawPlaylistDetail>
  createEntityStation(songId: string): Promise<RawStationResponse>
  getRadioSongs(stationId: string, limit?: number): Promise<RawRadioSongsResponse>
  getHome(language?: string): Promise<RawBrowseModulesResponse>
  getLyrics(id: string): Promise<RawLyricsResponse>
}

async function jioFetch<T>(params: string, ctx = 'web6dot0'): Promise<T> {
  const url = `${BASE_URL}?${COMMON_PARAMS}&ctx=${ctx}&${params}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error(`JioSaavn HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export class DefaultJioSaavnClient implements JioSaavnClient {
  async searchSongs(query: string, page = 0, limit = 20): Promise<RawSearchResponse<RawSong>> {
    return jioFetch(`__call=search.getResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`)
  }

  async searchAlbums(query: string, page = 0, limit = 20): Promise<RawSearchResponse<RawAlbumResult>> {
    return jioFetch(`__call=search.getAlbumResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`)
  }

  async searchArtists(query: string, page = 0, limit = 20): Promise<RawSearchResponse<RawArtistResult>> {
    return jioFetch(`__call=search.getArtistResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`)
  }

  async searchPlaylists(query: string, page = 0, limit = 20): Promise<RawSearchResponse<RawPlaylistResult>> {
    return jioFetch(`__call=search.getPlaylistResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`)
  }

  async searchAll(query: string): Promise<RawSearchAllResponse> {
    return jioFetch(`__call=autocomplete.get&query=${encodeURIComponent(query)}`)
  }

  async getSong(id: string): Promise<RawSongResponse> {
    return jioFetch(`__call=song.getDetails&pids=${encodeURIComponent(id)}`)
  }

  async getAlbum(albumId: string): Promise<RawAlbumDetail> {
    return jioFetch(`__call=content.getAlbumDetails&albumid=${encodeURIComponent(albumId)}`)
  }

  async getArtist(artistId: string): Promise<RawArtistDetail> {
    return jioFetch(`__call=artist.getArtistPageDetails&artistId=${encodeURIComponent(artistId)}&n_song=10&n_album=10&page=0&sort_order=asc&category=overview`)
  }

  async getPlaylist(playlistId: string, page = 0, limit = 20): Promise<RawPlaylistDetail> {
    return jioFetch(`__call=playlist.getDetails&listid=${encodeURIComponent(playlistId)}&p=${page}&n=${limit}`)
  }

  async createEntityStation(songId: string): Promise<RawStationResponse> {
    const entityId = encodeURIComponent(JSON.stringify([encodeURIComponent(songId)]))
    return jioFetch(`__call=webradio.createEntityStation&entity_id=${entityId}&entity_type=queue`, 'android')
  }

  async getRadioSongs(stationId: string, limit = 20): Promise<RawRadioSongsResponse> {
    return jioFetch(`__call=webradio.getSong&stationid=${encodeURIComponent(stationId)}&k=${limit}`, 'android')
  }

  async getHome(language = 'hindi'): Promise<RawBrowseModulesResponse> {
    return jioFetch(`__call=content.getBrowseModules&language=${encodeURIComponent(language)}`)
  }

  async getLyrics(id: string): Promise<RawLyricsResponse> {
    return jioFetch(`__call=lyrics.getLyrics&lyrics_id=${encodeURIComponent(id)}`)
  }
}
