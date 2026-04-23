import type { DiscoveryClient } from '../discovery'
import type { StreamResolver } from '../stream'
import type { Song, Album, Artist, Playlist, StreamingData, SearchResults, SearchFilter } from '../models'
import type { AudioSource } from './audio-source'

export class YouTubeMusicSource implements AudioSource {
  readonly name = 'youtube-music'

  constructor(
    private readonly discovery: DiscoveryClient,
    private readonly resolver: StreamResolver,
  ) {}

  canHandle(query: string): boolean {
    return !query.startsWith('jio:')
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
}
