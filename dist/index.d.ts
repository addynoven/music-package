import { Innertube } from 'youtubei.js';

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
declare const SearchFilter: {
    readonly Songs: "songs";
    readonly Albums: "albums";
    readonly Artists: "artists";
    readonly Playlists: "playlists";
};
type SearchFilter = typeof SearchFilter[keyof typeof SearchFilter];
type Quality = 'high' | 'low';
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
interface RateLimitConfig {
    search?: number;
    browse?: number;
    stream?: number;
    autocomplete?: number;
}
interface CacheConfig {
    dir?: string;
    enabled?: boolean;
    ttl?: {
        stream?: number;
        search?: number;
        home?: number;
        artist?: number;
    };
}
interface MusicKitConfig {
    logLevel?: LogLevel;
    logHandler?: (level: LogLevel, message: string) => void;
    rateLimit?: RateLimitConfig;
    minRequestGap?: number;
    cache?: CacheConfig;
    visitorId?: string;
    userAgent?: string;
    language?: string;
    proxy?: string;
    maxRetries?: number;
    backoffBase?: number;
    backoffMax?: number;
}

declare class StreamResolver {
    private readonly cache;
    private readonly yt;
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
    constructor(resolver: StreamResolver);
    download(videoId: string, options?: DownloadOptions): Promise<void>;
    private fetchAndWrite;
    private readWithProgress;
}

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

type EventName = Parameters<MusicKitEmitter['on']>[0];
type EventHandler<E extends EventName> = Parameters<MusicKitEmitter['on']>[1] & ((...args: any[]) => void);
declare class MusicKit {
    private readonly cache;
    private readonly limiter;
    private readonly retry;
    private readonly session;
    private readonly emitter;
    private readonly searchCache;
    private _discovery;
    private _stream;
    private _downloader;
    private _ytPromise;
    constructor(config?: MusicKitConfig, _yt?: Innertube);
    static create(config?: MusicKitConfig): Promise<MusicKit>;
    private ensureClients;
    on(event: EventName, handler: EventHandler<typeof event>): void;
    off(event: EventName, handler: EventHandler<typeof event>): void;
    autocomplete(query: string): Promise<string[]>;
    search(query: string, options?: {
        filter?: SearchFilter;
    }): Promise<SearchResults | Song[] | Album[] | Artist[]>;
    getStream(videoId: string, options?: {
        quality?: Quality;
    }): Promise<StreamingData>;
    getTrack(videoId: string): Promise<AudioTrack>;
    getHome(): Promise<Section[]>;
    getArtist(channelId: string): Promise<Artist>;
    getAlbum(browseId: string): Promise<Album>;
    getRadio(videoId: string): Promise<Song[]>;
    getRelated(videoId: string): Promise<Song[]>;
    getCharts(options?: {
        country?: string;
    }): Promise<Section[]>;
    download(videoId: string, options?: Parameters<Downloader['download']>[1]): Promise<void>;
}

declare class RateLimiter {
    private buckets;
    private lastRequestAt;
    private readonly minGapMs;
    private readonly limits;
    constructor(limits?: RateLimitConfig, minGapMs?: number);
    throttle(endpoint: string): Promise<void>;
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
    autocomplete(query: string): Promise<string[]>;
    search(query: string, options?: {
        filter?: SearchFilter;
    }): Promise<SearchResults | Song[] | Album[] | Artist[]>;
    getHome(): Promise<Section[]>;
    getArtist(channelId: string): Promise<Artist>;
    getAlbum(browseId: string): Promise<Album>;
    getRadio(videoId: string): Promise<Song[]>;
    getRelated(videoId: string): Promise<Song[]>;
    getCharts(options?: {
        country?: string;
    }): Promise<Section[]>;
}

export { type Album, type Artist, type AudioTrack, Cache, type CacheConfig, DiscoveryClient, Downloader, HttpError, type LogLevel, MusicKit, type MusicKitConfig, MusicKitEmitter, type Playlist, type Quality, type RateLimitConfig, RateLimiter, RetryEngine, SearchFilter, type SearchResults, type Section, SessionManager, type Song, StreamResolver, type StreamingData, type Thumbnail };
