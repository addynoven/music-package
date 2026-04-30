import { Cache } from '../cache'
import { RateLimiter } from '../rate-limiter'
import { RetryEngine } from '../retry'
import { SessionManager } from '../session'
import { DiscoveryClient } from '../discovery'
import { StreamResolver } from '../stream'
import { InnertubePool } from '../stream/innertube-pool'
import { Downloader } from '../downloader'
import { Identifier } from '../identifier'
import { PodcastClient } from '../podcast'
import { MusicKitEmitter } from '../events'
import { YouTubeMusicSource } from '../sources/youtube-music'
import { YouTubeDataAPISource } from '../sources/youtube-data-api'
import { fetchFromLrclib } from '../lyrics/lrclib'
import { fetchFromLyricsOvh } from '../lyrics/lyrics-ovh'
import { fetchFromBetterLyrics } from '../lyrics/better-lyrics'
import { fetchFromKuGou } from '../lyrics/kugou'
import { resolveInput } from '../utils/url-resolver'
import { readCookieHeader } from '../utils/cookies'
import { makeFetch } from '../utils/fetch'
import { ValidationError, NotFoundError } from '../errors'
import { Logger } from '../logger'
import type { AudioSource } from '../sources/audio-source'
import type {
  MusicKitConfig,
  MusicKitRequest,
  SearchResults,
  Song,
  Album,
  Artist,
  Playlist,
  Podcast,
  Section,
  AudioTrack,
  StreamingData,
  Lyrics,
  SearchFilter,
  Quality,
  DownloadOptions,
  BrowseOptions,
  SourceName,
  SourcePreference,
} from '../models'

type EventName = Parameters<MusicKitEmitter['on']>[0]
type EventHandler<E extends EventName> = Parameters<MusicKitEmitter['on']>[1] & ((...args: any[]) => void)

function makeReq(endpoint: string): MusicKitRequest {
  return { method: 'GET', endpoint, headers: {}, body: null }
}

function isQuotaOrRateLimit(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const name = err.constructor?.name ?? ''
  if (name === 'NetworkError') {
    const status = (err as any).status as number | undefined
    return status === 403 || status === 429
  }
  return false
}

function resolveSourceOrder(pref?: SourcePreference): SourceName[] {
  if (!pref || pref === 'best') return ['youtube']
  return pref
}

export class MusicKit {
  private readonly config: MusicKitConfig
  private readonly cache: Cache
  private readonly limiter: RateLimiter
  private readonly retry: RetryEngine
  private readonly session: SessionManager
  private readonly emitter: MusicKitEmitter
  private readonly log: Logger
  // sharedFetch: used for external API calls (lrclib, acoustid, lyrics.ovh) — proxy + session headers
  private readonly sharedFetch: typeof fetch
  // innerTubeFetch: used for Innertube.create — proxy only; youtubei.js manages its own UA/visitor-ID
  private readonly innerTubeFetch: typeof fetch | undefined
  private readonly searchCache = new Map<string, SearchResults | Song[] | Album[] | Artist[]>()
  private readonly sourceOrder: SourceName[]

  private static readonly SEARCH_CACHE_MAX = 256

  private searchCacheSet(key: string, value: SearchResults | Song[] | Album[] | Artist[]): void {
    if (this.searchCache.size >= MusicKit.SEARCH_CACHE_MAX) {
      // Delete the oldest entry (Map preserves insertion order)
      this.searchCache.delete(this.searchCache.keys().next().value!)
    }
    this.searchCache.set(key, value)
  }

  private searchCacheGet(key: string): SearchResults | Song[] | Album[] | Artist[] | undefined {
    const val = this.searchCache.get(key)
    if (val !== undefined) {
      // Refresh recency: move to end
      this.searchCache.delete(key)
      this.searchCache.set(key, val)
    }
    return val
  }
  readonly sources: AudioSource[] = []

  private _discovery: DiscoveryClient | null = null
  private _stream: StreamResolver | null = null
  private _downloader: Downloader | null = null
  private _identifier: Identifier | null = null
  private _podcast: PodcastClient | null = null
  private _poolPromise: Promise<InnertubePool> | null = null

  constructor(config: MusicKitConfig = {}, _yt?: unknown) {
    this.config = config
    this.sourceOrder = resolveSourceOrder(config.sourceOrder)
    const cacheConfig = config.cache ?? {}
    this.cache = new Cache({
      enabled: cacheConfig.enabled ?? true,
      path: cacheConfig.dir,
    })
    this.limiter = new RateLimiter(config.rateLimit ?? {}, config.minRequestGap ?? 100)
    this.emitter = new MusicKitEmitter()
    this.log = new Logger({ logLevel: config.logLevel, logHandler: config.logHandler })
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
    this.sharedFetch = makeFetch({ proxy: config.proxy, session: this.session })
    // For InnerTube: only proxy-route; youtubei.js manages UA + visitor-ID internally
    this.innerTubeFetch = config.proxy ? makeFetch({ proxy: config.proxy }) : undefined

    if (_yt) {
      // Legacy single-Innertube constructor path (used primarily by tests).
      // The passed _yt instance is ignored — a fresh InnertubePool is created
      // instead so the constructor branch behaves the same as the static paths.
      // NOTE(v4.2): This means _yt is no longer used directly; the pool will
      // lazy-create its own YTMUSIC session on first use.
      const pool = new InnertubePool({
        fetch: this.innerTubeFetch,
        // TODO(v4.2): config.poToken / config.getPoToken — add to MusicKitConfig
        poToken: (config as any).poToken as string | undefined,
        getPoToken: (config as any).getPoToken as ((videoId: string, client: any) => Promise<string | null>) | undefined,
      })
      // Eagerly start the YTMUSIC session for discovery — don't await here since
      // the constructor is sync. ensureClients will await as needed.
      const ytPromise = pool.get('YTMUSIC')
      this._poolPromise = ytPromise.then(() => pool)
      ytPromise.then((yt) => {
        this._discovery = new DiscoveryClient(yt)
        this._stream = new StreamResolver(this.cache, config.cookiesPath, config.proxy, pool, this.onStreamFallback)
        this._downloader = new Downloader(this._stream, this._discovery!, config.cookiesPath, config.proxy)
      }).catch(() => {
        // Will be retried in ensureClients()
      })
    }

    if (!config.youtubeApiKey && !config.cookiesPath) {
      this.log.warn('[MusicKit] No youtubeApiKey or cookiesPath configured. You may hit YouTube rate limits under heavy usage. Recommendation: set youtubeApiKey for search, cookiesPath for streams.')
    }

    if (!config.identify?.acoustidApiKey) {
      this.log.warn('[MusicKit] identify() is unavailable — no acoustidApiKey set. Get a free key at acoustid.org and pass it as config.identify.acoustidApiKey.')
    }
  }

  static async create(config: MusicKitConfig = {}): Promise<MusicKit> {
    const instance = new MusicKit(config)
    const cookieHeader = config.cookiesPath ? readCookieHeader(config.cookiesPath) : ''
    // TODO(v4.2): config.poToken / config.getPoToken — add to MusicKitConfig
    const pool = new InnertubePool({
      fetch: instance.innerTubeFetch,
      cookie: cookieHeader || undefined,
      lang: config.language,
      location: config.location,
      poToken: (config as any).poToken as string | undefined,
      getPoToken: (config as any).getPoToken as ((videoId: string, client: any) => Promise<string | null>) | undefined,
    })
    const yt = await pool.get('YTMUSIC')
    instance._discovery = new DiscoveryClient(yt)
    instance._stream = new StreamResolver(instance.cache, config.cookiesPath, config.proxy, pool, instance.onStreamFallback)
    instance._downloader = new Downloader(instance._stream, instance._discovery, config.cookiesPath, config.proxy)
    return instance
  }

  registerSource(source: AudioSource): void {
    this.sources.push(source)
  }

  private sourceFor(query: string, override?: SourceName): AudioSource {
    if (override === 'youtube') {
      const yt = this.sources.find(s => s.name.startsWith('youtube'))
      if (!yt) throw new ValidationError(`Source 'youtube' is not registered — check your sourceOrder config`, 'sourceOrder')
      return yt
    }
    if (override) {
      const found = this.sources.find(s => s.name === override)
      if (!found) throw new ValidationError(`Source '${override}' is not registered — check your sourceOrder config`, 'sourceOrder')
      return found
    }
    const source = this.sources.find(s => s.canHandle(query))
    if (!source) throw new NotFoundError(`No source can handle: ${query}`, query)
    return source
  }

  private pickSearchSource(query: string, override?: SourceName, filter?: SearchFilter): AudioSource {
    if (override) return this.sourceFor(query, override)
    // Data API only handles songs — for other filters go straight to YT Music
    if (filter && filter !== 'songs') {
      const ytMusic = this.sources.find(s => s.name === 'youtube-music')
      if (ytMusic) return ytMusic
    }
    return this.sourceFor(query)
  }

  private async tryEachSource<T>(
    method: keyof AudioSource,
    call: (src: AudioSource) => Promise<T>,
    isQuotaError: (err: unknown) => boolean = isQuotaOrRateLimit,
  ): Promise<T> {
    let lastErr: unknown
    for (const src of this.sources) {
      if (typeof src[method] !== 'function') continue
      try {
        return await call(src)
      } catch (err) {
        lastErr = err
        if (!isQuotaError(err)) throw err
        // quota/rate-limit from this source — try next
      }
    }
    throw lastErr ?? new NotFoundError('No source could handle request', method as string)
  }

  private async ensureClients(): Promise<void> {
    if (!this._discovery) {
      if (!this._poolPromise) {
        const cookieHeader = this.config.cookiesPath ? readCookieHeader(this.config.cookiesPath) : ''
        // TODO(v4.2): config.poToken / config.getPoToken — add to MusicKitConfig
        const pool = new InnertubePool({
          fetch: this.innerTubeFetch,
          cookie: cookieHeader || undefined,
          lang: this.config.language,
          location: this.config.location,
          poToken: (this.config as any).poToken as string | undefined,
          getPoToken: (this.config as any).getPoToken as ((videoId: string, client: any) => Promise<string | null>) | undefined,
        })
        this._poolPromise = pool.get('YTMUSIC').then(() => pool)
      }
      const pool = await this._poolPromise
      const yt = await pool.get('YTMUSIC')
      this._discovery = new DiscoveryClient(yt)
      this._stream = new StreamResolver(this.cache, this.config.cookiesPath, this.config.proxy, pool, this.onStreamFallback)
      this._downloader = new Downloader(this._stream, this._discovery, this.config.cookiesPath, this.config.proxy)
    }
    if (this.sources.length === 0) {
      for (const name of this.sourceOrder) {
        if (name === 'youtube') {
          if (this.config.youtubeApiKey) {
            this.sources.push(new YouTubeDataAPISource(this.config.youtubeApiKey, this._stream!))
            this.sources.push(new YouTubeMusicSource(this._discovery!, this._stream!))
          } else {
            this.sources.push(new YouTubeMusicSource(this._discovery!, this._stream!))
          }
        }
      }
    }
  }

  // Bound so it can be passed by reference to StreamResolver without losing `this`.
  private readonly onStreamFallback = (videoId: string, reason: string): void => {
    this.log.debug(`[stream] InnerTube fast-path failed for ${videoId}, falling back to yt-dlp: ${reason}`)
    this.emitter.emit('retry', 'stream', 1, `innertube→ytdlp: ${reason}`)
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

  once(event: EventName, handler: EventHandler<typeof event>): void {
    this.emitter.once(event as any, handler as any)
  }

  async autocomplete(query: string): Promise<string[]> {
    const resolved = resolveInput(query)
    const cacheKey = `autocomplete:${resolved}`
    const cached = this.cache.get<string[]>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('autocomplete', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    const result = await this.call('autocomplete', () =>
      this.tryEachSource('autocomplete', src => src.autocomplete!(resolved)),
    )
    this.cache.set(cacheKey, result, 60)
    return result
  }

  async search(query: string, options: { filter: 'songs'; limit?: number; source?: SourceName }): Promise<Song[]>
  async search(query: string, options: { filter: 'albums'; limit?: number; source?: SourceName }): Promise<Album[]>
  async search(query: string, options: { filter: 'artists'; limit?: number; source?: SourceName }): Promise<Artist[]>
  async search(query: string, options: { filter: 'playlists'; limit?: number; source?: SourceName }): Promise<Playlist[]>
  async search(query: string, options?: { filter?: SearchFilter; limit?: number; source?: SourceName }): Promise<SearchResults>
  async search(query: string, options?: { filter?: SearchFilter; limit?: number; source?: SourceName }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]> {
    const resolved = resolveInput(query)
    const cacheKey = `search:${resolved}:${options?.filter ?? 'all'}:${options?.limit ?? 'default'}:${options?.source ?? 'auto'}`

    const inMemory = this.searchCacheGet(cacheKey)
    if (inMemory !== undefined) {
      this.emitter.emit('cacheHit', cacheKey, Cache.TTL.SEARCH)
      return inMemory
    }

    const persisted = this.cache.get<SearchResults | Song[] | Album[] | Artist[]>(cacheKey)
    if (persisted) {
      this.searchCacheSet(cacheKey, persisted)
      this.emitter.emit('cacheHit', cacheKey, Cache.TTL.SEARCH)
      return persisted
    }

    this.emitter.emit('cacheMiss', cacheKey)
    await this.limiter.throttle('search', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const { source: sourceOverride, ...searchOpts } = options ?? {}
    const src = this.pickSearchSource(resolved, sourceOverride, searchOpts.filter)
    const result = await this.call('search', () => src.search(resolved, searchOpts))
    this.searchCacheSet(cacheKey, result as any)
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
    return result
  }

  async getStream(videoId: string, options?: { quality?: Quality }): Promise<StreamingData> {
    await this.limiter.throttle('stream', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    const id = resolveInput(videoId)
    const quality = options?.quality ?? 'high'

    return this.call('stream', () => this.sourceFor(id).getStream(id, quality))
  }

  async getTrack(videoId: string): Promise<AudioTrack> {
    await this.ensureClients()
    const id = resolveInput(videoId)
    const src = this.sourceFor(id)
    const [song, streamData] = await Promise.all([
      this.call('browse', () => this.tryEachSource('getMetadata', s => s.getMetadata!(id))),
      this.call('stream', () => src.getStream(id, 'high')),
    ])
    return { ...song, stream: streamData }
  }

  async getHome(options?: { language?: string; source?: SourceName }): Promise<Section[]> {
    const lang = options?.language
    const cacheKey = `home:${lang ?? 'default'}:${options?.source ?? 'auto'}`
    const cached = this.cache.get<Section[]>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getHome', src => src.getHome!()),
    )
    this.cache.set(cacheKey, result, Cache.TTL.HOME)
    return result
  }


  async getArtist(channelId: string): Promise<Artist> {
    const id = resolveInput(channelId)
    const cacheKey = `artist:${id}`
    const cached = this.cache.get<Artist>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getArtist', src => src.getArtist!(id)),
    )
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST)
    return result
  }

  async getAlbum(browseId: string): Promise<Album> {
    const id = resolveInput(browseId)
    const cacheKey = `album:${id}`
    const cached = this.cache.get<Album>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getAlbum', src => src.getAlbum!(id)),
    )
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST)
    return result
  }

  async getPlaylist(playlistId: string): Promise<Playlist> {
    const id = resolveInput(playlistId)
    const cacheKey = `playlist:${id}`
    const cached = this.cache.get<Playlist>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getPlaylist', src => src.getPlaylist!(id)),
    )
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST)
    return result
  }

  async getRadio(videoId: string): Promise<Song[]> {
    const id = resolveInput(videoId)
    const cacheKey = `radio:${id}`
    const cached = this.cache.get<Song[]>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getRadio', src => src.getRadio!(id)),
    )
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
    return result
  }

  async getRelated(videoId: string): Promise<Song[]> {
    const id = resolveInput(videoId)
    const cacheKey = `related:${id}`
    const cached = this.cache.get<Song[]>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getRelated', src => src.getRelated!(id)),
    )
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
    return result
  }

  async getSuggestions(id: string): Promise<Song[]> {
    const resolved = resolveInput(id)
    const cacheKey = `suggestions:${resolved}`
    const cached = this.cache.get<Song[]>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.getRelated(resolved)
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
    return result
  }

  async getMetadata(id: string): Promise<Song> {
    const resolved = resolveInput(id)
    const cacheKey = `metadata:${resolved}`
    const cached = this.cache.get<Song>(cacheKey)
    if (cached) return cached
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()

    const result = await this.call('browse', () =>
      this.tryEachSource('getMetadata', src => src.getMetadata!(resolved)),
    )
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH)
    return result
  }

  async getLyrics(id: string): Promise<Lyrics | null> {
    await this.ensureClients()
    const resolved = resolveInput(id)

    const cacheKey = `lyrics:${resolved}`
    const cached = this.cache.get<Lyrics>(cacheKey)
    if (cached !== null) return cached

    let lyrics: Lyrics | null = null

    try {
      const meta = await this.getMetadata(resolved)
      const artist = sanitizeArtist(meta.artist)
      const title = sanitizeTitle(meta.title)
      // Provider chain — first non-null wins.
      // BetterLyrics first: only source of real per-word timings (Apple Music TTML).
      // LRCLIB second: best line-level coverage for English/global music.
      // lyrics.ovh third: plain-text fallback when synced is unavailable.
      // KuGou last: covers Chinese music where the others have ~zero hits.
      lyrics =
        await fetchFromBetterLyrics(artist, title, meta.duration, this.sharedFetch)
        ?? await fetchFromLrclib(artist, title, meta.duration, this.sharedFetch)
        ?? await fetchFromLyricsOvh(artist, title, this.sharedFetch)
        ?? await fetchFromKuGou(artist, title, meta.duration, this.sharedFetch)
    } catch {
      // ignore — return null below
    }

    if (lyrics) this.cache.set(cacheKey, lyrics, Cache.TTL.LYRICS)
    return lyrics
  }

  async getCharts(options?: BrowseOptions): Promise<Section[]> {
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    return this.call('browse', () =>
      this.tryEachSource('getCharts', src => src.getCharts!(options)),
    )
  }

  async getMoodCategories(): Promise<{ title: string; params: string }[]> {
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    return this.call('browse', () =>
      this.tryEachSource('getMoodCategories', src => src.getMoodCategories!()),
    )
  }

  async getMoodPlaylists(params: string): Promise<Section[]> {
    await this.limiter.throttle('browse', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    return this.call('browse', () =>
      this.tryEachSource('getMoodPlaylists', src => src.getMoodPlaylists!(params)),
    )
  }

  async download(videoId: string, options?: DownloadOptions): Promise<void> {
    await this.limiter.throttle('stream', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    const id = resolveInput(videoId)
    return this._downloader!.download(id, options)
  }

  async streamAudio(id: string): Promise<NodeJS.ReadableStream> {
    await this.limiter.throttle('stream', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    const resolved = resolveInput(id)
    return this._downloader!.streamAudio(resolved)
  }

  async identify(filePath: string): Promise<Song | null> {
    if (!this.config.identify?.acoustidApiKey) {
      throw new ValidationError(
        'identify() requires config.identify.acoustidApiKey — get a free key at acoustid.org',
        'identify.acoustidApiKey',
      )
    }
    if (!this._identifier) {
      this._identifier = new Identifier({
        acoustidApiKey: this.config.identify.acoustidApiKey,
        songrecBin: this.config.identify.songrecBin,
        fetch: this.sharedFetch,
      })
    }

    let match = await this._identifier.recognizeWithSongrec(filePath)

    if (!match) {
      const fp = await this._identifier.fingerprint(filePath)
      match = await this._identifier.lookup(fp.fingerprint, fp.duration)
    }

    if (!match) return null

    await this.ensureClients()
    const songs = await this.search(`${match.artist} ${match.title}`, { filter: 'songs' }) as Song[]
    return songs[0] ?? null
  }

  async streamPCM(id: string): Promise<NodeJS.ReadableStream> {
    await this.limiter.throttle('stream', (ep, waitMs) => this.emitter.emit('rateLimited', ep, waitMs))
    await this.ensureClients()
    const resolved = resolveInput(id)
    try {
      // Fast path: use cached/resolved stream URL → ffmpeg directly (~200ms startup).
      // Falls back to yt-dlp if getStream fails (e.g. cipher error, unsupported format).
      const streamData = await this.getStream(resolved)
      return this._downloader!.streamPCMFromUrl(streamData.url)
    } catch {
      return this._downloader!.streamPCM(resolved)
    }
  }

  async getPodcast(feedUrl: string): Promise<Podcast> {
    if (!this._podcast) this._podcast = new PodcastClient()
    return this._podcast.getFeed(feedUrl)
  }
}

// YouTube titles are messy ("Eminem - Rap God (Official Video) [Explicit]").
// Strip common suffixes so lyrics APIs can match cleanly.
const TITLE_NOISE = /\s*[\(\[【][^\)\]】]*(official|video|audio|lyrics?|explicit|instrumental|hq|hd|4k|live|cover|remix|remaster)[^\)\]】]*[\)\]】]/gi
const ARTIST_NOISE = /\s*([-–—].*|VEVO|Official|Music|Records?|Productions?)$/i

function sanitizeTitle(t: string): string {
  // "Artist - Title (Official)" → strip everything after " - " if title looks like it has artist prefix
  const dash = t.indexOf(' - ')
  const cleaned = dash !== -1 ? t.slice(dash + 3) : t
  return cleaned.replace(TITLE_NOISE, '').trim()
}

function sanitizeArtist(a: string): string {
  return a.replace(ARTIST_NOISE, '').trim()
}

