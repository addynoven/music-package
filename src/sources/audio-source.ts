import type { Song, StreamingData, SearchResults, SearchFilter, Album, Artist, Playlist, Section } from '../models'

export interface AudioSource {
  readonly name: string
  canHandle(query: string): boolean
  search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]>
  getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData>
  getMetadata(id: string): Promise<Song>
  getAlbum?(id: string): Promise<Album>
  getArtist?(id: string): Promise<Artist>
  getPlaylist?(id: string): Promise<Playlist>
  getRadio?(id: string): Promise<Song[]>
  getHome?(language?: string): Promise<Section[]>
}
