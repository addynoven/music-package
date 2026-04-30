import type { Song, StreamingData, SearchResults, SearchFilter, Album, Artist, Playlist, Section, BrowseOptions } from '../models'

export interface AudioSource {
  readonly name: string
  canHandle(query: string): boolean
  search(query: string, options?: { filter?: SearchFilter; limit?: number }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]>
  getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData>
  getMetadata(id: string): Promise<Song>
  getAlbum?(id: string): Promise<Album>
  getArtist?(id: string): Promise<Artist>
  getPlaylist?(id: string): Promise<Playlist>
  getRadio?(id: string): Promise<Song[]>
  getRelated?(id: string): Promise<Song[]>
  getHome?(): Promise<Section[]>
  getCharts?(options?: BrowseOptions): Promise<Section[]>
  getMoodCategories?(): Promise<{ title: string; params: string }[]>
  getMoodPlaylists?(params: string): Promise<Section[]>
  autocomplete?(query: string): Promise<string[]>
}
