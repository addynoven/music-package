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
interface Lyrics {
    plain: string;
    synced: LyricLine[] | null;
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
    private _ytPromise;
    constructor(config?: MusicKitConfig, _yt?: Innertube);
    static create(config?: MusicKitConfig): Promise<MusicKit>;
    registerSource(source: AudioSource): void;
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
    getLyrics(id: string): Promise<Lyrics | null>;
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

declare class StreamResolver {
    private readonly cache;
    private readonly cookiesPath?;
    private readonly proxy?;
    private readonly yt?;
    private readonly onFallback?;
    constructor(cache: Cache, cookiesPath?: string | undefined, proxy?: string | undefined, yt?: Innertube | undefined, onFallback?: ((videoId: string, reason: string) => void) | undefined);
    /**
     * Resolves a stream URL.
     *
     * Chain (each step short-circuits on success):
     *   1. SQLite cache (~6h TTL) — `cache.get` then `isUrlExpired` check
     *   2. InnerTube fast-path via `resolveViaInnertube` — typically <500ms.
     *      Skipped if no Innertube instance was provided.
     *   3. yt-dlp shell-out — universal fallback (~2-3s). Used when (2) is
     *      unavailable or throws, or for tracks that genuinely can't be played
     *      from InnerTube (geo-blocked, age-restricted, etc.).
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

var version = "4.1.0";

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

type LyricsProviderName = 'better-lyrics' | 'lrclib' | 'lyrics-ovh' | 'kugou';
interface LyricsProvider {
    readonly name: LyricsProviderName;
    fetch(artist: string, title: string, duration?: number, fetchFn?: typeof globalThis.fetch): Promise<Lyrics | null>;
}

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

export { type Album, AlbumSchema, type Artist, ArtistSchema, type AudioTrack, BETTER_LYRICS_BASE, type BrowseOptions, Cache, type CacheConfig, type CacheTTLConfig, DiscoveryClient, type DownloadFormat$1 as DownloadFormat, type DownloadOptions$1 as DownloadOptions, type DownloadProgress, Downloader, HttpError, Identifier, type IdentifyResult, KUGOU_LYRICS_BASE, KUGOU_SEARCH_BASE, type LogLevel, Logger, type LyricLine, type LyricWord, type Lyrics, type LyricsProvider, type LyricsProviderName, type MediaItem, MusicKit, MusicKitBaseError, type MusicKitConfig, MusicKitEmitter, type MusicKitError, MusicKitErrorCode, type MusicKitEvent, type MusicKitRequest, NetworkError, NonRetryableError, NotFoundError, type Playlist, PlaylistSchema, type Podcast, PodcastClient, type PodcastEpisode, type Quality, Queue, type RateLimitConfig, RateLimitError, RateLimiter, type RepeatMode, RetryEngine, SearchFilter, type SearchOptions, type SearchResults, type Section, SessionManager, type Song, SongSchema, type SourceName, type SourcePreference, StreamError, type StreamOptions, type StreamQuality, StreamResolver, type StreamingData, type Thumbnail, ThumbnailSchema, ValidationError, type WordTime, betterLyricsProvider, fetchFromBetterLyrics, fetchFromKuGou, fetchFromLrclib, fetchFromLyricsOvh, formatTimestamp, getActiveLine, getActiveLineIndex, getBestThumbnail, isStreamExpired, kugouProvider, lrclibProvider, lyricsOvhProvider, offsetLrc, parseLrc, resolveInput, resolveSpotifyUrl, safeParseAlbum, safeParseArtist, safeParsePlaylist, safeParseSong, serializeLrc, version };
