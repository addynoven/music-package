import type { DiscoveryClient } from '../discovery'
import type { StreamResolver } from '../stream'
import type { Song, Album, Artist, Playlist, Section, StreamingData, SearchResults, SearchFilter, BrowseOptions } from '../models'
import type { AudioSource } from './audio-source'

export class YouTubeMusicSource implements AudioSource {
  readonly name = 'youtube-music'

  constructor(
    private readonly discovery: DiscoveryClient,
    private readonly resolver: StreamResolver,
  ) {}

  canHandle(_query: string): boolean {
    return true
  }

  async search(query: string, options: { filter?: SearchFilter; limit?: number } = {}): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]> {
    return this.discovery.search(query, options)
  }

  async getStream(id: string, quality: 'high' | 'low' = 'high'): Promise<StreamingData> {
    return this.resolver.resolve(id, quality)
  }

  async getMetadata(id: string): Promise<Song> {
    return this.discovery.getInfo(id)
  }

  async getAlbum(id: string): Promise<Album> {
    return this.discovery.getAlbum(id)
  }

  async getArtist(id: string): Promise<Artist> {
    return this.discovery.getArtist(id)
  }

  async getPlaylist(id: string): Promise<Playlist> {
    return this.discovery.getPlaylist(id)
  }

  async getRadio(id: string): Promise<Song[]> {
    return this.discovery.getRadio(id)
  }

  async getRelated(id: string): Promise<Song[]> {
    return this.discovery.getRelated(id)
  }

  async getHome(): Promise<Section[]> {
    return this.discovery.getHome()
  }

  async getCharts(options?: BrowseOptions): Promise<Section[]> {
    return this.discovery.getCharts(options)
  }

  async getMoodCategories(): Promise<{ title: string; params: string }[]> {
    return this.discovery.getMoodCategories()
  }

  async getMoodPlaylists(params: string): Promise<Section[]> {
    return this.discovery.getMoodPlaylists(params)
  }

  async autocomplete(query: string): Promise<string[]> {
    return this.discovery.autocomplete(query)
  }
}
