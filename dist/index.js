"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AlbumSchema: () => AlbumSchema,
  ArtistSchema: () => ArtistSchema,
  Cache: () => Cache,
  DiscoveryClient: () => DiscoveryClient,
  Downloader: () => Downloader,
  HttpError: () => HttpError,
  Identifier: () => Identifier,
  Logger: () => Logger,
  MusicKit: () => MusicKit,
  MusicKitBaseError: () => MusicKitBaseError,
  MusicKitEmitter: () => MusicKitEmitter,
  MusicKitErrorCode: () => MusicKitErrorCode,
  NetworkError: () => NetworkError,
  NonRetryableError: () => NonRetryableError,
  NotFoundError: () => NotFoundError,
  PlaylistSchema: () => PlaylistSchema,
  PodcastClient: () => PodcastClient,
  Queue: () => Queue,
  RateLimitError: () => RateLimitError,
  RateLimiter: () => RateLimiter,
  RetryEngine: () => RetryEngine,
  SearchFilter: () => SearchFilter,
  SessionManager: () => SessionManager,
  SongSchema: () => SongSchema,
  StreamError: () => StreamError,
  StreamResolver: () => StreamResolver,
  ThumbnailSchema: () => ThumbnailSchema,
  ValidationError: () => ValidationError,
  formatTimestamp: () => formatTimestamp,
  getActiveLine: () => getActiveLine,
  getActiveLineIndex: () => getActiveLineIndex,
  getBestThumbnail: () => getBestThumbnail,
  isStreamExpired: () => isStreamExpired,
  offsetLrc: () => offsetLrc,
  parseLrc: () => parseLrc,
  resolveInput: () => resolveInput,
  resolveSpotifyUrl: () => resolveSpotifyUrl,
  safeParseAlbum: () => safeParseAlbum,
  safeParseArtist: () => safeParseArtist,
  safeParsePlaylist: () => safeParsePlaylist,
  safeParseSong: () => safeParseSong,
  serializeLrc: () => serializeLrc,
  version: () => version
});
module.exports = __toCommonJS(index_exports);

// src/musickit/index.ts
var import_youtubei = require("youtubei.js");

// src/cache/index.ts
var import_node_sqlite = require("node:sqlite");
var URL_EXPIRY_BUFFER = 1800;
var Cache = class {
  constructor(options) {
    this.db = null;
    this.hits = 0;
    this.misses = 0;
    this.enabled = options.enabled;
    if (!this.enabled) return;
    this.db = new import_node_sqlite.DatabaseSync(options.path ?? ":memory:");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    this.sweep();
  }
  get(key) {
    if (!this.enabled || !this.db) return null;
    const row = this.db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(key);
    if (!row) {
      this.misses++;
      return null;
    }
    if (Date.now() > row.expires_at) {
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return JSON.parse(row.value);
  }
  set(key, value, ttlSeconds) {
    if (!this.enabled || !this.db) return;
    this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, expires_at)
      VALUES (?, ?, ?)
    `).run(key, JSON.stringify(value), Date.now() + ttlSeconds * 1e3);
  }
  delete(key) {
    if (!this.enabled || !this.db) return;
    this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
  }
  isUrlExpired(url) {
    try {
      const expire = new URL(url).searchParams.get("expire");
      if (!expire) return true;
      const expiresAt = parseInt(expire, 10);
      const nowSeconds = Math.floor(Date.now() / 1e3);
      return nowSeconds >= expiresAt - URL_EXPIRY_BUFFER;
    } catch {
      return true;
    }
  }
  sweep() {
    if (!this.enabled || !this.db) return 0;
    const result = this.db.prepare("DELETE FROM cache WHERE expires_at < ?").run(Date.now());
    return result.changes;
  }
  getStats() {
    if (!this.enabled || !this.db) return { hits: 0, misses: 0, keys: 0 };
    const row = this.db.prepare("SELECT COUNT(*) as count FROM cache WHERE expires_at > ?").get(Date.now());
    return { hits: this.hits, misses: this.misses, keys: row.count };
  }
  close() {
    this.db?.close();
    this.db = null;
  }
};
Cache.TTL = {
  STREAM: 21600,
  SEARCH: 300,
  HOME: 28800,
  ARTIST: 3600,
  VISITOR_ID: 2592e3,
  LYRICS: 31536e4
  // 10 years — lyrics never change
};

// src/rate-limiter/index.ts
var WINDOW_MS = 6e4;
var RateLimiter = class {
  constructor(limits = {}, minGapMs = 100) {
    this.buckets = /* @__PURE__ */ new Map();
    this.lastRequestAt = 0;
    this.minGapMs = minGapMs;
    this.limits = {
      search: limits.search ?? 10,
      browse: limits.browse ?? 20,
      stream: limits.stream ?? 5,
      autocomplete: limits.autocomplete ?? 30
    };
  }
  async throttle(endpoint, onLimited, weight = 1) {
    const waited = await this.enforceMinGap();
    if (waited > 0) onLimited?.(endpoint, waited);
    this.consumeToken(endpoint, weight);
  }
  getWaitTime(endpoint) {
    const bucket = this.getBucket(endpoint);
    this.refillIfNeeded(bucket);
    if (bucket.tokens > 0) return 0;
    return bucket.windowStart + WINDOW_MS - Date.now();
  }
  async enforceMinGap() {
    const wait = this.lastRequestAt + this.minGapMs - Date.now();
    if (wait > 0) {
      await delay(wait);
      this.lastRequestAt = Date.now();
      return wait;
    }
    this.lastRequestAt = Date.now();
    return 0;
  }
  consumeToken(endpoint, weight = 1) {
    const bucket = this.getBucket(endpoint);
    this.refillIfNeeded(bucket);
    bucket.tokens = Math.max(0, bucket.tokens - weight);
  }
  getBucket(endpoint) {
    if (!this.buckets.has(endpoint)) {
      const limit = this.limits[endpoint] ?? 10;
      this.buckets.set(endpoint, { tokens: limit, limit, windowStart: Date.now() });
    }
    return this.buckets.get(endpoint);
  }
  refillIfNeeded(bucket) {
    if (Date.now() >= bucket.windowStart + WINDOW_MS) {
      bucket.tokens = bucket.limit;
      bucket.windowStart = Date.now();
    }
  }
};
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/retry/index.ts
var NON_RETRYABLE = /* @__PURE__ */ new Set([404, 410]);
var NonRetryableError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NonRetryableError";
  }
};
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var RetryEngine = class {
  constructor(config) {
    this.config = {
      backoffMax: config.backoffMax ?? 6e4,
      onRetry: config.onRetry ?? (() => {
      }),
      ...config
    };
  }
  async execute(fn, _endpoint, options = {}) {
    let forbiddenRetried = false;
    let attempt = 0;
    while (attempt < this.config.maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof NonRetryableError) throw err;
        if (err instanceof HttpError) {
          if (NON_RETRYABLE.has(err.statusCode)) throw err;
          if (err.statusCode === 429) {
            const waitMs = 6e4;
            options.onRateLimited?.(waitMs);
            await delay2(waitMs);
            continue;
          }
          if (err.statusCode === 403) {
            if (forbiddenRetried) throw err;
            forbiddenRetried = true;
            await options.onForbidden?.();
            attempt++;
            continue;
          }
        }
        attempt++;
        if (attempt >= this.config.maxAttempts) throw err;
        const delayMs = Math.min(
          this.config.backoffBase * Math.pow(2, attempt - 1),
          this.config.backoffMax
        );
        this.config.onRetry(attempt, delayMs);
        options.onRetry?.(_endpoint, attempt, err.message);
        await delay2(delayMs);
      }
    }
    throw new Error("Max attempts reached");
  }
};
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/session/fetcher.ts
async function fetchYouTubeHomePage() {
  const res = await fetch("https://music.youtube.com/", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MusicKit/1.0)" }
  });
  return res.text();
}

// src/session/index.ts
var FALLBACK_VISITOR_ID = "CgtBQnlVMnBiVFJPYyiD7pK_BjIK";
var DEFAULT_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var SessionManager = class {
  constructor(cache, options = {}) {
    this.cache = cache;
    this.options = options;
  }
  async getVisitorId() {
    if (this.options.visitorId) return this.options.visitorId;
    const cached = this.cache.get("visitor_id");
    if (cached) return cached;
    return this.fetchAndCache();
  }
  async refreshVisitorId() {
    this.cache.delete("visitor_id");
    return this.fetchAndCache();
  }
  async buildHeaders() {
    const visitorId = await this.getVisitorId();
    return {
      "User-Agent": this.options.userAgent ?? DEFAULT_UA,
      "Origin": "https://music.youtube.com/",
      "Content-Type": "application/json",
      "Cookie": "CONSENT=YES+1; GPS=1",
      "X-Goog-Visitor-Id": visitorId
    };
  }
  async fetchAndCache() {
    try {
      const html = await fetchYouTubeHomePage();
      const match = html.match(/"VISITOR_DATA":"([^"]+)"/);
      const id = match?.[1] ?? FALLBACK_VISITOR_ID;
      this.cache.set("visitor_id", id, Cache.TTL.VISITOR_ID);
      return id;
    } catch {
      return FALLBACK_VISITOR_ID;
    }
  }
};

// src/errors/index.ts
var MusicKitBaseError = class extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = "MusicKitBaseError";
    this.code = code;
    if (cause !== void 0) this.cause = cause;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
};
var NotFoundError = class extends MusicKitBaseError {
  constructor(message, resourceId) {
    super(message, "NOT_FOUND");
    this.name = "NotFoundError";
    this.resourceId = resourceId;
  }
};
var RateLimitError = class extends MusicKitBaseError {
  constructor(message, retryAfterMs) {
    super(message, "RATE_LIMITED");
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
};
var NetworkError = class extends MusicKitBaseError {
  constructor(message, statusCode, cause) {
    super(message, "NETWORK_ERROR", cause);
    this.name = "NetworkError";
    this.statusCode = statusCode;
  }
};
var ValidationError = class extends MusicKitBaseError {
  constructor(message, field) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.field = field;
  }
};
var StreamError = class extends MusicKitBaseError {
  constructor(message, videoId, cause) {
    super(message, "STREAM_ERROR", cause);
    this.name = "StreamError";
    this.videoId = videoId;
  }
};

// src/schemas/index.ts
var import_zod = require("zod");
var ThumbnailSchema = import_zod.z.object({
  url: import_zod.z.string(),
  width: import_zod.z.number(),
  height: import_zod.z.number()
});
var SongSchema = import_zod.z.object({
  type: import_zod.z.literal("song"),
  videoId: import_zod.z.string().min(1),
  title: import_zod.z.string().min(1),
  artist: import_zod.z.string().min(1),
  duration: import_zod.z.number(),
  thumbnails: import_zod.z.array(ThumbnailSchema),
  album: import_zod.z.string().optional()
});
var AlbumSchema = import_zod.z.object({
  type: import_zod.z.literal("album"),
  browseId: import_zod.z.string().min(1),
  title: import_zod.z.string().min(1),
  artist: import_zod.z.string().min(1),
  year: import_zod.z.string().optional(),
  thumbnails: import_zod.z.array(ThumbnailSchema),
  tracks: import_zod.z.array(import_zod.z.any())
});
var ArtistSchema = import_zod.z.object({
  type: import_zod.z.literal("artist"),
  channelId: import_zod.z.string().min(1),
  name: import_zod.z.string().min(1),
  thumbnails: import_zod.z.array(ThumbnailSchema),
  songs: import_zod.z.array(import_zod.z.any()),
  albums: import_zod.z.array(import_zod.z.any()),
  singles: import_zod.z.array(import_zod.z.any())
});
var PlaylistSchema = import_zod.z.object({
  type: import_zod.z.literal("playlist"),
  playlistId: import_zod.z.string().min(1),
  title: import_zod.z.string().min(1),
  thumbnails: import_zod.z.array(ThumbnailSchema)
});
function safeParseSong(data) {
  const result = SongSchema.safeParse(data);
  return result.success ? result.data : null;
}
function safeParseAlbum(data) {
  const result = AlbumSchema.safeParse(data);
  return result.success ? result.data : null;
}
function safeParseArtist(data) {
  const result = ArtistSchema.safeParse(data);
  return result.success ? result.data : null;
}
function safeParsePlaylist(data) {
  const result = PlaylistSchema.safeParse(data);
  return result.success ? result.data : null;
}

// src/discovery/index.ts
function extractText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.text === "string") return value.text;
  if (typeof value.toString === "function") {
    const s = value.toString();
    if (s !== "[object Object]") return s;
  }
  return "";
}
function mapThumbnails(item) {
  return (item?.thumbnail?.contents ?? item?.thumbnails ?? []).map((t) => ({
    url: t.url ?? "",
    width: t.width ?? 0,
    height: t.height ?? 0
  }));
}
function mapSongItem(item) {
  const artist = extractText(item.artists?.[0]?.name) || extractText(item.authors?.[0]?.name) || extractText(item.author?.name) || extractText(item.author) || // PlaylistPanelVideo.author is a plain string
  "Unknown Artist";
  return {
    type: "song",
    videoId: item.video_id ?? item.id ?? "",
    // PlaylistPanelVideo uses video_id
    title: extractText(item.title) || "Unknown",
    artist,
    duration: item.duration?.seconds ?? 0,
    thumbnails: mapThumbnails(item)
  };
}
function mapAlbumItem(item) {
  const artist = extractText(item.artists?.[0]?.name) || extractText(item.author?.name) || "Unknown Artist";
  return {
    type: "album",
    browseId: item.id ?? item.endpoint?.payload?.browseId ?? "",
    title: extractText(item.title) || extractText(item.name) || "Unknown",
    artist,
    year: item.year,
    thumbnails: mapThumbnails(item),
    tracks: []
  };
}
function mapArtistItem(item) {
  return {
    type: "artist",
    channelId: item.id ?? item.channel_id ?? "",
    name: extractText(item.name) || extractText(item.title) || "Unknown",
    thumbnails: mapThumbnails(item),
    songs: [],
    albums: [],
    singles: []
  };
}
function mapPlaylistItem(item) {
  return {
    type: "playlist",
    playlistId: item.id ?? "",
    title: extractText(item.title) || "Unknown",
    thumbnails: mapThumbnails(item)
  };
}
function flatContents(res) {
  return (res?.contents ?? []).flatMap((section) => section?.contents ?? []);
}
function isEmptySection(title, items) {
  return title === "" && items.length === 0;
}
function parseAlbumSubtitle(runs) {
  const YEAR_RE = /^\d{4}$/;
  const SKIP = /* @__PURE__ */ new Set(["album", "single", "ep", "playlist", "compilation", " \u2022 ", "\u2022"]);
  const texts = (runs ?? []).map((r) => extractText(r)).filter((t) => t && t.trim() !== "" && !SKIP.has(t.toLowerCase().trim()));
  const year = texts.find((t) => YEAR_RE.test(t.trim()));
  const artist = texts.find((t) => !YEAR_RE.test(t.trim()));
  return { artist: artist ?? "Unknown Artist", year };
}
var DiscoveryClient = class {
  constructor(yt) {
    this.yt = yt;
  }
  async getInfo(videoId) {
    const info = await this.yt.music.getInfo(videoId);
    const basic = info?.basic_info ?? {};
    return {
      type: "song",
      videoId,
      title: extractText(basic.title) || "Unknown",
      artist: extractText(basic.author) || "Unknown Artist",
      album: extractText(basic.album?.name) || void 0,
      duration: basic.duration ?? 0,
      thumbnails: (basic.thumbnail ?? []).map((t) => ({
        url: t.url ?? "",
        width: t.width ?? 0,
        height: t.height ?? 0
      }))
    };
  }
  async autocomplete(query) {
    const url = new URL("https://suggestqueries.google.com/complete/search");
    url.searchParams.set("client", "youtube");
    url.searchParams.set("ds", "yt");
    url.searchParams.set("q", query);
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const match = text.match(/^window\.google\.ac\.h\((.*)\)$/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    return (data[1] ?? []).map((item) => item[0]);
  }
  async search(query, options) {
    const typeMap = {
      songs: "song",
      albums: "album",
      artists: "artist",
      playlists: "playlist"
    };
    if (options?.filter) {
      const res2 = await this.yt.music.search(query, { type: typeMap[options.filter] });
      const items = flatContents(res2);
      if (options.filter === "songs") return items.map(mapSongItem).filter((s) => safeParseSong(s) !== null);
      if (options.filter === "albums") return items.map(mapAlbumItem).filter((a) => safeParseAlbum(a) !== null);
      if (options.filter === "artists") return items.map(mapArtistItem).filter((a) => safeParseArtist(a) !== null);
      if (options.filter === "playlists") return items.map(mapPlaylistItem).filter((p) => safeParsePlaylist(p) !== null);
      return [];
    }
    const res = await this.yt.music.search(query);
    const all = flatContents(res);
    return {
      songs: all.filter((i) => i.item_type === "song" || i.duration?.seconds).map(mapSongItem).filter((s) => safeParseSong(s) !== null),
      albums: all.filter((i) => i.item_type === "album").map(mapAlbumItem).filter((a) => safeParseAlbum(a) !== null),
      artists: all.filter((i) => i.item_type === "artist").map(mapArtistItem).filter((a) => safeParseArtist(a) !== null),
      playlists: []
    };
  }
  async getHome() {
    const res = await this.yt.music.getHomeFeed();
    return (res?.sections ?? res?.contents ?? []).map((s) => ({
      title: extractText(s.title) || extractText(s.header?.title) || "",
      items: (s.contents ?? []).map(mapSongItem)
    })).filter((s) => !isEmptySection(s.title, s.items));
  }
  async getArtist(channelId) {
    const res = await this.yt.music.getArtist(channelId);
    if (!res) throw new NotFoundError(`Artist not found: ${channelId}`, channelId);
    const name = extractText(res.header?.title) || "Unknown";
    const songs = [];
    const albums = [];
    const singles = [];
    for (const section of res.sections ?? []) {
      const contents = section.contents ?? [];
      const title = (extractText(section.title) || extractText(section.header?.title) || "").toLowerCase();
      if (title.includes("song")) songs.push(...contents.map((item) => {
        const song = mapSongItem(item);
        return song.artist === "Unknown Artist" ? { ...song, artist: name } : song;
      }));
      else if (title.includes("single")) singles.push(...contents.map(mapAlbumItem));
      else if (title.includes("album") || title.includes("release")) albums.push(...contents.map(mapAlbumItem));
    }
    return {
      type: "artist",
      channelId,
      name,
      thumbnails: mapThumbnails(res.header),
      songs,
      albums,
      singles
    };
  }
  async getAlbum(browseId) {
    const res = await this.yt.music.getAlbum(browseId);
    if (!res) throw new NotFoundError(`Album not found: ${browseId}`, browseId);
    const header = res.header;
    const year = header?.year || parseAlbumSubtitle(header?.subtitle?.runs).year || void 0;
    const artist = extractText(header?.author?.name) || extractText(header?.strapline_text_one) || parseAlbumSubtitle(header?.subtitle?.runs).artist;
    const tracks = (res.contents ?? []).map((t) => {
      const trackArtist = extractText(t.artists?.[0]?.name) || extractText(t.authors?.[0]?.name);
      return {
        type: "song",
        videoId: t.video_id ?? t.id ?? "",
        title: extractText(t.title) || "Unknown",
        artist: trackArtist || artist,
        duration: t.duration?.seconds ?? 0,
        thumbnails: mapThumbnails(header)
      };
    });
    return {
      type: "album",
      browseId,
      title: extractText(header?.title) || "Unknown",
      artist,
      year,
      thumbnails: mapThumbnails(header),
      tracks
    };
  }
  async getPlaylist(playlistId) {
    const res = await this.yt.music.getPlaylist(playlistId);
    if (!res) throw new NotFoundError(`Playlist not found: ${playlistId}`, playlistId);
    const header = res.header ?? {};
    const tracks = (res.contents ?? res.items ?? []).map((item) => item.primary ?? item).filter((item) => item?.video_id || item?.id).map(mapSongItem);
    return {
      type: "playlist",
      playlistId,
      title: extractText(header?.title) || extractText(res.title) || "Unknown",
      thumbnails: mapThumbnails(header),
      songs: tracks,
      songCount: tracks.length
    };
  }
  async getRadio(videoId) {
    const res = await this.yt.music.getUpNext(videoId);
    return (res?.contents ?? []).map((item) => item.primary ?? item).filter((item) => item?.video_id || item?.id).map(mapSongItem);
  }
  async getRelated(videoId) {
    try {
      const res = await this.yt.music.getRelated(videoId);
      return (res?.contents ?? []).flatMap((s) => s.contents ?? []).filter((item) => item?.video_id || item?.id).map(mapSongItem);
    } catch {
      try {
        const res = await this.yt.music.getUpNext(videoId);
        return (res?.contents ?? []).filter((item) => item?.video_id || item?.id).map(mapSongItem);
      } catch {
        return [];
      }
    }
  }
  async getMoodCategories() {
    try {
      const res = await this.yt.music.getExplore?.() ?? { sections: [] };
      for (const section of res.sections ?? []) {
        const title = extractText(section.header?.title) || extractText(section.title) || "";
        if (!title.toLowerCase().includes("mood")) continue;
        return (section.contents ?? []).map((item) => ({
          title: extractText(item.title) || "",
          params: item.params ?? item.endpoint?.payload?.params ?? ""
        })).filter((c) => c.title && c.params);
      }
      return [];
    } catch {
      return [];
    }
  }
  async getMoodPlaylists(params) {
    try {
      const res = await this.yt.music.getExplore?.({ params }) ?? { sections: [] };
      return (res.sections ?? []).map((s) => ({
        title: extractText(s.title) || extractText(s.header?.title) || "",
        items: (s.contents ?? []).map(mapPlaylistItem)
      })).filter((s) => !isEmptySection(s.title, s.items));
    } catch {
      return [];
    }
  }
  async getCharts(options) {
    const res = await this.yt.music.getExplore?.(options) ?? { sections: [] };
    return (res.sections ?? res.contents ?? []).map((s) => ({
      title: extractText(s.title) || extractText(s.header?.title) || "",
      items: (s.contents ?? []).flatMap((item) => {
        if (item.contents) return item.contents.map(mapSongItem);
        return [mapSongItem(item)];
      })
    })).filter((s) => !isEmptySection(s.title, s.items));
  }
};

// src/stream/index.ts
var import_node_child_process = require("child_process");

// src/stream/innertube-resolver.ts
var PRIVATE_TRACK = "MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK";
function parseExpiry(url) {
  try {
    return parseInt(new URL(url).searchParams.get("expire") ?? "0", 10);
  } catch {
    return 0;
  }
}
function buildStreamingData(url, format) {
  const mime = format.mime_type ?? "";
  const codec = mime.includes("opus") ? "opus" : "mp4a";
  const data = {
    url,
    codec,
    mimeType: mime || (codec === "opus" ? "audio/webm; codecs=opus" : "audio/mp4"),
    bitrate: typeof format.bitrate === "number" ? format.bitrate : 0,
    expiresAt: parseExpiry(url)
  };
  if (typeof format.loudness_db === "number") data.loudnessDb = format.loudness_db;
  if (typeof format.content_length === "number") data.sizeBytes = format.content_length;
  else if (typeof format.content_length === "string") {
    const n = parseInt(format.content_length, 10);
    if (!Number.isNaN(n)) data.sizeBytes = n;
  }
  return data;
}
async function resolveViaInnertube(yt, videoId, options) {
  const clientUsed = options?.client ?? "YTMUSIC";
  const qualityHint = options?.quality === "low" ? "medium" : "best";
  let info;
  try {
    info = await yt.music.getInfo(videoId);
  } catch (err) {
    throw new StreamError(`InnerTube getInfo failed: ${err.message}`, videoId);
  }
  const playerResponse = info?.page?.[0];
  const videoDetails = playerResponse?.videoDetails;
  const videoType = typeof videoDetails?.musicVideoType === "string" ? videoDetails.musicVideoType : null;
  const isPrivateTrack = videoType === PRIVATE_TRACK;
  let format;
  try {
    format = info.chooseFormat({ type: "audio", quality: qualityHint, format: "opus" });
  } catch {
    try {
      format = info.chooseFormat({ type: "audio", quality: qualityHint, format: "mp4a" });
    } catch (err) {
      throw new StreamError(
        `chooseFormat failed for both opus and mp4a: ${err.message}`,
        videoId
      );
    }
  }
  if (!format) {
    throw new StreamError("chooseFormat returned no format", videoId);
  }
  let url;
  try {
    const player = yt?.session?.player;
    url = await format.decipher(player);
  } catch (err) {
    throw new StreamError(`format.decipher failed: ${err.message}`, videoId);
  }
  if (!url) {
    throw new StreamError("decipher returned empty url", videoId);
  }
  const stream = buildStreamingData(url, format);
  return { stream, videoType, isPrivateTrack, clientUsed };
}

// src/stream/index.ts
function parseExpiry2(url) {
  try {
    return parseInt(new URL(url).searchParams.get("expire") ?? "0", 10);
  } catch {
    return 0;
  }
}
function ytdlpResolve(videoId, quality, cookiesPath, proxy) {
  return new Promise((resolve, reject) => {
    const formatSelector = quality === "low" ? "worstaudio" : "bestaudio";
    const cookiesArgs = cookiesPath ? ["--cookies", cookiesPath] : [];
    const proxyArgs = proxy ? ["--proxy", proxy] : [];
    (0, import_node_child_process.execFile)("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
      ...proxyArgs,
      "--dump-json",
      "-f",
      formatSelector,
      `https://music.youtube.com/watch?v=${videoId}`
    ], (err, stdout) => {
      try {
        if (!stdout?.trim()) throw new StreamError("no output", videoId);
        const json = JSON.parse(stdout);
        const url = json.url;
        if (!url) throw new StreamError("no url in output", videoId);
        const acodec = json.acodec ?? "";
        const codec = acodec.includes("opus") ? "opus" : "mp4a";
        const mimeType = codec === "opus" ? "audio/webm; codecs=opus" : "audio/mp4";
        const bitrateKbps = json.abr ?? json.tbr ?? 0;
        const sizeBytes = json.filesize ?? json.filesize_approx ?? void 0;
        resolve({
          url,
          codec,
          mimeType,
          bitrate: Math.round(bitrateKbps * 1e3),
          expiresAt: parseExpiry2(url),
          ...sizeBytes != null && { sizeBytes },
          _meta: { title: json.title ?? "", artist: json.artist ?? json.uploader ?? "" }
        });
      } catch (parseErr) {
        reject(new Error(
          err ? `yt-dlp failed: ${(err.stderr ?? String(err)).slice(0, 200)}` : `Failed to parse yt-dlp output: ${parseErr}`
        ));
      }
    });
  });
}
var StreamResolver = class {
  constructor(cache, cookiesPath, proxy, yt, onFallback) {
    this.cache = cache;
    this.cookiesPath = cookiesPath;
    this.proxy = proxy;
    this.yt = yt;
    this.onFallback = onFallback;
  }
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
  async resolve(videoId, quality = "high") {
    const raw = typeof quality === "string" ? quality : quality.quality ?? "high";
    const q = raw === "low" ? "low" : "high";
    const cacheKey = `stream:${videoId}:${q}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached;
    }
    let data;
    if (this.yt) {
      try {
        const result = await resolveViaInnertube(this.yt, videoId, { quality: q });
        data = result.stream;
      } catch (err) {
        const reason = err.message;
        this.onFallback?.(videoId, reason);
      }
    }
    if (!data) {
      data = await ytdlpResolve(videoId, q, this.cookiesPath, this.proxy);
    }
    this.cache.set(cacheKey, data, Cache.TTL.STREAM);
    return data;
  }
};

// src/downloader/index.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
var import_node_child_process2 = require("child_process");
var import_promises = require("stream/promises");

// src/downloader/ytdlp-progress.ts
var PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)(MiB|KiB|GiB)/;
var UNIT_BYTES = {
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024
};
function parseYtdlpProgress(line) {
  const m = line.match(PROGRESS_RE);
  if (!m) return null;
  const percent = Math.min(100, Math.max(0, Math.floor(parseFloat(m[1]))));
  const totalBytes = parseFloat(m[2]) * (UNIT_BYTES[m[3]] ?? 1);
  const bytesDownloaded = totalBytes * (percent / 100);
  return { percent, totalBytes, bytesDownloaded };
}

// src/downloader/index.ts
var INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
function sanitize(name) {
  return name.replace(INVALID_CHARS, "").trim();
}
function ytdlpDownload(videoId, destFile, format, cookiesPath, proxy, filename, onProgress) {
  return new Promise((resolve, reject) => {
    const cookiesArgs = cookiesPath ? ["--cookies", cookiesPath] : [];
    const proxyArgs = proxy ? ["--proxy", proxy] : [];
    const proc = (0, import_node_child_process2.spawn)("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
      ...proxyArgs,
      "--js-runtimes",
      "node",
      "--remote-components",
      "ejs:github",
      "-f",
      format === "m4a" ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio[ext=webm]/bestaudio",
      "-x",
      "--audio-format",
      format,
      "--embed-metadata",
      "-o",
      destFile,
      `https://music.youtube.com/watch?v=${videoId}`
    ]);
    let err = "";
    proc.stderr.on("data", (d) => {
      const text = d.toString();
      err += text;
      if (onProgress && filename) {
        for (const line of text.split("\n")) {
          const parsed = parseYtdlpProgress(line);
          if (parsed) onProgress({ ...parsed, filename });
        }
      }
    });
    proc.on("error", (spawnErr) => reject(new Error(`yt-dlp not found or failed to start: ${spawnErr.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`yt-dlp download failed: ${err.slice(0, 200)}`));
      else resolve();
    });
  });
}
var Downloader = class {
  constructor(resolver, discovery, cookiesPath, proxy) {
    this.resolver = resolver;
    this.discovery = discovery;
    this.cookiesPath = cookiesPath;
    this.proxy = proxy;
  }
  streamAudio(videoId) {
    const cookiesArgs = this.cookiesPath ? ["--cookies", this.cookiesPath] : [];
    const proxyArgs = this.proxy ? ["--proxy", this.proxy] : [];
    const proc = (0, import_node_child_process2.spawn)("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
      ...proxyArgs,
      "-f",
      "bestaudio",
      "-o",
      "-",
      `https://music.youtube.com/watch?v=${videoId}`
    ]);
    proc.stderr.resume();
    return proc.stdout;
  }
  streamPCMFromUrl(url) {
    const ffmpeg = (0, import_node_child_process2.spawn)("ffmpeg", [
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      url,
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "s16le",
      "pipe:1"
    ]);
    ffmpeg.stderr.resume();
    return ffmpeg.stdout;
  }
  streamPCM(videoId) {
    const cookiesArgs = this.cookiesPath ? ["--cookies", this.cookiesPath] : [];
    const proxyArgs = this.proxy ? ["--proxy", this.proxy] : [];
    const ytdlp = (0, import_node_child_process2.spawn)("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
      ...proxyArgs,
      "-f",
      "bestaudio",
      "-o",
      "-",
      `https://music.youtube.com/watch?v=${videoId}`
    ]);
    const ffmpeg = (0, import_node_child_process2.spawn)("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "s16le",
      "pipe:1"
    ]);
    ytdlp.stderr.resume();
    ffmpeg.stderr.resume();
    (0, import_promises.pipeline)(ytdlp.stdout, ffmpeg.stdin).catch(() => {
    });
    return ffmpeg.stdout;
  }
  async download(videoId, options = {}) {
    const format = options.format ?? "opus";
    const codec = format === "m4a" ? "mp4a" : "opus";
    const stream = await this.resolver.resolve(videoId, { codec });
    const meta = stream._meta;
    let title = meta?.title || "";
    let artist = meta?.artist || "";
    if ((!title || !artist) && !options._mockSong) {
      const song = await this.discovery.getInfo(videoId);
      title = title || song.title;
      artist = artist || song.artist;
    } else if (options._mockSong) {
      title = options._mockSong.title;
      artist = options._mockSong.artist;
    }
    const filename = `${sanitize(title || videoId)} (${sanitize(artist)}).${format}`;
    const dest = (0, import_node_path.join)(options.path ?? ".", filename);
    if (options._mockReadStream) {
      const writeStream = (0, import_node_fs.createWriteStream)(dest);
      return this.readWithProgress(options._mockReadStream, writeStream, filename, stream.sizeBytes, options.onProgress);
    }
    const { mkdir } = await import("fs/promises");
    await mkdir(options.path ?? ".", { recursive: true });
    await ytdlpDownload(videoId, dest, format, this.cookiesPath, this.proxy, filename, options.onProgress);
  }
  async fetchAndWrite(url, writeStream, filename, totalBytes, onProgress) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com"
      }
    });
    if (!response.ok) {
      throw new NetworkError(`HTTP ${response.status}: audio fetch failed`, response.status);
    }
    const { Readable } = await import("stream");
    const readable = Readable.fromWeb(response.body);
    return new Promise((resolve, reject) => {
      let downloaded = 0;
      writeStream.on("error", (err) => {
        writeStream.destroy();
        reject(err);
      });
      readable.on("data", (chunk) => {
        writeStream.write(chunk);
        downloaded += chunk.length;
        if (onProgress) {
          onProgress({
            percent: totalBytes ? Math.min(100, Math.round(downloaded / totalBytes * 100)) : 0,
            bytesDownloaded: downloaded,
            totalBytes,
            filename
          });
        }
      });
      readable.on("error", (err) => {
        writeStream.destroy();
        reject(err);
      });
      readable.on("end", () => {
        writeStream.end();
        writeStream.once("finish", resolve);
      });
    });
  }
  readWithProgress(readable, writeStream, filename, totalBytes, onProgress) {
    return new Promise((resolve, reject) => {
      let downloaded = 0;
      readable.on("data", (chunk) => {
        downloaded += chunk.length;
        if (onProgress) {
          onProgress({
            percent: totalBytes ? Math.min(100, Math.round(downloaded / totalBytes * 100)) : 0,
            bytesDownloaded: downloaded,
            totalBytes,
            filename
          });
        }
      });
      readable.on("error", reject);
      readable.on("end", resolve);
      readable.pipe?.(writeStream);
    });
  }
};

// src/identifier/index.ts
var import_node_child_process3 = require("child_process");
var import_promises2 = require("fs/promises");
var ACOUSTID_ENDPOINT = "https://api.acoustid.org/v2/lookup";
var Identifier = class {
  constructor(options) {
    this.options = options;
  }
  async lookup(fingerprint, duration) {
    const params = new URLSearchParams({
      client: this.options.acoustidApiKey,
      meta: "recordings recordings.compress",
      duration: String(Math.round(duration)),
      fingerprint
    });
    const fetchFn = this.options.fetch ?? globalThis.fetch;
    const response = await fetchFn(`${ACOUSTID_ENDPOINT}?${params}`);
    if (!response.ok) throw new NetworkError(`AcoustID API error: ${response.status}`, response.status);
    const data = await response.json();
    if (data.status !== "ok" || !data.results?.length) return null;
    const best = [...data.results].filter((r) => r.recordings?.length).sort((a, b) => b.score - a.score)[0];
    if (!best) return null;
    const recording = best.recordings[0];
    const artist = recording.artists?.[0]?.name ?? "";
    const title = recording.title ?? "";
    if (!artist || !title) return null;
    return { artist, title, score: best.score };
  }
  fingerprint(filePath) {
    return new Promise((resolve, reject) => {
      (0, import_node_child_process3.execFile)("fpcalc", ["-json", filePath], (err, stdout) => {
        if (err) {
          reject(new Error(`fpcalc failed: ${err.message}`));
          return;
        }
        try {
          const data = JSON.parse(stdout);
          resolve({ fingerprint: data.fingerprint, duration: data.duration });
        } catch {
          reject(new Error("fpcalc returned invalid JSON"));
        }
      });
    });
  }
  async recognizeWithSongrec(filePath) {
    if (!this.options.songrecBin) return null;
    const duration = await this.getAudioDuration(filePath);
    const startSec = Math.max(0, Math.min(60, duration - 15));
    const clipPath = `/tmp/songrec-clip-${Date.now()}.wav`;
    await this.extractClip(filePath, clipPath, startSec);
    let output;
    try {
      output = await new Promise((resolve, reject) => {
        const proc = (0, import_node_child_process3.spawn)(this.options.songrecBin, ["audio-file-to-recognized-song", clipPath]);
        const chunks = [];
        proc.stdout.on("data", (chunk) => chunks.push(chunk));
        proc.stderr.resume();
        proc.on("error", (err) => reject(new Error(`songrec spawn failed: ${err.message}`)));
        proc.on("close", (code) => {
          if (code !== 0) resolve("");
          else resolve(Buffer.concat(chunks).toString("utf8").trim());
        });
      });
    } finally {
      (0, import_promises2.unlink)(clipPath).catch(() => {
      });
    }
    if (!output) return null;
    try {
      const data = JSON.parse(output);
      const track = data?.track;
      if (!track?.title || !track?.subtitle) return null;
      return { artist: track.subtitle, title: track.title, score: 1 };
    } catch {
      return null;
    }
  }
  getAudioDuration(filePath) {
    return new Promise((resolve) => {
      const proc = (0, import_node_child_process3.spawn)("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        filePath
      ]);
      let output = "";
      proc.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      proc.stderr.resume();
      proc.on("error", () => resolve(0));
      proc.on("close", () => {
        const d = parseFloat(output.trim());
        resolve(isNaN(d) ? 0 : d);
      });
    });
  }
  extractClip(inputPath, outputPath, startSec = 0) {
    return new Promise((resolve, reject) => {
      const proc = (0, import_node_child_process3.spawn)("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(startSec),
        "-t",
        "10",
        "-i",
        inputPath,
        "-ar",
        "44100",
        "-ac",
        "1",
        "-f",
        "wav",
        "-y",
        outputPath
      ]);
      proc.stderr.resume();
      proc.on("error", (err) => reject(new Error(`ffmpeg clip failed: ${err.message}`)));
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(`ffmpeg clip exited ${code}`));
        else resolve();
      });
    });
  }
};

// src/podcast/index.ts
var import_rss_parser = __toESM(require("rss-parser"));
var parser = new import_rss_parser.default({
  customFields: {
    feed: [
      ["itunes:author", "author"],
      ["itunes:image", "image"]
    ],
    item: [
      ["itunes:duration", "duration"],
      ["itunes:episode", "episode"],
      ["itunes:season", "season"],
      ["itunes:image", "episodeImage"],
      ["itunes:explicit", "explicit"]
    ]
  }
});
var PodcastClient = class {
  async getFeed(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new NetworkError(`RSS fetch failed: ${resp.status}`, resp.status);
    const xml = await resp.text();
    return this.parse(xml, url);
  }
  async parse(xml, feedUrl) {
    const feed = await parser.parseString(xml);
    const feedImageUrl = extractImageUrl(feed.image);
    const feedThumbnails = feedImageUrl ? [{ url: feedImageUrl, width: 0, height: 0 }] : [];
    const episodes = (feed.items ?? []).filter((item) => !!item.enclosure?.url).map((item) => {
      const epImageUrl = extractImageUrl(item.episodeImage) ?? feedImageUrl;
      const thumbnails = epImageUrl ? [{ url: epImageUrl, width: 0, height: 0 }] : [];
      return {
        type: "episode",
        guid: item.guid ?? item.link ?? item.enclosure.url,
        title: item.title ?? "Untitled",
        description: item.contentSnippet ?? item.content ?? "",
        url: item.enclosure.url,
        mimeType: item.enclosure?.type ?? "audio/mpeg",
        duration: parseDuration(item.duration),
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
        thumbnails,
        season: item.season ? parseInt(item.season) : void 0,
        episode: item.episode ? parseInt(item.episode) : void 0,
        explicit: item.explicit === "yes" || item.explicit === "true"
      };
    });
    return {
      type: "podcast",
      feedUrl,
      title: feed.title ?? "",
      description: feed.description ?? "",
      author: feed.author ?? "",
      language: feed.language ?? "",
      link: feed.link ?? "",
      thumbnails: feedThumbnails,
      episodes
    };
  }
};
function extractImageUrl(image) {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (typeof image === "object" && image !== null) {
    const obj = image;
    if (obj.$?.href) return obj.$.href;
    if (obj.url) return obj.url;
    if (obj.href) return obj.href;
  }
  return null;
}
function parseDuration(duration) {
  if (!duration) return 0;
  const trimmed = duration.trim();
  const parts = trimmed.split(":").map(Number);
  if (parts.length === 1) return isNaN(parts[0]) ? 0 : parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// src/events/index.ts
var MusicKitEmitter = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
    this.onceMap = /* @__PURE__ */ new Map();
  }
  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, /* @__PURE__ */ new Set());
    this.handlers.get(event).add(handler);
  }
  off(event, handler) {
    const wrapper = this.onceMap.get(handler);
    if (wrapper) {
      this.onceMap.delete(handler);
      this.handlers.get(event)?.delete(wrapper);
    } else {
      this.handlers.get(event)?.delete(handler);
    }
  }
  once(event, handler) {
    const wrapper = ((...args) => {
      this.off(event, handler);
      handler(...args);
    });
    this.onceMap.set(handler, wrapper);
    this.on(event, wrapper);
  }
  emit(event, ...args) {
    this.handlers.get(event)?.forEach((h) => h(...args));
  }
};

// src/sources/youtube-music.ts
var YouTubeMusicSource = class {
  constructor(discovery, resolver) {
    this.discovery = discovery;
    this.resolver = resolver;
    this.name = "youtube-music";
  }
  canHandle(_query) {
    return true;
  }
  async search(query, options = {}) {
    return this.discovery.search(query, options);
  }
  async getStream(id, quality = "high") {
    return this.resolver.resolve(id, quality);
  }
  async getMetadata(id) {
    return this.discovery.getInfo(id);
  }
  async getAlbum(id) {
    return this.discovery.getAlbum(id);
  }
  async getArtist(id) {
    return this.discovery.getArtist(id);
  }
  async getPlaylist(id) {
    return this.discovery.getPlaylist(id);
  }
  async getRadio(id) {
    return this.discovery.getRadio(id);
  }
  async getRelated(id) {
    return this.discovery.getRelated(id);
  }
  async getHome() {
    return this.discovery.getHome();
  }
  async getCharts(options) {
    return this.discovery.getCharts(options);
  }
  async getMoodCategories() {
    return this.discovery.getMoodCategories();
  }
  async getMoodPlaylists(params) {
    return this.discovery.getMoodPlaylists(params);
  }
  async autocomplete(query) {
    return this.discovery.autocomplete(query);
  }
};

// src/sources/youtube-data-api.ts
var YT_API = "https://www.googleapis.com/youtube/v3";
function parseDuration2(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] || "0") * 3600 + parseInt(m[2] || "0") * 60 + parseInt(m[3] || "0");
}
function mapThumbnails2(thumbs) {
  return Object.values(thumbs).map((t) => ({ url: t.url, width: t.width, height: t.height }));
}
var TOPIC_SUFFIX = / - Topic$/;
var TITLE_NOISE = /\s*[\(\[【][^\)\]】]*(official|video|audio|lyrics?|explicit|instrumental|hq|hd|4k|live|cover|remix|remaster|m\/?v|visualizer)[^\)\]】]*[\)\]】]/gi;
function extractArtistTitle(rawTitle, channelTitle) {
  const cleanTitle = rawTitle.replace(TITLE_NOISE, "").trim();
  if (TOPIC_SUFFIX.test(channelTitle)) {
    return { artist: channelTitle.replace(TOPIC_SUFFIX, "").trim(), title: cleanTitle };
  }
  const dash = cleanTitle.indexOf(" - ");
  if (dash !== -1) {
    return {
      artist: cleanTitle.slice(0, dash).trim(),
      title: cleanTitle.slice(dash + 3).trim()
    };
  }
  return { title: cleanTitle, artist: channelTitle.trim() };
}
async function ytFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NetworkError(`YouTube Data API error ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  return res.json();
}
var YouTubeDataAPISource = class {
  constructor(apiKey, resolver) {
    this.apiKey = apiKey;
    this.resolver = resolver;
    this.name = "youtube-data-api";
  }
  canHandle(_query) {
    return true;
  }
  async search(query, options = {}) {
    if (options.filter && options.filter !== "songs") return [];
    const maxResults = Math.min(options.limit ?? 10, 50);
    const searchUrl = new URL(`${YT_API}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoCategoryId", "10");
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("key", this.apiKey);
    const searchData = await ytFetch(searchUrl);
    const videoIds = searchData.items.filter((item) => item.id?.videoId).map((item) => item.id.videoId);
    if (videoIds.length === 0) {
      return options.filter === "songs" ? [] : { songs: [], albums: [], artists: [], playlists: [] };
    }
    const videosUrl = new URL(`${YT_API}/videos`);
    videosUrl.searchParams.set("part", "snippet,contentDetails");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", this.apiKey);
    const videosData = await ytFetch(videosUrl);
    const detailMap = /* @__PURE__ */ new Map();
    for (const item of videosData.items ?? []) detailMap.set(item.id, item);
    const songs = videoIds.map((id) => {
      const detail = detailMap.get(id);
      if (!detail) return null;
      const { title, artist } = extractArtistTitle(detail.snippet.title, detail.snippet.channelTitle);
      return {
        type: "song",
        videoId: id,
        title,
        artist,
        duration: parseDuration2(detail.contentDetails?.duration ?? ""),
        thumbnails: mapThumbnails2(detail.snippet.thumbnails ?? {})
      };
    }).filter((s) => s !== null);
    return options.filter === "songs" ? songs : { songs, albums: [], artists: [], playlists: [] };
  }
  async getMetadata(id) {
    const url = new URL(`${YT_API}/videos`);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", id);
    url.searchParams.set("key", this.apiKey);
    const data = await ytFetch(url);
    const item = data.items?.[0];
    if (!item) throw new NotFoundError(`Video not found: ${id}`, id);
    const { title, artist } = extractArtistTitle(item.snippet.title, item.snippet.channelTitle);
    return {
      type: "song",
      videoId: id,
      title,
      artist,
      duration: parseDuration2(item.contentDetails?.duration ?? ""),
      thumbnails: mapThumbnails2(item.snippet.thumbnails ?? {})
    };
  }
  async getStream(id, quality = "high") {
    return this.resolver.resolve(id, quality);
  }
};

// src/lyrics/lrc-utils.ts
var WORD_TAG_RE = /<(\d+):(\d+\.\d+)>([^<]*)/g;
function parseLrc(lrc) {
  const lines = [];
  for (const line of lrc.split("\n")) {
    const match = line.match(/^\[(\d+):(\d+\.\d+)\]\s*(.*)/);
    if (!match) continue;
    const raw = match[3].trim();
    if (!raw) continue;
    const time = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
    if (raw.includes("<")) {
      const words = [];
      let m;
      WORD_TAG_RE.lastIndex = 0;
      while ((m = WORD_TAG_RE.exec(raw)) !== null) {
        const wordText = m[3].trim();
        if (wordText) words.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), duration: 0, text: wordText });
      }
      if (words.length > 0) {
        lines.push({ time, text: words.map((w) => w.text).join(" "), words });
        continue;
      }
    }
    lines.push({ time, text: raw });
  }
  return lines;
}
function getActiveLineIndex(lines, currentTime) {
  if (lines.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) idx = i;
    else break;
  }
  return idx;
}
function getActiveLine(lines, currentTime) {
  const idx = getActiveLineIndex(lines, currentTime);
  return idx === -1 ? null : lines[idx];
}
function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = secs.toFixed(2).padStart(5, "0");
  return `[${mm}:${ss}]`;
}
function offsetLrc(lines, offsetMs) {
  return lines.map((line) => ({
    ...line,
    time: Math.max(0, line.time + offsetMs / 1e3)
  }));
}
function serializeLrc(lines) {
  if (lines.length === 0) return "";
  return lines.map((line) => `${formatTimestamp(line.time)} ${line.text}`).join("\n");
}

// src/lyrics/lrclib.ts
var UA = "musicstream-sdk (https://github.com/addynoven/music-package)";
function toLyrics(data) {
  if (!data.plainLyrics) return null;
  return {
    plain: data.plainLyrics.trim(),
    synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null
  };
}
async function getStrict(artist, title, duration, fetchFn) {
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  if (duration && duration > 0) params.set("duration", String(Math.round(duration)));
  const res = await fetchFn(`https://lrclib.net/api/get?${params}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  return toLyrics(await res.json());
}
async function searchClosest(artist, title, duration, fetchFn) {
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  const res = await fetchFn(`https://lrclib.net/api/search?${params}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const candidates = await res.json();
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const synced = candidates.filter((c) => c.syncedLyrics);
  const pool = synced.length ? synced : candidates;
  let chosen;
  if (duration && duration > 0) {
    const sorted = [...pool].sort((a, b) => {
      const da = Math.abs((a.duration ?? Infinity) - duration);
      const db = Math.abs((b.duration ?? Infinity) - duration);
      return da - db;
    });
    chosen = sorted[0];
    if (Math.abs((chosen.duration ?? Infinity) - duration) > 5) return null;
  } else {
    chosen = pool[0];
  }
  return toLyrics(chosen);
}
async function fetchFromLrclib(artist, title, duration, fetchFn = globalThis.fetch) {
  try {
    return await getStrict(artist, title, duration, fetchFn) ?? await searchClosest(artist, title, duration, fetchFn);
  } catch {
    return null;
  }
}

// src/lyrics/lyrics-ovh.ts
async function fetchFromLyricsOvh(artist, title, fetchFn = globalThis.fetch) {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const data = await res.json();
    const plain = data.lyrics?.trim();
    if (!plain) return null;
    return { plain, synced: null };
  } catch {
    return null;
  }
}

// src/lyrics/better-lyrics.ts
var BETTER_LYRICS_BASE = "https://lyrics-api.boidu.dev";
function parseTime(raw) {
  const s = raw.trim();
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function getAttr(tag, name) {
  const re = new RegExp(`\\b${name}=["']([^"']*)["']`, "i");
  const m = re.exec(tag);
  return m ? m[1] : null;
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function innerText(content) {
  return decodeEntities(content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}
function parseTtml(ttml) {
  const xml = ttml.replace(/\r\n?/g, "\n");
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  const lines = [];
  let pMatch;
  while ((pMatch = pRe.exec(xml)) !== null) {
    const pAttrs = pMatch[1];
    const pBody = pMatch[2];
    const beginRaw = getAttr(pAttrs, "begin");
    if (beginRaw === null) continue;
    const lineTime = parseTime(beginRaw);
    const spanRe = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
    const words = [];
    let spanMatch;
    while ((spanMatch = spanRe.exec(pBody)) !== null) {
      const spanAttrs = spanMatch[1];
      const spanContent = spanMatch[2];
      const sBeginRaw = getAttr(spanAttrs, "begin");
      const sEndRaw = getAttr(spanAttrs, "end");
      const wordText = innerText(spanContent);
      if (sBeginRaw !== null && sEndRaw !== null && wordText.length > 0) {
        const sBegin = parseTime(sBeginRaw);
        const sEnd = parseTime(sEndRaw);
        words.push({
          time: sBegin,
          duration: Math.max(0, sEnd - sBegin),
          text: wordText
        });
      }
    }
    const text = words.length > 0 ? words.map((w) => w.text).join(" ") : innerText(pBody);
    if (text.length === 0) continue;
    const line = { time: lineTime, text };
    if (words.length > 0) line.words = words;
    lines.push(line);
  }
  return lines.length > 0 ? lines : null;
}
async function fetchFromBetterLyrics(artist, title, duration, fetchFn = globalThis.fetch) {
  try {
    const params = new URLSearchParams({ s: title, a: artist });
    if (duration !== void 0 && duration > 0) params.set("d", String(Math.round(duration)));
    const url = `${BETTER_LYRICS_BASE}/getLyrics?${params}`;
    const res = await fetchFn(url, {
      headers: { Accept: "application/xml, text/xml, */*" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ttml = typeof data["ttml"] === "string" ? data["ttml"] : null;
    if (!ttml) return null;
    const synced = parseTtml(ttml);
    const plain = synced ? synced.map((l) => l.text).join("\n") : "";
    if (!plain) return null;
    return { plain, synced };
  } catch {
    return null;
  }
}

// src/lyrics/kugou.ts
var KUGOU_SEARCH_BASE = "https://mobileservice.kugou.com";
var KUGOU_LYRICS_BASE = "https://lyrics.kugou.com";
var TIMESTAMP_RE = /\[(\d+):(\d+\.\d+)\]/g;
function parseTimestamp(mm, ss) {
  return parseInt(mm, 10) * 60 + parseFloat(ss);
}
function parseLrc2(lrc) {
  const lines = [];
  for (const rawLine of lrc.split("\n")) {
    const timestamps = [];
    let lastIndex = 0;
    TIMESTAMP_RE.lastIndex = 0;
    let m;
    while ((m = TIMESTAMP_RE.exec(rawLine)) !== null) {
      timestamps.push(parseTimestamp(m[1], m[2]));
      lastIndex = TIMESTAMP_RE.lastIndex;
    }
    if (timestamps.length === 0) continue;
    const text = rawLine.slice(lastIndex).trim();
    if (!text) continue;
    for (const time of timestamps) {
      lines.push({ time, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
async function fetchFromKuGou(artist, title, duration, fetchFn = globalThis.fetch) {
  try {
    const keyword = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `${KUGOU_SEARCH_BASE}/api/v3/search/song?keyword=${keyword}&pagesize=20&page=1`;
    const searchRes = await fetchFn(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const songs = getSongs(searchData);
    if (songs.length === 0) return null;
    let chosen;
    if (duration !== void 0) {
      const TOLERANCE = 5;
      const candidates = songs.filter((s) => Math.abs(s.duration - duration) <= TOLERANCE);
      if (candidates.length === 0) return null;
      chosen = candidates.reduce(
        (best, s) => Math.abs(s.duration - duration) < Math.abs(best.duration - duration) ? s : best
      );
    } else {
      chosen = songs[0];
    }
    if (!chosen) return null;
    const durationMs = duration !== void 0 ? Math.round(duration * 1e3) : void 0;
    const lyricSearchParams = new URLSearchParams({
      ver: "1",
      man: "yes",
      client: "mobi",
      keyword: title,
      hash: chosen.hash
    });
    if (durationMs !== void 0) {
      lyricSearchParams.set("duration", String(durationMs));
    }
    const lyricSearchRes = await fetchFn(`${KUGOU_LYRICS_BASE}/search?${lyricSearchParams}`);
    if (!lyricSearchRes.ok) return null;
    const lyricSearchData = await lyricSearchRes.json();
    const candidate = getFirstCandidate(lyricSearchData);
    if (!candidate) return null;
    const downloadParams = new URLSearchParams({
      ver: "1",
      client: "pc",
      id: String(candidate.id),
      accesskey: candidate.accesskey,
      fmt: "lrc",
      charset: "utf8"
    });
    const downloadRes = await fetchFn(`${KUGOU_LYRICS_BASE}/download?${downloadParams}`);
    if (!downloadRes.ok) return null;
    const downloadData = await downloadRes.json();
    const b64 = getContent(downloadData);
    if (!b64) return null;
    const lrcText = Buffer.from(b64, "base64").toString("utf8");
    const synced = parseLrc2(lrcText);
    if (synced.length === 0) return null;
    const plain = synced.map((l) => l.text).join("\n");
    return { plain, synced };
  } catch {
    return null;
  }
}
function getSongs(data) {
  if (typeof data !== "object" || data === null || !("data" in data)) return [];
  const d = data.data;
  if (typeof d !== "object" || d === null || !("info" in d)) return [];
  const info = d.info;
  if (!Array.isArray(info)) return [];
  return info.filter(
    (item) => typeof item === "object" && item !== null && typeof item.hash === "string" && typeof item.duration === "number"
  );
}
function getFirstCandidate(data) {
  if (typeof data !== "object" || data === null || !("candidates" in data)) return null;
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0];
  if (typeof first !== "object" || first === null || !("id" in first) || !("accesskey" in first)) return null;
  const f = first;
  if (typeof f.id !== "string" && typeof f.id !== "number" || typeof f.accesskey !== "string") return null;
  return { id: f.id, accesskey: f.accesskey };
}
function getContent(data) {
  if (typeof data !== "object" || data === null || !("content" in data)) return null;
  const content = data.content;
  if (typeof content !== "string" || content.length === 0) return null;
  return content;
}

// src/utils/url-resolver.ts
var YTM_BASE = "music.youtube.com";
var SPOTIFY_TRACK_RE = /^https?:\/\/open\.spotify\.com\/track\//;
var TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
function resolveInput(input) {
  if (!input) return input;
  const yt = resolveYouTubeUrl(input);
  if (yt !== null) return yt;
  const ytm = resolveYouTubeMusicUrl(input);
  if (ytm !== null) return ytm;
  return input;
}
function resolveYouTubeUrl(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return id || null;
    }
    if (host === "youtube.com") {
      const v = url.searchParams.get("v");
      return v || null;
    }
    return null;
  } catch {
    return null;
  }
}
async function resolveSpotifyUrl(url) {
  if (!SPOTIFY_TRACK_RE.test(url)) return null;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) return null;
    const html = await resp.text();
    const m = TITLE_RE.exec(html);
    if (!m) return null;
    let raw = m[1].trim();
    raw = raw.replace(/\s*-\s*song\s+and\s+lyrics\s+by\s+/i, " ");
    raw = raw.replace(/\s*\|\s*Spotify\s*$/i, "");
    return raw.trim() || null;
  } catch {
    return null;
  }
}
function resolveYouTubeMusicUrl(input) {
  try {
    const url = new URL(input);
    if (url.hostname !== YTM_BASE) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch") {
      const v = url.searchParams.get("v");
      return v || null;
    }
    if (segments[0] === "browse" && segments[1]) {
      return segments[1];
    }
    if (segments[0] === "playlist") {
      const list = url.searchParams.get("list");
      return list || null;
    }
    if (segments[0] === "search") {
      const q = url.searchParams.get("q");
      return q ? decodeURIComponent(q.replace(/\+/g, " ")) : null;
    }
    return null;
  } catch {
    return null;
  }
}

// src/utils/cookies.ts
var import_node_fs2 = require("fs");
function readCookieHeader(path) {
  if (!(0, import_node_fs2.existsSync)(path)) return "";
  try {
    const lines = (0, import_node_fs2.readFileSync)(path, "utf8").split("\n");
    const pairs = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const fields = line.split("	");
      if (fields.length < 7) continue;
      const name = fields[5];
      const value = fields[6];
      if (name) pairs.push(`${name}=${value}`);
    }
    return pairs.join("; ");
  } catch {
    return "";
  }
}

// src/utils/fetch.ts
function makeFetch({ proxy, session }) {
  if (!proxy && !session) return globalThis.fetch;
  return async (input, init) => {
    let sessionHeaders = {};
    if (session) {
      sessionHeaders = await session.buildHeaders();
    }
    const callerHeaders = normalizeHeaders(init?.headers);
    const merged = { ...sessionHeaders, ...callerHeaders };
    const mergedInit = { ...init ?? {}, headers: merged };
    if (proxy) {
      const undici = await import("undici").catch(() => null);
      if (undici) {
        const dispatcher = new undici.ProxyAgent(proxy);
        return undici.fetch(input, { ...mergedInit, dispatcher });
      }
    }
    return globalThis.fetch(input, mergedInit);
  };
}
function normalizeHeaders(headers) {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  if (typeof headers.forEach === "function") {
    const out = {};
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  return headers;
}

// src/logger/index.ts
var LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};
var Logger = class {
  constructor(config = {}) {
    this.level = LEVELS[config.logLevel ?? "warn"];
    this.handler = config.logHandler;
  }
  log(level, message, meta) {
    if (LEVELS[level] > this.level) return;
    if (this.handler) {
      this.handler(level, message, meta);
      return;
    }
    const metaStr = meta ? JSON.stringify(meta) : "";
    const methods = {
      silent: "log",
      error: "error",
      warn: "warn",
      info: "info",
      debug: "debug"
    };
    console[methods[level]](`[${level}] ${message}`, metaStr);
  }
  error(message, meta) {
    this.log("error", message, meta);
  }
  warn(message, meta) {
    this.log("warn", message, meta);
  }
  info(message, meta) {
    this.log("info", message, meta);
  }
  debug(message, meta) {
    this.log("debug", message, meta);
  }
};

// src/musickit/index.ts
function makeReq(endpoint) {
  return { method: "GET", endpoint, headers: {}, body: null };
}
function isQuotaOrRateLimit(err) {
  if (!(err instanceof Error)) return false;
  const name = err.constructor?.name ?? "";
  if (name === "NetworkError") {
    const status = err.status;
    return status === 403 || status === 429;
  }
  return false;
}
function resolveSourceOrder(pref) {
  if (!pref || pref === "best") return ["youtube"];
  return pref;
}
var _MusicKit = class _MusicKit {
  constructor(config = {}, _yt) {
    this.searchCache = /* @__PURE__ */ new Map();
    this.sources = [];
    this._discovery = null;
    this._stream = null;
    this._downloader = null;
    this._identifier = null;
    this._podcast = null;
    this._ytPromise = null;
    // Bound so it can be passed by reference to StreamResolver without losing `this`.
    this.onStreamFallback = (videoId, reason) => {
      this.log.debug(`[stream] InnerTube fast-path failed for ${videoId}, falling back to yt-dlp: ${reason}`);
      this.emitter.emit("retry", "stream", 1, `innertube\u2192ytdlp: ${reason}`);
    };
    this.config = config;
    this.sourceOrder = resolveSourceOrder(config.sourceOrder);
    const cacheConfig = config.cache ?? {};
    this.cache = new Cache({
      enabled: cacheConfig.enabled ?? true,
      path: cacheConfig.dir
    });
    this.limiter = new RateLimiter(config.rateLimit ?? {}, config.minRequestGap ?? 100);
    this.emitter = new MusicKitEmitter();
    this.log = new Logger({ logLevel: config.logLevel, logHandler: config.logHandler });
    this.retry = new RetryEngine({
      maxAttempts: config.maxRetries ?? 3,
      backoffBase: config.backoffBase ?? 1e3,
      backoffMax: config.backoffMax,
      onRetry: () => {
      }
    });
    this.session = new SessionManager(this.cache, {
      visitorId: config.visitorId,
      userAgent: config.userAgent
    });
    this.sharedFetch = makeFetch({ proxy: config.proxy, session: this.session });
    this.innerTubeFetch = config.proxy ? makeFetch({ proxy: config.proxy }) : void 0;
    if (_yt) {
      this._discovery = new DiscoveryClient(_yt);
      this._stream = new StreamResolver(this.cache, config.cookiesPath, config.proxy, _yt, this.onStreamFallback);
      this._downloader = new Downloader(this._stream, this._discovery, config.cookiesPath, config.proxy);
    }
    if (!config.youtubeApiKey && !config.cookiesPath) {
      this.log.warn("[MusicKit] No youtubeApiKey or cookiesPath configured. You may hit YouTube rate limits under heavy usage. Recommendation: set youtubeApiKey for search, cookiesPath for streams.");
    }
    if (!config.identify?.acoustidApiKey) {
      this.log.warn("[MusicKit] identify() is unavailable \u2014 no acoustidApiKey set. Get a free key at acoustid.org and pass it as config.identify.acoustidApiKey.");
    }
  }
  searchCacheSet(key, value) {
    if (this.searchCache.size >= _MusicKit.SEARCH_CACHE_MAX) {
      this.searchCache.delete(this.searchCache.keys().next().value);
    }
    this.searchCache.set(key, value);
  }
  searchCacheGet(key) {
    const val = this.searchCache.get(key);
    if (val !== void 0) {
      this.searchCache.delete(key);
      this.searchCache.set(key, val);
    }
    return val;
  }
  static async create(config = {}) {
    const instance = new _MusicKit(config);
    const cookieHeader = config.cookiesPath ? readCookieHeader(config.cookiesPath) : "";
    const yt = await import_youtubei.Innertube.create({
      generate_session_locally: true,
      ...instance.innerTubeFetch ? { fetch: instance.innerTubeFetch } : {},
      ...cookieHeader ? { cookie: cookieHeader } : {},
      ...config.language ? { lang: config.language } : {},
      ...config.location ? { location: config.location } : {}
    });
    instance._discovery = new DiscoveryClient(yt);
    instance._stream = new StreamResolver(instance.cache, config.cookiesPath, config.proxy, yt, instance.onStreamFallback);
    instance._downloader = new Downloader(instance._stream, instance._discovery, config.cookiesPath, config.proxy);
    return instance;
  }
  registerSource(source) {
    this.sources.push(source);
  }
  sourceFor(query, override) {
    if (override === "youtube") {
      const yt = this.sources.find((s) => s.name.startsWith("youtube"));
      if (!yt) throw new ValidationError(`Source 'youtube' is not registered \u2014 check your sourceOrder config`, "sourceOrder");
      return yt;
    }
    if (override) {
      const found = this.sources.find((s) => s.name === override);
      if (!found) throw new ValidationError(`Source '${override}' is not registered \u2014 check your sourceOrder config`, "sourceOrder");
      return found;
    }
    const source = this.sources.find((s) => s.canHandle(query));
    if (!source) throw new NotFoundError(`No source can handle: ${query}`, query);
    return source;
  }
  pickSearchSource(query, override, filter) {
    if (override) return this.sourceFor(query, override);
    if (filter && filter !== "songs") {
      const ytMusic = this.sources.find((s) => s.name === "youtube-music");
      if (ytMusic) return ytMusic;
    }
    return this.sourceFor(query);
  }
  async tryEachSource(method, call, isQuotaError = isQuotaOrRateLimit) {
    let lastErr;
    for (const src of this.sources) {
      if (typeof src[method] !== "function") continue;
      try {
        return await call(src);
      } catch (err) {
        lastErr = err;
        if (!isQuotaError(err)) throw err;
      }
    }
    throw lastErr ?? new NotFoundError("No source could handle request", method);
  }
  async ensureClients() {
    if (!this._discovery) {
      if (!this._ytPromise) {
        const cookieHeader = this.config.cookiesPath ? readCookieHeader(this.config.cookiesPath) : "";
        this._ytPromise = import_youtubei.Innertube.create({
          generate_session_locally: true,
          ...this.innerTubeFetch ? { fetch: this.innerTubeFetch } : {},
          ...cookieHeader ? { cookie: cookieHeader } : {},
          ...this.config.language ? { lang: this.config.language } : {},
          ...this.config.location ? { location: this.config.location } : {}
        });
      }
      const yt = await this._ytPromise;
      this._discovery = new DiscoveryClient(yt);
      this._stream = new StreamResolver(this.cache, this.config.cookiesPath, this.config.proxy, yt, this.onStreamFallback);
      this._downloader = new Downloader(this._stream, this._discovery, this.config.cookiesPath, this.config.proxy);
    }
    if (this.sources.length === 0) {
      for (const name of this.sourceOrder) {
        if (name === "youtube") {
          if (this.config.youtubeApiKey) {
            this.sources.push(new YouTubeDataAPISource(this.config.youtubeApiKey, this._stream));
            this.sources.push(new YouTubeMusicSource(this._discovery, this._stream));
          } else {
            this.sources.push(new YouTubeMusicSource(this._discovery, this._stream));
          }
        }
      }
    }
  }
  async call(endpoint, fn) {
    const req = makeReq(endpoint);
    const start = Date.now();
    this.emitter.emit("beforeRequest", req);
    try {
      const result = await this.retry.execute(fn, endpoint, {
        onRateLimited: (waitMs) => this.emitter.emit("rateLimited", endpoint, waitMs),
        onRetry: (ep, attempt, reason) => this.emitter.emit("retry", ep, attempt, reason)
      });
      this.emitter.emit("afterRequest", req, Date.now() - start, 200);
      return result;
    } catch (err) {
      this.emitter.emit("error", err);
      throw err;
    }
  }
  on(event, handler) {
    this.emitter.on(event, handler);
  }
  off(event, handler) {
    this.emitter.off(event, handler);
  }
  once(event, handler) {
    this.emitter.once(event, handler);
  }
  async autocomplete(query) {
    const resolved = resolveInput(query);
    const cacheKey = `autocomplete:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("autocomplete", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "autocomplete",
      () => this.tryEachSource("autocomplete", (src) => src.autocomplete(resolved))
    );
    this.cache.set(cacheKey, result, 60);
    return result;
  }
  async search(query, options) {
    const resolved = resolveInput(query);
    const cacheKey = `search:${resolved}:${options?.filter ?? "all"}:${options?.limit ?? "default"}:${options?.source ?? "auto"}`;
    const inMemory = this.searchCacheGet(cacheKey);
    if (inMemory !== void 0) {
      this.emitter.emit("cacheHit", cacheKey, Cache.TTL.SEARCH);
      return inMemory;
    }
    const persisted = this.cache.get(cacheKey);
    if (persisted) {
      this.searchCacheSet(cacheKey, persisted);
      this.emitter.emit("cacheHit", cacheKey, Cache.TTL.SEARCH);
      return persisted;
    }
    this.emitter.emit("cacheMiss", cacheKey);
    await this.limiter.throttle("search", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const { source: sourceOverride, ...searchOpts } = options ?? {};
    const src = this.pickSearchSource(resolved, sourceOverride, searchOpts.filter);
    const result = await this.call("search", () => src.search(resolved, searchOpts));
    this.searchCacheSet(cacheKey, result);
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getStream(videoId, options) {
    await this.limiter.throttle("stream", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const id = resolveInput(videoId);
    const quality = options?.quality ?? "high";
    return this.call("stream", () => this.sourceFor(id).getStream(id, quality));
  }
  async getTrack(videoId) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    const src = this.sourceFor(id);
    const [song, streamData] = await Promise.all([
      this.call("browse", () => this.tryEachSource("getMetadata", (s) => s.getMetadata(id))),
      this.call("stream", () => src.getStream(id, "high"))
    ]);
    return { ...song, stream: streamData };
  }
  async getHome(options) {
    const lang = options?.language;
    const cacheKey = `home:${lang ?? "default"}:${options?.source ?? "auto"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getHome", (src) => src.getHome())
    );
    this.cache.set(cacheKey, result, Cache.TTL.HOME);
    return result;
  }
  async getArtist(channelId) {
    const id = resolveInput(channelId);
    const cacheKey = `artist:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getArtist", (src) => src.getArtist(id))
    );
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST);
    return result;
  }
  async getAlbum(browseId) {
    const id = resolveInput(browseId);
    const cacheKey = `album:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getAlbum", (src) => src.getAlbum(id))
    );
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST);
    return result;
  }
  async getPlaylist(playlistId) {
    const id = resolveInput(playlistId);
    const cacheKey = `playlist:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getPlaylist", (src) => src.getPlaylist(id))
    );
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST);
    return result;
  }
  async getRadio(videoId) {
    const id = resolveInput(videoId);
    const cacheKey = `radio:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getRadio", (src) => src.getRadio(id))
    );
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getRelated(videoId) {
    const id = resolveInput(videoId);
    const cacheKey = `related:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getRelated", (src) => src.getRelated(id))
    );
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getSuggestions(id) {
    const resolved = resolveInput(id);
    const cacheKey = `suggestions:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.getRelated(resolved);
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getMetadata(id) {
    const resolved = resolveInput(id);
    const cacheKey = `metadata:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call(
      "browse",
      () => this.tryEachSource("getMetadata", (src) => src.getMetadata(resolved))
    );
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getLyrics(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    const cacheKey = `lyrics:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== null) return cached;
    let lyrics = null;
    try {
      const meta = await this.getMetadata(resolved);
      const artist = sanitizeArtist(meta.artist);
      const title = sanitizeTitle(meta.title);
      lyrics = await fetchFromBetterLyrics(artist, title, meta.duration, this.sharedFetch) ?? await fetchFromLrclib(artist, title, meta.duration, this.sharedFetch) ?? await fetchFromLyricsOvh(artist, title, this.sharedFetch) ?? await fetchFromKuGou(artist, title, meta.duration, this.sharedFetch);
    } catch {
    }
    if (lyrics) this.cache.set(cacheKey, lyrics, Cache.TTL.LYRICS);
    return lyrics;
  }
  async getCharts(options) {
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    return this.call(
      "browse",
      () => this.tryEachSource("getCharts", (src) => src.getCharts(options))
    );
  }
  async getMoodCategories() {
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    return this.call(
      "browse",
      () => this.tryEachSource("getMoodCategories", (src) => src.getMoodCategories())
    );
  }
  async getMoodPlaylists(params) {
    await this.limiter.throttle("browse", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    return this.call(
      "browse",
      () => this.tryEachSource("getMoodPlaylists", (src) => src.getMoodPlaylists(params))
    );
  }
  async download(videoId, options) {
    await this.limiter.throttle("stream", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const id = resolveInput(videoId);
    return this._downloader.download(id, options);
  }
  async streamAudio(id) {
    await this.limiter.throttle("stream", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const resolved = resolveInput(id);
    return this._downloader.streamAudio(resolved);
  }
  async identify(filePath) {
    if (!this.config.identify?.acoustidApiKey) {
      throw new ValidationError(
        "identify() requires config.identify.acoustidApiKey \u2014 get a free key at acoustid.org",
        "identify.acoustidApiKey"
      );
    }
    if (!this._identifier) {
      this._identifier = new Identifier({
        acoustidApiKey: this.config.identify.acoustidApiKey,
        songrecBin: this.config.identify.songrecBin,
        fetch: this.sharedFetch
      });
    }
    let match = await this._identifier.recognizeWithSongrec(filePath);
    if (!match) {
      const fp = await this._identifier.fingerprint(filePath);
      match = await this._identifier.lookup(fp.fingerprint, fp.duration);
    }
    if (!match) return null;
    await this.ensureClients();
    const songs = await this.search(`${match.artist} ${match.title}`, { filter: "songs" });
    return songs[0] ?? null;
  }
  async streamPCM(id) {
    await this.limiter.throttle("stream", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const resolved = resolveInput(id);
    try {
      const streamData = await this.getStream(resolved);
      return this._downloader.streamPCMFromUrl(streamData.url);
    } catch {
      return this._downloader.streamPCM(resolved);
    }
  }
  async getPodcast(feedUrl) {
    if (!this._podcast) this._podcast = new PodcastClient();
    return this._podcast.getFeed(feedUrl);
  }
};
_MusicKit.SEARCH_CACHE_MAX = 256;
var MusicKit = _MusicKit;
var TITLE_NOISE2 = /\s*[\(\[【][^\)\]】]*(official|video|audio|lyrics?|explicit|instrumental|hq|hd|4k|live|cover|remix|remaster)[^\)\]】]*[\)\]】]/gi;
var ARTIST_NOISE = /\s*([-–—].*|VEVO|Official|Music|Records?|Productions?)$/i;
function sanitizeTitle(t) {
  const dash = t.indexOf(" - ");
  const cleaned = dash !== -1 ? t.slice(dash + 3) : t;
  return cleaned.replace(TITLE_NOISE2, "").trim();
}
function sanitizeArtist(a) {
  return a.replace(ARTIST_NOISE, "").trim();
}

// src/queue/index.ts
var Queue = class {
  constructor() {
    this._current = null;
    this._upcoming = [];
    this._history = [];
    this.repeat = "off";
  }
  get current() {
    return this._current;
  }
  get upcoming() {
    return [...this._upcoming];
  }
  get history() {
    return [...this._history];
  }
  get size() {
    return this._upcoming.length;
  }
  get isEmpty() {
    return this._upcoming.length === 0 && this._current === null;
  }
  add(track) {
    this._upcoming.push(track);
  }
  playNext(track) {
    this._upcoming.unshift(track);
  }
  next() {
    if (this.repeat === "one" && this._current) {
      return this._current;
    }
    if (this._upcoming.length === 0) {
      if (this.repeat === "all" && (this._history.length > 0 || this._current)) {
        if (this._current) this._history.push(this._current);
        this._upcoming = [...this._history];
        this._history = [];
        this._current = null;
      } else {
        return null;
      }
    }
    if (this._current) this._history.push(this._current);
    this._current = this._upcoming.shift();
    return this._current;
  }
  previous() {
    if (this._history.length === 0) return null;
    if (this._current) this._upcoming.unshift(this._current);
    this._current = this._history.pop();
    return this._current;
  }
  clear() {
    this._upcoming = [];
  }
  remove(index) {
    this._upcoming.splice(index, 1);
  }
  move(from, to) {
    if (from === to) return;
    const [track] = this._upcoming.splice(from, 1);
    this._upcoming.splice(to, 0, track);
  }
  skipTo(index) {
    this._upcoming = this._upcoming.slice(index);
  }
  shuffle() {
    for (let i = this._upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._upcoming[i], this._upcoming[j]] = [this._upcoming[j], this._upcoming[i]];
    }
  }
};

// package.json
var version = "4.1.0";

// src/models/index.ts
var SearchFilter = {
  Songs: "songs",
  Albums: "albums",
  Artists: "artists",
  Playlists: "playlists"
};
var MusicKitErrorCode = {
  RateLimited: "RATE_LIMITED",
  Forbidden: "FORBIDDEN",
  VideoUnavailable: "VIDEO_UNAVAILABLE",
  VideoUnplayable: "VIDEO_UNPLAYABLE",
  CipherFailure: "CIPHER_FAILURE",
  NetworkError: "NETWORK_ERROR",
  ParseError: "PARSE_ERROR",
  DownloadError: "DOWNLOAD_ERROR",
  Unknown: "UNKNOWN"
};

// src/utils/thumbnails.ts
function getBestThumbnail(thumbnails, targetSize) {
  if (thumbnails.length === 0) return null;
  const withDimensions = thumbnails.filter((t) => t.width > 0);
  if (withDimensions.length === 0) return thumbnails[0];
  return withDimensions.reduce(
    (best, t) => Math.abs(t.width - targetSize) < Math.abs(best.width - targetSize) ? t : best
  );
}

// src/utils/stream-utils.ts
var EXPIRY_BUFFER_SECONDS = 300;
function isStreamExpired(stream) {
  return Math.floor(Date.now() / 1e3) > stream.expiresAt - EXPIRY_BUFFER_SECONDS;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AlbumSchema,
  ArtistSchema,
  Cache,
  DiscoveryClient,
  Downloader,
  HttpError,
  Identifier,
  Logger,
  MusicKit,
  MusicKitBaseError,
  MusicKitEmitter,
  MusicKitErrorCode,
  NetworkError,
  NonRetryableError,
  NotFoundError,
  PlaylistSchema,
  PodcastClient,
  Queue,
  RateLimitError,
  RateLimiter,
  RetryEngine,
  SearchFilter,
  SessionManager,
  SongSchema,
  StreamError,
  StreamResolver,
  ThumbnailSchema,
  ValidationError,
  formatTimestamp,
  getActiveLine,
  getActiveLineIndex,
  getBestThumbnail,
  isStreamExpired,
  offsetLrc,
  parseLrc,
  resolveInput,
  resolveSpotifyUrl,
  safeParseAlbum,
  safeParseArtist,
  safeParsePlaylist,
  safeParseSong,
  serializeLrc,
  version
});
