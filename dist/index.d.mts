import { Innertube } from 'youtubei.js';
import { z } from 'zod';

type EventMap = {
    beforeRequest: [req: {
        method: string;
        endpoint: string;
        headers: Record<string, string>;
        body: unknown;
    }];
    afterRequest: [req: {
        method: string;
        endpoint: string;
        headers: Record<string, string>;
        body: unknown;
    }, durationMs: number, status: number];
    cacheHit: [key: string, ttlRemaining: number];
    cacheMiss: [key: string];
    rateLimited: [endpoint: string, waitMs: number];
    retry: [endpoint: string, attempt: number, reason: string];
    error: [error: Error];
};
type EventName$1 = keyof EventMap;
type Handler<E extends EventName$1> = (...args: EventMap[E]) => void;
declare class MusicKitEmitter {
    private handlers;
    private onceMap;
    on<E extends EventName$1>(event: E, handler: Handler<E>): void;
    off<E extends EventName$1>(event: E, handler: Handler<E>): void;
    once<E extends EventName$1>(event: E, handler: Handler<E>): void;
    emit<E extends EventName$1>(event: E, ...args: EventMap[E]): void;
}

interface Thumbnail {
    url: string;
    width: number;
    height: number;
}
interface Song {
    type: 'song';
    videoId: string;
    title: string;
    artist: string;
    album?: string;
    duration: number;
    thumbnails: Thumbnail[];
}
interface Album {
    type: 'album';
    browseId: string;
    title: string;
    artist: string;
    year?: string;
    thumbnails: Thumbnail[];
    tracks: Song[];
}
interface Artist {
    type: 'artist';
    channelId: string;
    name: string;
    subscribers?: string;
    thumbnails: Thumbnail[];
    songs: Song[];
    albums: Album[];
    singles: Album[];
}
interface Playlist {
    type: 'playlist';
    playlistId: string;
    title: string;
    thumbnails: Thumbnail[];
    songs?: Song[];
    songCount?: number;
}
interface Section {
    title: string;
    items: (Song | Album | Artist | Playlist)[];
}
interface WordTime {
    time: number;
    duration?: number;
    text: string;
}
/**
 * @deprecated Use `WordTime`. `LyricWord` is kept as an alias for v4.0.x compat.
 */
type LyricWord = WordTime;
interface LyricLine {
    time: number;
    text: string;
    words?: WordTime[];
}
type LyricsProviderName = 'better-lyrics' | 'lrclib' | 'lyrics-ovh' | 'kugou' | 'simpmusic' | 'youtube-native' | 'youtube-subtitle';
interface Lyrics {
    plain: string;
    synced: LyricLine[] | null;
    source?: LyricsProviderName;
}
interface StreamingData {
    url: string;
    codec: 'opus' | 'mp4a';
    mimeType: string;
    bitrate: number;
    expiresAt: number;
    loudnessDb?: number;
    sizeBytes?: number;
}
interface AudioTrack extends Song {
    stream: StreamingData;
}
interface SearchResults {
    songs: Song[];
    albums: Album[];
    artists: Artist[];
    playlists: Playlist[];
}
type MediaItem = Song | Album | Artist | Playlist;
declare const SearchFilter: {
    readonly Songs: "songs";
    readonly Albums: "albums";
    readonly Artists: "artists";
    readonly Playlists: "playlists";
};
type SearchFilter = typeof SearchFilter[keyof typeof SearchFilter];
type Quality = 'high' | 'low';
type StreamQuality = Quality;
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
type DownloadFormat$1 = 'opus' | 'm4a';
interface SearchOptions {
    filter?: SearchFilter;
}
interface StreamOptions {
    quality?: Quality;
}
interface DownloadProgress {
    percent: number;
    bytesDownloaded: number;
    totalBytes?: number;
    filename: string;
}
interface DownloadOptions$1 {
    path?: string;
    format?: DownloadFormat$1;
    onProgress?: (progress: DownloadProgress) => void;
}
interface BrowseOptions {
    country?: string;
}
interface RateLimitConfig {
    search?: number;
    browse?: number;
    stream?: number;
    autocomplete?: number;
}
interface CacheTTLConfig {
    stream?: number;
    search?: number;
    home?: number;
    artist?: number;
}
interface CacheConfig {
    dir?: string;
    enabled?: boolean;
    ttl?: CacheTTLConfig;
}
type SourceName = 'youtube';
type SourcePreference = 'best' | SourceName[];
/** Spec entry: built-in name string OR a custom LyricsProvider implementation. */
type LyricsProviderSpec = LyricsProviderName | {
    name: LyricsProviderName;
    fetch: (...args: unknown[]) => Promise<Lyrics | null>;
};
interface LyricsConfig {
    /**
     * Override the default lyrics provider chain.
     *
     * Pass an array of built-in provider names in your preferred order, or
     * mix in custom `LyricsProvider` instances. Omitted providers are
     * disabled.
     *
     * Default order (when undefined):
     *   ['better-lyrics', 'lrclib', 'simpmusic', 'youtube-native',
     *    'kugou', 'lyrics-ovh', 'youtube-subtitle']
     */
    providers?: LyricsProviderSpec[];
}
interface MusicKitConfig {
    logLevel?: LogLevel;
    logHandler?: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
    rateLimit?: RateLimitConfig;
    minRequestGap?: number;
    cache?: CacheConfig;
    visitorId?: string;
    userAgent?: string;
    language?: string;
    location?: string;
    proxy?: string;
    maxRetries?: number;
    backoffBase?: number;
    backoffMax?: number;
    sourceOrder?: SourcePreference;
    cookiesPath?: string;
    youtubeApiKey?: string;
    identify?: {
        acoustidApiKey: string;
        songrecBin?: string;
    };
    /**
     * Static PoToken passed to every InnerTube client that needs one.
     * Most content streams without a PoToken via ANDROID_VR; web clients
     * increasingly require one. Provide either a static token or a
     * `getPoToken` callback. If both are set, `getPoToken` wins.
     */
    poToken?: string;
    /**
     * Async PoToken generator — called per (videoId, client) when a
     * PoToken is needed. Return null to skip PoToken for that call.
     * Use this when your PoToken comes from an external service or a
     * puppeteer-based generator.
     */
    getPoToken?: (videoId: string, client: string) => Promise<string | null>;
    /**
     * Lyrics provider chain configuration. See `LyricsConfig`.
     */
    lyrics?: LyricsConfig;
}
interface MusicKitRequest {
    method: string;
    endpoint: string;
    headers: Record<string, string>;
    body: unknown;
}
declare const MusicKitErrorCode: {
    readonly RateLimited: "RATE_LIMITED";
    readonly Forbidden: "FORBIDDEN";
    readonly VideoUnavailable: "VIDEO_UNAVAILABLE";
    readonly VideoUnplayable: "VIDEO_UNPLAYABLE";
    readonly CipherFailure: "CIPHER_FAILURE";
    readonly NetworkError: "NETWORK_ERROR";
    readonly ParseError: "PARSE_ERROR";
    readonly DownloadError: "DOWNLOAD_ERROR";
    readonly Unknown: "UNKNOWN";
};
type MusicKitErrorCode = typeof MusicKitErrorCode[keyof typeof MusicKitErrorCode];
interface MusicKitError extends Error {
    code: MusicKitErrorCode;
    endpoint?: string;
    statusCode?: number;
}
type MusicKitEvent = 'beforeRequest' | 'afterRequest' | 'cacheHit' | 'cacheMiss' | 'rateLimited' | 'retry' | 'error';
interface PodcastEpisode {
    type: 'episode';
    guid: string;
    title: string;
    description: string;
    url: string;
    mimeType: string;
    duration: number;
    publishedAt: string;
    thumbnails: Thumbnail[];
    season?: number;
    episode?: number;
    explicit: boolean;
}
interface Podcast {
    type: 'podcast';
    feedUrl: string;
    title: string;
    description: string;
    author: string;
    language: string;
    link: string;
    thumbnails: Thumbnail[];
    episodes: PodcastEpisode[];
}

interface LyricsProvider {
    readonly name: LyricsProviderName;
    fetch(artist: string, title: string, duration?: number, fetchFn?: typeof globalThis.fetch, videoId?: string): Promise<Lyrics | null>;
}

/**
 * Where to insert a provider when registering at runtime.
 *   'first'           — insert at the start of the chain (highest priority)
 *   'last' (default)  — append at the end
 *   'before:<name>'   — insert immediately before the given provider name
 *   'after:<name>'    — insert immediately after the given provider name
 */
type RegistryPosition = 'first' | 'last' | `before:${LyricsProviderName}` | `after:${LyricsProviderName}`;
declare class LyricsRegistry {
    private providers;
    constructor(initial?: LyricsProvider[]);
    /** Returns the providers in their current order. */
    list(): LyricsProvider[];
    /** Returns the names of registered providers in order. */
    names(): LyricsProviderName[];
    /** Returns the named provider or undefined. */
    get(name: LyricsProviderName): LyricsProvider | undefined;
    /**
     * Adds a provider at the given position. If a provider with the same name is
     * already registered, it is removed first (re-register replaces).
     * Throws if position references an unknown provider name.
     */
    register(provider: LyricsProvider, position?: RegistryPosition): void;
    /** Removes a provider by name. Returns true if it was registered. */
    unregister(name: LyricsProviderName): boolean;
    /**
     * Replaces the entire chain. Useful for config-driven setup.
     * Each entry can be:
     *  - A LyricsProvider instance, OR
     *  - A LyricsProviderName referencing a built-in (looked up via the
     *    `builtins` map passed in)
     * Unknown name strings throw a ValidationError.
     */
    replace(spec: ReadonlyArray<LyricsProvider | LyricsProviderName>, builtins: ReadonlyMap<LyricsProviderName, LyricsProvider>): void;
}

interface AudioSource {
    readonly name: string;
    canHandle(query: string): boolean;
    search(query: string, options?: {
        filter?: SearchFilter;
        limit?: number;
    }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]>;
    getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData>;
    getMetadata(id: string): Promise<Song>;
    getAlbum?(id: string): Promise<Album>;
    getArtist?(id: string): Promise<Artist>;
    getPlaylist?(id: string): Promise<Playlist>;
    getRadio?(id: string): Promise<Song[]>;
    getRelated?(id: string): Promise<Song[]>;
    getHome?(): Promise<Section[]>;
    getCharts?(options?: BrowseOptions): Promise<Section[]>;
    getMoodCategories?(): Promise<{
        title: string;
        params: string;
    }[]>;
    getMoodPlaylists?(params: string): Promise<Section[]>;
    autocomplete?(query: string): Promise<string[]>;
}

type EventName = Parameters<MusicKitEmitter['on']>[0];
type EventHandler<E extends EventName> = Parameters<MusicKitEmitter['on']>[1] & ((...args: any[]) => void);
declare class MusicKit {
    private readonly config;
    private readonly cache;
    private readonly limiter;
    private readonly retry;
    private readonly session;
    private readonly emitter;
    private readonly log;
    private readonly sharedFetch;
    private readonly innerTubeFetch;
    private readonly searchCache;
    private readonly sourceOrder;
    private static readonly SEARCH_CACHE_MAX;
    private searchCacheSet;
    private searchCacheGet;
    readonly sources: AudioSource[];
    private _discovery;
    private _stream;
    private _downloader;
    private _identifier;
    private _podcast;
    private _poolPromise;
    private _lyrics;
    constructor(config?: MusicKitConfig, _yt?: unknown);
    static create(config?: MusicKitConfig): Promise<MusicKit>;
    registerSource(source: AudioSource): void;
    /**
     * Adds a custom or built-in `LyricsProvider` to the active lyrics chain.
     * Has no effect if `ensureClients()` hasn't run yet — call after the first
     * SDK method, or instantiate with `MusicKit.create()` so the registry is
     * eagerly initialised.
     *
     *   mk.registerLyricsProvider(myGeniusProvider)              // append
     *   mk.registerLyricsProvider(myProvider, 'first')           // prepend
     *   mk.registerLyricsProvider(myProvider, 'before:lrclib')   // ordered insert
     */
    registerLyricsProvider(provider: LyricsProvider, position?: RegistryPosition): void;
    private sourceFor;
    private pickSearchSource;
    private tryEachSource;
    private ensureClients;
    private readonly onStreamFallback;
    private call;
    on(event: EventName, handler: EventHandler<typeof event>): void;
    off(event: EventName, handler: EventHandler<typeof event>): void;
    once(event: EventName, handler: EventHandler<typeof event>): void;
    autocomplete(query: string): Promise<string[]>;
    search(query: string, options: {
        filter: 'songs';
        limit?: number;
        source?: SourceName;
    }): Promise<Song[]>;
    search(query: string, options: {
        filter: 'albums';
        limit?: number;
        source?: SourceName;
    }): Promise<Album[]>;
    search(query: string, options: {
        filter: 'artists';
        limit?: number;
        source?: SourceName;
    }): Promise<Artist[]>;
    search(query: string, options: {
        filter: 'playlists';
        limit?: number;
        source?: SourceName;
    }): Promise<Playlist[]>;
    search(query: string, options?: {
        filter?: SearchFilter;
        limit?: number;
        source?: SourceName;
    }): Promise<SearchResults>;
    getStream(videoId: string, options?: {
        quality?: Quality;
    }): Promise<StreamingData>;
    getTrack(videoId: string): Promise<AudioTrack>;
    getHome(options?: {
        language?: string;
        source?: SourceName;
    }): Promise<Section[]>;
    getArtist(channelId: string): Promise<Artist>;
    getAlbum(browseId: string): Promise<Album>;
    getPlaylist(playlistId: string): Promise<Playlist>;
    getRadio(videoId: string): Promise<Song[]>;
    getRelated(videoId: string): Promise<Song[]>;
    getSuggestions(id: string): Promise<Song[]>;
    getMetadata(id: string): Promise<Song>;
    /**
     * Fetches lyrics for a song.
     *
     * Walks the configured provider chain in order; the first non-null result
     * wins. Pass `options.providers` to override the chain for this call only
     * (built-in name strings or custom `LyricsProvider` instances).
     *
     *   mk.getLyrics('dQw4w9WgXcQ')
     *   mk.getLyrics(id, { providers: ['lrclib', 'kugou'] })  // synced-only
     *
     * The returned `Lyrics.source` field reports which provider produced the
     * result.
     */
    getLyrics(id: string, options?: {
        providers?: LyricsProviderSpec[];
    }): Promise<Lyrics | null>;
    /** Built-in providers map — keyed by name. YT-backed providers are bound to `yt`. */
    private builtinLyricsProviders;
    /**
     * Default chain — synced-with-words first, plain-only fallbacks later,
     * auto-captions last. Region-specific providers (KuGou for Chinese music)
     * sit mid-chain so they don't dominate but also don't get drowned by
     * lyrics.ovh's plain-only fallback.
     */
    private defaultLyricsChain;
    private buildLyricsRegistry;
    /** Resolves a mixed name/instance spec to concrete LyricsProvider instances. */
    private specToProviders;
    /**
     * Returns the builtins map currently bound to the active registry's
     * `yt` instance. If the registry hasn't been initialised yet (`_lyrics`
     * is null), returns a map of providers that don't need `yt` only —
     * the YT-backed ones are omitted, and resolving a YT name string in that
     * window will throw a clear error.
     */
    private activeBuiltins;
    getCharts(options?: BrowseOptions): Promise<Section[]>;
    getMoodCategories(): Promise<{
        title: string;
        params: string;
    }[]>;
    getMoodPlaylists(params: string): Promise<Section[]>;
    download(videoId: string, options?: DownloadOptions$1): Promise<void>;
    streamAudio(id: string): Promise<NodeJS.ReadableStream>;
    identify(filePath: string): Promise<Song | null>;
    streamPCM(id: string): Promise<NodeJS.ReadableStream>;
    getPodcast(feedUrl: string): Promise<Podcast>;
}

interface CacheOptions {
    enabled: boolean;
    path?: string;
}
declare class Cache {
    static readonly TTL: {
        readonly STREAM: 21600;
        readonly SEARCH: 300;
        readonly HOME: 28800;
        readonly ARTIST: 3600;
        readonly VISITOR_ID: 2592000;
        readonly LYRICS: 315360000;
    };
    private db;
    private readonly enabled;
    private hits;
    private misses;
    constructor(options: CacheOptions);
    get<T = unknown>(key: string): T | null;
    set(key: string, value: unknown, ttlSeconds: number): void;
    delete(key: string): void;
    isUrlExpired(url: string): boolean;
    sweep(): number;
    getStats(): {
        hits: number;
        misses: number;
        keys: number;
    };
    close(): void;
}

declare class RateLimiter {
    private buckets;
    private lastRequestAt;
    private readonly minGapMs;
    private readonly limits;
    constructor(limits?: RateLimitConfig, minGapMs?: number);
    throttle(endpoint: string, onLimited?: (endpoint: string, waitMs: number) => void, weight?: number): Promise<void>;
    getWaitTime(endpoint: string): number;
    private enforceMinGap;
    private consumeToken;
    private getBucket;
    private refillIfNeeded;
}

declare class NonRetryableError extends Error {
    constructor(message: string);
}
declare class HttpError extends Error {
    readonly statusCode: number;
    constructor(statusCode: number, message: string);
}
interface RetryOptions {
    onRateLimited?: (waitMs: number) => void;
    onForbidden?: () => Promise<void>;
    onRetry?: (endpoint: string, attempt: number, reason: string) => void;
}
interface RetryEngineConfig {
    maxAttempts: number;
    backoffBase: number;
    backoffMax?: number;
    onRetry?: (attempt: number, delayMs: number) => void;
}
declare class RetryEngine {
    private readonly config;
    constructor(config: RetryEngineConfig);
    execute<T>(fn: () => Promise<T>, _endpoint: string, options?: RetryOptions): Promise<T>;
}

declare class MusicKitBaseError extends Error {
    readonly code: string;
    constructor(message: string, code: string, cause?: unknown);
}
declare class NotFoundError extends MusicKitBaseError {
    readonly resourceId?: string;
    constructor(message: string, resourceId?: string);
}
declare class RateLimitError extends MusicKitBaseError {
    readonly retryAfterMs?: number;
    constructor(message: string, retryAfterMs?: number);
}
declare class NetworkError extends MusicKitBaseError {
    readonly statusCode?: number;
    constructor(message: string, statusCode?: number, cause?: unknown);
}
declare class ValidationError extends MusicKitBaseError {
    readonly field: string;
    constructor(message: string, field: string);
}
declare class StreamError extends MusicKitBaseError {
    readonly videoId: string;
    constructor(message: string, videoId: string, cause?: unknown);
}

interface SessionOptions {
    visitorId?: string;
    userAgent?: string;
}
declare class SessionManager {
    private readonly cache;
    private readonly options;
    constructor(cache: Cache, options?: SessionOptions);
    getVisitorId(): Promise<string>;
    refreshVisitorId(): Promise<string>;
    buildHeaders(): Promise<Record<string, string>>;
    private fetchAndCache;
}

declare class DiscoveryClient {
    private readonly yt;
    constructor(yt: Innertube);
    getInfo(videoId: string): Promise<Song>;
    autocomplete(query: string): Promise<string[]>;
    search(query: string, options?: {
        filter?: SearchFilter;
        limit?: number;
    }): Promise<SearchResults | Song[] | Album[] | Artist[] | Playlist[]>;
    getHome(): Promise<Section[]>;
    getArtist(channelId: string): Promise<Artist>;
    getAlbum(browseId: string): Promise<Album>;
    getPlaylist(playlistId: string): Promise<Playlist>;
    getRadio(videoId: string): Promise<Song[]>;
    getRelated(videoId: string): Promise<Song[]>;
    getMoodCategories(): Promise<{
        title: string;
        params: string;
    }[]>;
    getMoodPlaylists(params: string): Promise<Section[]>;
    getCharts(options?: {
        country?: string;
    }): Promise<Section[]>;
}

type StreamClient = 'YTMUSIC' | 'ANDROID_VR' | 'TVHTML5' | 'WEB_REMIX';

interface InnertubePoolOptions {
    /** Fetch override (proxy + session headers) — same one passed to existing Innertube.create */
    fetch?: typeof globalThis.fetch;
    /** Cookie header string for authenticated sessions */
    cookie?: string;
    /** Locale */
    lang?: string;
    /** Country */
    location?: string;
    /**
     * Static PoToken — NOT passed at session-create time (Innertube doesn't accept it
     * there in a meaningful way for per-request use). Stored here for caller retrieval;
     * the resolver passes it per-call.
     */
    poToken?: string;
    /**
     * Async PoToken generator — called per (videoId, client) when poToken is needed.
     * NOT passed at session-create time; resolver passes it per-call.
     */
    getPoToken?: (videoId: string, client: StreamClient) => Promise<string | null>;
}
/**
 * Lazy pool of `Innertube` instances keyed by client type. Each client is
 * created on first use and cached for the pool's lifetime.
 *
 * @example
 * ```ts
 * const pool = new InnertubePool({ lang: 'en', location: 'US' })
 * const yt = await pool.get('ANDROID_VR')   // created + cached
 * await pool.get('ANDROID_VR')              // returns same instance (no second create)
 * pool.has('TVHTML5')                        // false — not loaded yet
 * pool.clients()                             // ['ANDROID_VR']
 * await pool.close()                         // clears the cache
 * ```
 *
 * PoToken note: `poToken` / `getPoToken` in options are NOT passed to
 * `Innertube.create`. They are stored for callers to retrieve and pass
 * per-request (e.g. via `resolveViaInnertube`). Different clients have
 * different PoToken requirements; ANDROID_VR notably does not need one.
 */
declare class InnertubePool {
    private readonly options;
    private readonly cache;
    constructor(options?: InnertubePoolOptions);
    /**
     * Returns a cached `Innertube` instance for the given client, creating one
     * on first use. Concurrent calls for the same client share one in-flight
     * `Innertube.create` promise.
     */
    get(client: StreamClient): Promise<Innertube>;
    /**
     * Returns `true` if a (resolved or pending) entry exists for the given client.
     */
    has(client: StreamClient): boolean;
    /**
     * Returns the list of client types that have been loaded (resolved or pending).
     */
    clients(): StreamClient[];
    /**
     * Clears the pool. Subsequent `get` calls will re-create instances.
     * Returns a Promise for symmetry with potential future async cleanup.
     */
    close(): Promise<void>;
}

declare class StreamResolver {
    private readonly cache;
    private readonly cookiesPath?;
    private readonly proxy?;
    private readonly pool?;
    private readonly onFallback?;
    constructor(cache: Cache, cookiesPath?: string | undefined, proxy?: string | undefined, pool?: InnertubePool | undefined, onFallback?: ((videoId: string, reason: string) => void) | undefined);
    /**
     * Resolves a stream URL.
     *
     * Chain (each step short-circuits on success):
     *   1. SQLite cache (~6h TTL) — `cache.get` then `isUrlExpired` check
     *   2. InnerTube fast-path via `tryClients` walking `STREAM_CLIENT_FALLBACK_ORDER`.
     *      Each client is fetched from the pool then passed to `resolveViaInnertube`.
     *      Skipped if no InnertubePool was provided.
     *   3. yt-dlp shell-out — universal fallback (~2-3s). Used when (2) is
     *      unavailable or all clients failed, or for tracks that genuinely can't
     *      be played from InnerTube (geo-blocked, age-restricted, etc.).
     */
    resolve(videoId: string, quality?: Quality | {
        codec?: string;
        quality?: Quality;
    }): Promise<StreamingData>;
}

type DownloadFormat = 'opus' | 'm4a';
interface DownloadOptions {
    path?: string;
    format?: DownloadFormat;
    onProgress?: (progress: DownloadProgress) => void;
    _mockSong?: Song;
    _mockReadStream?: NodeJS.ReadableStream;
}
declare class Downloader {
    private readonly resolver;
    private readonly discovery;
    private readonly cookiesPath?;
    private readonly proxy?;
    constructor(resolver: StreamResolver, discovery: DiscoveryClient, cookiesPath?: string | undefined, proxy?: string | undefined);
    streamAudio(videoId: string): NodeJS.ReadableStream;
    streamPCMFromUrl(url: string): NodeJS.ReadableStream;
    streamPCM(videoId: string): NodeJS.ReadableStream;
    download(videoId: string, options?: DownloadOptions): Promise<void>;
    private fetchAndWrite;
    private readWithProgress;
}

type RepeatMode = 'off' | 'one' | 'all';
declare class Queue<T extends Song = Song> {
    private _current;
    private _upcoming;
    private _history;
    repeat: RepeatMode;
    get current(): T | null;
    get upcoming(): T[];
    get history(): T[];
    get size(): number;
    get isEmpty(): boolean;
    add(track: T): void;
    playNext(track: T): void;
    next(): T | null;
    previous(): T | null;
    clear(): void;
    remove(index: number): void;
    move(from: number, to: number): void;
    skipTo(index: number): void;
    shuffle(): void;
}

interface IdentifyResult {
    artist: string;
    title: string;
    score: number;
}
interface IdentifierOptions {
    acoustidApiKey: string;
    songrecBin?: string;
    fetch?: typeof globalThis.fetch;
}
declare class Identifier {
    private readonly options;
    constructor(options: IdentifierOptions);
    lookup(fingerprint: string, duration: number): Promise<IdentifyResult | null>;
    fingerprint(filePath: string): Promise<{
        fingerprint: string;
        duration: number;
    }>;
    recognizeWithSongrec(filePath: string): Promise<IdentifyResult | null>;
    private getAudioDuration;
    private extractClip;
}

interface LoggerConfig {
    logLevel?: LogLevel;
    logHandler?: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
}
declare class Logger {
    private readonly level;
    private readonly handler?;
    constructor(config?: LoggerConfig);
    private log;
    error(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
}

var version = "4.2.1";

/**
 * Returns the thumbnail whose width is closest to targetSize.
 * Falls back to the first thumbnail when all widths are 0.
 * Returns null for an empty array.
 */
declare function getBestThumbnail(thumbnails: Thumbnail[], targetSize: number): Thumbnail | null;

/**
 * Returns true if the stream URL has expired or will expire within 5 minutes.
 */
declare function isStreamExpired(stream: StreamingData): boolean;

/**
 * Resolves any URL to the canonical ID or query string the source pipeline expects.
 *
 * youtube.com/watch?v=ID, youtu.be/ID       → "ID"
 * music.youtube.com/watch?v=ID              → "ID"
 * music.youtube.com/browse/BROWSE_ID        → "BROWSE_ID"
 * music.youtube.com/playlist?list=ID        → "ID"
 * music.youtube.com/search?q=QUERY          → decoded query string
 * Everything else                           → input unchanged
 */
declare function resolveInput(input: string): string;
/**
 * Resolves a Spotify track URL to a "Title Artist" search query by scraping
 * the open.spotify.com page title. Returns null for non-track URLs or failures.
 */
declare function resolveSpotifyUrl(url: string): Promise<string | null>;

declare class PodcastClient {
    getFeed(url: string): Promise<Podcast>;
    parse(xml: string, feedUrl: string): Promise<Podcast>;
}

declare function parseLrc(lrc: string): LyricLine[];
declare function getActiveLineIndex(lines: LyricLine[], currentTime: number): number;
declare function getActiveLine(lines: LyricLine[], currentTime: number): LyricLine | null;
declare function formatTimestamp(seconds: number): string;
declare function offsetLrc(lines: LyricLine[], offsetMs: number): LyricLine[];
declare function serializeLrc(lines: LyricLine[]): string;

declare const BETTER_LYRICS_BASE = "https://lyrics-api.boidu.dev";
declare function fetchFromBetterLyrics(artist: string, title: string, duration?: number, fetchFn?: typeof globalThis.fetch): Promise<Lyrics | null>;
declare const betterLyricsProvider: LyricsProvider;

declare function fetchFromLrclib(artist: string, title: string, duration?: number, fetchFn?: typeof fetch): Promise<Lyrics | null>;

declare const lrclibProvider: LyricsProvider;

declare function fetchFromLyricsOvh(artist: string, title: string, fetchFn?: typeof fetch): Promise<Lyrics | null>;

declare const lyricsOvhProvider: LyricsProvider;

declare const KUGOU_SEARCH_BASE = "https://mobileservice.kugou.com";
declare const KUGOU_LYRICS_BASE = "https://lyrics.kugou.com";
declare function fetchFromKuGou(artist: string, title: string, duration?: number, fetchFn?: typeof globalThis.fetch): Promise<Lyrics | null>;
declare const kugouProvider: LyricsProvider;

/**
 * Fetches lyrics from SimpMusic. Tries title+artist lookup first, then
 * falls back to videoId-based lookup if the first returns no syncedLyric.
 *
 * Returns null on any error or no usable result.
 */
declare function fetchFromSimpMusic(artist: string, title: string, duration?: number, fetchFn?: typeof globalThis.fetch, videoId?: string): Promise<Lyrics | null>;
declare const simpMusicProvider: LyricsProvider;

/**
 * Fetches lyrics from YouTube Music's first-party lyrics tab via InnerTube.
 *
 * API path used:
 *   yt.music.getLyrics(videoId)
 *   → MusicDescriptionShelf | undefined   (node_modules/youtubei.js/dist/src/core/clients/Music.d.ts:31)
 *   → shelf.description.toString()        (MusicDescriptionShelf.description is a Text instance)
 *
 * Returns plain text only — YTM native lyrics have no timestamps.
 *
 * Wave 2 must do:
 *   - Add 'youtube-native' to LyricsProviderName union in src/lyrics/provider.ts
 *   - Export YouTubeNativeLyricsProvider from src/index.ts
 *   - Instantiate with the Innertube instance in MusicKit.ensureClients()
 *   - Add to getLyrics provider chain (passing the resolved videoId as the 5th arg)
 */
declare class YouTubeNativeLyricsProvider implements LyricsProvider {
    private readonly yt;
    readonly name: LyricsProviderName;
    constructor(yt: Innertube);
    fetch(_artist: string, _title: string, _duration?: number, _fetchFn?: typeof globalThis.fetch, videoId?: string): Promise<Lyrics | null>;
}

/**
 * YouTube transcript/subtitle provider — last-resort fallback.
 *
 * Uses `yt.music.getInfo(videoId).getTranscript()` to retrieve auto-captions
 * or manually-uploaded captions for a YouTube video. For music videos the
 * transcript is essentially a synced lyrics track. Auto-captions are imperfect
 * (mishears, no punctuation) but offer universal coverage when every other
 * provider fails.
 *
 * Requires a `videoId` — without one the provider immediately returns null.
 */
declare class YouTubeSubtitleLyricsProvider implements LyricsProvider {
    private readonly yt;
    readonly name: LyricsProviderName;
    constructor(yt: Innertube);
    fetch(_artist: string, _title: string, _duration?: number, _fetchFn?: typeof globalThis.fetch, videoId?: string): Promise<Lyrics | null>;
}

declare const ThumbnailSchema: z.ZodObject<{
    url: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strip>;
declare const SongSchema: z.ZodObject<{
    type: z.ZodLiteral<"song">;
    videoId: z.ZodString;
    title: z.ZodString;
    artist: z.ZodString;
    duration: z.ZodNumber;
    thumbnails: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>>;
    album: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const AlbumSchema: z.ZodObject<{
    type: z.ZodLiteral<"album">;
    browseId: z.ZodString;
    title: z.ZodString;
    artist: z.ZodString;
    year: z.ZodOptional<z.ZodString>;
    thumbnails: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>>;
    tracks: z.ZodArray<z.ZodAny>;
}, z.core.$strip>;
declare const ArtistSchema: z.ZodObject<{
    type: z.ZodLiteral<"artist">;
    channelId: z.ZodString;
    name: z.ZodString;
    thumbnails: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>>;
    songs: z.ZodArray<z.ZodAny>;
    albums: z.ZodArray<z.ZodAny>;
    singles: z.ZodArray<z.ZodAny>;
}, z.core.$strip>;
declare const PlaylistSchema: z.ZodObject<{
    type: z.ZodLiteral<"playlist">;
    playlistId: z.ZodString;
    title: z.ZodString;
    thumbnails: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
declare function safeParseSong(data: unknown): Song | null;
declare function safeParseAlbum(data: unknown): Album | null;
declare function safeParseArtist(data: unknown): Artist | null;
declare function safeParsePlaylist(data: unknown): Playlist | null;

export { type Album, AlbumSchema, type Artist, ArtistSchema, type AudioTrack, BETTER_LYRICS_BASE, type BrowseOptions, Cache, type CacheConfig, type CacheTTLConfig, DiscoveryClient, type DownloadFormat$1 as DownloadFormat, type DownloadOptions$1 as DownloadOptions, type DownloadProgress, Downloader, HttpError, Identifier, type IdentifyResult, KUGOU_LYRICS_BASE, KUGOU_SEARCH_BASE, type LogLevel, Logger, type LyricLine, type LyricWord, type Lyrics, type LyricsProvider, type LyricsProviderName, LyricsRegistry, type MediaItem, MusicKit, MusicKitBaseError, type MusicKitConfig, MusicKitEmitter, type MusicKitError, MusicKitErrorCode, type MusicKitEvent, type MusicKitRequest, NetworkError, NonRetryableError, NotFoundError, type Playlist, PlaylistSchema, type Podcast, PodcastClient, type PodcastEpisode, type Quality, Queue, type RateLimitConfig, RateLimitError, RateLimiter, type RegistryPosition, type RepeatMode, RetryEngine, SearchFilter, type SearchOptions, type SearchResults, type Section, SessionManager, type Song, SongSchema, type SourceName, type SourcePreference, StreamError, type StreamOptions, type StreamQuality, StreamResolver, type StreamingData, type Thumbnail, ThumbnailSchema, ValidationError, type WordTime, YouTubeNativeLyricsProvider, YouTubeSubtitleLyricsProvider, betterLyricsProvider, fetchFromBetterLyrics, fetchFromKuGou, fetchFromLrclib, fetchFromLyricsOvh, fetchFromSimpMusic, formatTimestamp, getActiveLine, getActiveLineIndex, getBestThumbnail, isStreamExpired, kugouProvider, lrclibProvider, lyricsOvhProvider, offsetLrc, parseLrc, resolveInput, resolveSpotifyUrl, safeParseAlbum, safeParseArtist, safeParsePlaylist, safeParseSong, serializeLrc, simpMusicProvider, version };
