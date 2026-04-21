import { Innertube } from 'youtubei.js'
import { Cache } from '../cache'
import { RateLimiter } from '../rate-limiter'
import { RetryEngine } from '../retry'
import { SessionManager } from '../session'
import { DiscoveryClient } from '../discovery'
import { StreamResolver } from '../stream'
import { Downloader } from '../downloader'
import { MusicKitEmitter } from '../events'
import { YouTubeMusicSource } from '../sources/youtube-music'
import { JioSaavnSource } from '../sources/jiosaavn'
import type { AudioSource } from '../sources/audio-source'
import type {
  MusicKitConfig,
  MusicKitRequest,
  SearchResults,
  Song,
  Album,
  Artist,
  Playlist,
  Section,
  AudioTrack,
  StreamingData,
  SearchFilter,
  Quality,
  DownloadOptions,
  BrowseOptions,
} from '../models'

type EventName = Parameters<MusicKitEmitter['on']>[0]
type EventHandler<E extends EventName> = Parameters<MusicKitEmitter['on']>[1] & ((...args: any[]) => void)

function makeReq(endpoint: string): MusicKitRequest {
  return { method: 'GET', endpoint, headers: {}, body: null }
}

export class MusicKit {
  private readonly cache: Cache
  private readonly limiter: RateLimiter
  private readonly retry: RetryEngine
  private readonly session: SessionManager
  private readonly emitter: MusicKitEmitter
  private readonly searchCache = new Map<string, SearchResults | Song[] | Album[] | Artist[]>()
  readonly sources: AudioSource[] = []

  private _discovery: DiscoveryClient | null = null
  private _stream: StreamResolver | null = null
  private _downloader: Downloader | null = null
  private _ytPromise: Promise<Innertube> | null = null

  constructor(config: MusicKitConfig = {}, _yt?: Innertube) {
    const cacheConfig = config.cache ?? {}
    this.cache = new Cache({
      enabled: cacheConfig.enabled ?? true,
      path: cacheConfig.dir,
    })
    this.limiter = new RateLimiter(config.rateLimit ?? {}, config.minRequestGap ?? 100)
    this.emitter = new MusicKitEmitter()
    this.retry = new RetryEngine({
      maxAttempts: config.maxRetries ?? 3,
      backoffBase: config.backoffBase ?? 1_000,
      backoffMax: config.backoffMax,
      onRetry: () => {},
    })
    this.session = new SessionManager(this.cache, {
      visitorId: config.visitorId,
      userAgent: config.userAgent,
    })

    if (_yt) {
      this._discovery = new DiscoveryClient(_yt)
      this._stream = new StreamResolver(this.cache, _yt)
      this._downloader = new Downloader(this._stream, this._discovery!)
    }
  }

  static async create(config: MusicKitConfig = {}): Promise<MusicKit> {
    const yt = await Innertube.create({ generate_session_locally: true })
    return new MusicKit(config, yt)
  }

  registerSource(source: AudioSource): void {
    this.sources.push(source)
  }

  private sourceFor(query: string): AudioSource {
    const source = this.sources.find(s => s.canHandle(query))
    if (!source) throw new Error(`No source can handle: ${query}`)
    return source
  }

  private async ensureClients(): Promise<void> {
    if (!this._discovery) {
      if (!this._ytPromise) {
        this._ytPromise = Innertube.create({ generate_session_locally: true })
      }
      const yt = await this._ytPromise
      this._discovery = new DiscoveryClient(yt)
      this._stream = new StreamResolver(this.cache, yt)
      this._downloader = new Downloader(this._stream, this._discovery)
    }
    if (this.sources.length === 0) {
      this.sources.push(new JioSaavnSource())
      this.sources.push(new YouTubeMusicSource(this._discovery!, this._stream!))
    }
  }

  private async call<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
    const req = makeReq(endpoint)
    const start = Date.now()
    this.emitter.emit('beforeRequest', req)
    try {
      const result = await this.retry.execute(fn, endpoint, {
        onRateLimited: (waitMs) => this.emitter.emit('rateLimited', endpoint, waitMs),
        onRetry: (ep, attempt, reason) => this.emitter.emit('retry', ep, attempt, reason),
      })
      this.emitter.emit('afterRequest', req, Date.now() - start, 200)
      return result
    } catch (err) {
      this.emitter.emit('error', err as Error)
      throw err
    }
  }

  on(event: EventName, handler: EventHandler<typeof event>): void {
    this.emitter.on(event as any, handler as any)
  }

  off(event: EventName, handler: EventHandler<typeof event>): void {
    this.emitter.off(event as any, handler as any)
  }

  async autocomplete(query: string): Promise<string[]> {
    await this.ensureClients()
    return this.call('autocomplete', () => this._discovery!.autocomplete(query))
  }

  async search(query: string, options: { filter: 'songs' }): Promise<Song[]>
  async search(query: string, options: { filter: 'albums' }): Promise<Album[]>
  async search(query: string, options: { filter: 'artists' }): Promise<Artist[]>
  async search(query: string, options: { filter: 'playlists' }): Promise<Playlist[]>
  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults>
  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]> {
    const cacheKey = `search:${query}:${options?.filter ?? 'all'}`

    const inMemory = this.searchCache.get(cacheKey)
    if (inMemory !== undefined) {
      this.emitter.emit('cacheHit', cacheKey, Cache.TTL.SEARCH)
      return inMemory
    }

    const persisted = this.cache.get<SearchResults | Song[] | Album[] | Artist[]>(cacheKey)
    if (persisted) {
      this.searchCache.set(cacheKey, persisted)
      this.emitter.emit('cacheHit', cacheKey, Cache.TTL.SEARCH)
      return persisted
    }

    this.emitter.emit('cacheMiss', cacheKey)
    await this.limiter.throttle('search', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('search', () => this.sourceFor(query).search(query, options ?? {}))
    this.searchCache.set(cacheKey, result as any)
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
    return result
  }

  async getStream(videoId: string, options?: { quality?: Quality }): Promise<StreamingData> {
    await this.ensureClients()
    const quality = options?.quality ?? 'high'
    return this.call('stream', () => this.sourceFor(videoId).getStream(videoId, quality))
  }

  async getTrack(videoId: string): Promise<AudioTrack> {
    await this.ensureClients()
    const [song, streamData] = await Promise.all([
      this.call('browse', () => this._discovery!.getInfo(videoId)),
      this.call('stream', () => this.sourceFor(videoId).getStream(videoId, 'high')),
    ])
    return { ...song, stream: streamData }
  }

  async getHome(): Promise<Section[]> {
    await this.ensureClients()
    const src = this.sources.find(s => s.getHome)
    if (src) return this.call('browse', () => src.getHome!())
    return this.call('browse', () => this._discovery!.getHome())
  }

  async getArtist(channelId: string): Promise<Artist> {
    await this.ensureClients()
    if (channelId.startsWith('jio:')) {
      const src = this.sourceFor(channelId)
      if (src.getArtist) return this.call('browse', () => src.getArtist!(channelId))
    }
    return this.call('browse', () => this._discovery!.getArtist(channelId))
  }

  async getAlbum(browseId: string): Promise<Album> {
    await this.ensureClients()
    if (browseId.startsWith('jio:')) {
      const src = this.sourceFor(browseId)
      if (src.getAlbum) return this.call('browse', () => src.getAlbum!(browseId))
    }
    return this.call('browse', () => this._discovery!.getAlbum(browseId))
  }

  async getPlaylist(playlistId: string): Promise<Playlist> {
    await this.ensureClients()
    if (playlistId.startsWith('jio:')) {
      const src = this.sourceFor(playlistId)
      if (src.getPlaylist) return this.call('browse', () => src.getPlaylist!(playlistId))
    }
    throw new Error(`No source can handle getPlaylist: ${playlistId}`)
  }

  async getRadio(videoId: string): Promise<Song[]> {
    await this.ensureClients()
    if (videoId.startsWith('jio:')) {
      const src = this.sourceFor(videoId)
      if (src.getRadio) return this.call('browse', () => src.getRadio!(videoId))
    }
    return this.call('browse', () => this._discovery!.getRadio(videoId))
  }

  async getRelated(videoId: string): Promise<Song[]> {
    await this.ensureClients()
    return this.call('browse', () => this._discovery!.getRelated(videoId))
  }

  async getCharts(options?: BrowseOptions): Promise<Section[]> {
    await this.ensureClients()
    return this.call('browse', () => this._discovery!.getCharts(options))
  }

  async download(videoId: string, options?: DownloadOptions): Promise<void> {
    await this.ensureClients()
    return this._downloader!.download(videoId, options)
  }
}

