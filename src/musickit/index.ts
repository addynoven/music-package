import { Innertube } from 'youtubei.js'
import { Cache } from '../cache'
import { RateLimiter } from '../rate-limiter'
import { RetryEngine } from '../retry'
import { SessionManager } from '../session'
import { DiscoveryClient } from '../discovery'
import { StreamResolver } from '../stream'
import { Downloader } from '../downloader'
import { MusicKitEmitter } from '../events'
import type {
  MusicKitConfig,
  SearchResults,
  Song,
  Album,
  Artist,
  Section,
  AudioTrack,
  StreamingData,
  SearchFilter,
  Quality,
} from '../models'

type EventName = Parameters<MusicKitEmitter['on']>[0]
type EventHandler<E extends EventName> = Parameters<MusicKitEmitter['on']>[1] & ((...args: any[]) => void)

export class MusicKit {
  private readonly cache: Cache
  private readonly limiter: RateLimiter
  private readonly retry: RetryEngine
  private readonly session: SessionManager
  private readonly emitter: MusicKitEmitter
  private readonly searchCache = new Map<string, SearchResults | Song[] | Album[] | Artist[]>()

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
    this.retry = new RetryEngine({
      maxAttempts: config.maxRetries ?? 3,
      backoffBase: config.backoffBase ?? 1_000,
      backoffMax: config.backoffMax,
    })
    this.session = new SessionManager(this.cache, {
      visitorId: config.visitorId,
      userAgent: config.userAgent,
    })
    this.emitter = new MusicKitEmitter()

    if (_yt) {
      this._discovery = new DiscoveryClient(_yt)
      this._stream = new StreamResolver(this.cache, _yt)
      this._downloader = new Downloader(this._stream)
    }
  }

  static async create(config: MusicKitConfig = {}): Promise<MusicKit> {
    const yt = await Innertube.create({ generate_session_locally: true })
    return new MusicKit(config, yt)
  }

  private async ensureClients(): Promise<void> {
    if (this._discovery) return
    if (!this._ytPromise) {
      this._ytPromise = Innertube.create({ generate_session_locally: true })
    }
    const yt = await this._ytPromise
    this._discovery = new DiscoveryClient(yt)
    this._stream = new StreamResolver(this.cache, yt)
    this._downloader = new Downloader(this._stream)
  }

  on(event: EventName, handler: EventHandler<typeof event>): void {
    this.emitter.on(event as any, handler as any)
  }

  off(event: EventName, handler: EventHandler<typeof event>): void {
    this.emitter.off(event as any, handler as any)
  }

  async autocomplete(query: string): Promise<string[]> {
    await this.ensureClients()
    return this._discovery!.autocomplete(query)
  }

  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[] | Album[] | Artist[]> {
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

    try {
      await this.limiter.throttle('search')
      await this.ensureClients()
      const result = await this._discovery!.search(query, options ?? {})
      this.searchCache.set(cacheKey, result)
      this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
      return result
    } catch (err) {
      this.emitter.emit('error', err as Error)
      throw err
    }
  }

  async getStream(videoId: string, options?: { quality?: Quality }): Promise<StreamingData> {
    try {
      await this.ensureClients()
      return await this._stream!.resolve(videoId, options?.quality ?? 'high')
    } catch (err) {
      this.emitter.emit('error', err as Error)
      throw err
    }
  }

  async getTrack(videoId: string): Promise<AudioTrack> {
    await this.ensureClients()
    const [songs, streamData] = await Promise.all([
      this._discovery!.search(videoId, { filter: 'songs' }),
      this._stream!.resolve(videoId, 'high'),
    ])

    const song = Array.isArray(songs) ? (songs as Song[])[0] : undefined
    if (!song) throw new Error(`Track not found: ${videoId}`)

    return { ...song, stream: streamData }
  }

  async getHome(): Promise<Section[]> {
    await this.ensureClients()
    return this._discovery!.getHome()
  }

  async getArtist(channelId: string): Promise<Artist> {
    await this.ensureClients()
    return this._discovery!.getArtist(channelId)
  }

  async getAlbum(browseId: string): Promise<Album> {
    await this.ensureClients()
    return this._discovery!.getAlbum(browseId)
  }

  async getRadio(videoId: string): Promise<Song[]> {
    await this.ensureClients()
    return this._discovery!.getRadio(videoId)
  }

  async getRelated(videoId: string): Promise<Song[]> {
    await this.ensureClients()
    return this._discovery!.getRelated(videoId)
  }

  async getCharts(options?: { country?: string }): Promise<Section[]> {
    await this.ensureClients()
    return this._discovery!.getCharts(options)
  }

  async download(videoId: string, options?: Parameters<Downloader['download']>[1]): Promise<void> {
    await this.ensureClients()
    return this._downloader!.download(videoId, options)
  }
}
