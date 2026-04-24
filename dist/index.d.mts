import { Innertube } from 'youtubei.js';

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
    visitorIdRefreshed: [oldId: string, newId: string];
    retry: [endpoint: string, attempt: number, reason: string];
    error: [error: Error];
};
type EventName$1 = keyof EventMap;
type Handler<E extends EventName$1> = (...args: EventMap[E]) => void;
declare class MusicKitEmitter {
    private handlers;
    on<E extends EventName$1>(event: E, handler: Handler<E>): void;
    off<E extends EventName$1>(event: E, handler: Handler<E>): void;
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
interface StreamingData {
    url: string;
    codec: 'opus' | 'mp4a';
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
interface DownloadOptions$1 {
    path?: string;
    format?: DownloadFormat$1;
    onProgress?: (percent: number) => void;
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
type SourceName = 'jiosaavn' | 'youtube';
type SourcePreference = 'default' | 'best' | SourceName[];
interface MusicKitConfig {
    logLevel?: LogLevel;
    logHandler?: (level: LogLevel, message: string) => void;
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
type MusicKitEvent = 'beforeRequest' | 'afterRequest' | 'cacheHit' | 'cacheMiss' | 'rateLimited' | 'visitorIdRefreshed' | 'retry' | 'error';

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
    getHome?(language?: string): Promise<Section[]>;
    getFeaturedPlaylists?(language?: string): Promise<Playlist[]>;
    getLyrics?(id: string): Promise<string | null>;
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
    private readonly searchCache;
    private readonly sourceOrder;
    readonly sources: AudioSource[];
    private _discovery;
    private _stream;
    private _downloader;
    private _ytPromise;
    constructor(config?: MusicKitConfig, _yt?: Innertube);
    static create(config?: MusicKitConfig): Promise<MusicKit>;
    registerSource(source: AudioSource): void;
    private sourceFor;
    private ensureClients;
    private call;
    on(event: EventName, handler: EventHandler<typeof event>): void;
    off(event: EventName, handler: EventHandler<typeof event>): void;
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
    getFeaturedPlaylists(options?: {
        language?: string;
        source?: SourceName;
    }): Promise<Playlist[]>;
    getArtist(channelId: string): Promise<Artist>;
    getAlbum(browseId: string): Promise<Album>;
    getPlaylist(playlistId: string): Promise<Playlist>;
    getRadio(videoId: string): Promise<Song[]>;
    getRelated(videoId: string): Promise<Song[]>;
    getSuggestions(id: string): Promise<Song[]>;
    getMetadata(id: string): Promise<Song>;
    getLyrics(id: string): Promise<string | null>;
    getCharts(options?: BrowseOptions): Promise<Section[]>;
    download(videoId: string, options?: DownloadOptions$1): Promise<void>;
    streamAudio(id: string): Promise<NodeJS.ReadableStream>;
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
    };
    private db;
    private readonly enabled;
    constructor(options: CacheOptions);
    get<T = unknown>(key: string): T | null;
    set(key: string, value: unknown, ttlSeconds: number): void;
    delete(key: string): void;
    isUrlExpired(url: string): boolean;
    close(): void;
}

declare class RateLimiter {
    private buckets;
    private lastRequestAt;
    private readonly minGapMs;
    private readonly limits;
    constructor(limits?: RateLimitConfig, minGapMs?: number);
    throttle(endpoint: string, onLimited?: (endpoint: string, waitMs: number) => void): Promise<void>;
    getWaitTime(endpoint: string): number;
    private enforceMinGap;
    private consumeToken;
    private getBucket;
    private refillIfNeeded;
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
    getCharts(options?: {
        country?: string;
    }): Promise<Section[]>;
}

declare class StreamResolver {
    private readonly cache;
    readonly yt: Innertube;
    constructor(cache: Cache, yt: Innertube);
    resolve(videoId: string, quality?: Quality | {
        codec?: string;
        quality?: Quality;
    }): Promise<StreamingData>;
}

type DownloadFormat = 'opus' | 'm4a';
interface DownloadOptions {
    path?: string;
    format?: DownloadFormat;
    onProgress?: (percent: number) => void;
    _mockSong?: Song;
    _mockReadStream?: NodeJS.ReadableStream;
}
declare class Downloader {
    private readonly resolver;
    private readonly discovery;
    constructor(resolver: StreamResolver, discovery: DiscoveryClient);
    streamAudio(videoId: string): NodeJS.ReadableStream;
    download(videoId: string, options?: DownloadOptions): Promise<void>;
    private fetchAndWrite;
    private readWithProgress;
}

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

declare const JIOSAAVN_LANGUAGES: Set<string>;

export { type Album, type Artist, type AudioTrack, type BrowseOptions, Cache, type CacheConfig, type CacheTTLConfig, DiscoveryClient, type DownloadFormat$1 as DownloadFormat, type DownloadOptions$1 as DownloadOptions, Downloader, HttpError, JIOSAAVN_LANGUAGES, type LogLevel, type MediaItem, MusicKit, type MusicKitConfig, MusicKitEmitter, type MusicKitError, MusicKitErrorCode, type MusicKitEvent, type MusicKitRequest, type Playlist, type Quality, type RateLimitConfig, RateLimiter, RetryEngine, SearchFilter, type SearchOptions, type SearchResults, type Section, SessionManager, type Song, type SourceName, type SourcePreference, type StreamOptions, type StreamQuality, StreamResolver, type StreamingData, type Thumbnail, getBestThumbnail, isStreamExpired };
