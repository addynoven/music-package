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
  Cache: () => Cache,
  DiscoveryClient: () => DiscoveryClient,
  Downloader: () => Downloader,
  HttpError: () => HttpError,
  MusicKit: () => MusicKit,
  MusicKitEmitter: () => MusicKitEmitter,
  MusicKitErrorCode: () => MusicKitErrorCode,
  RateLimiter: () => RateLimiter,
  RetryEngine: () => RetryEngine,
  SearchFilter: () => SearchFilter,
  SessionManager: () => SessionManager,
  StreamResolver: () => StreamResolver
});
module.exports = __toCommonJS(index_exports);

// src/musickit/index.ts
var import_youtubei = require("youtubei.js");

// src/cache/index.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var URL_EXPIRY_BUFFER = 1800;
var Cache = class {
  constructor(options) {
    this.db = null;
    this.enabled = options.enabled;
    if (!this.enabled) return;
    this.db = new import_better_sqlite3.default(options.path ?? ":memory:");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }
  get(key) {
    if (!this.enabled || !this.db) return null;
    const row = this.db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(key);
    if (!row) return null;
    if (Date.now() > row.expires_at) {
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return null;
    }
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
  VISITOR_ID: 2592e3
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
  async throttle(endpoint, onLimited) {
    const waited = await this.enforceMinGap();
    if (waited > 0) onLimited?.(endpoint, waited);
    this.consumeToken(endpoint);
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
  consumeToken(endpoint) {
    const bucket = this.getBucket(endpoint);
    this.refillIfNeeded(bucket);
    if (bucket.tokens > 0) bucket.tokens--;
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

// src/discovery/index.ts
function mapThumbnails(item) {
  return (item?.thumbnail?.contents ?? item?.thumbnails ?? []).map((t) => ({
    url: t.url ?? "",
    width: t.width ?? 0,
    height: t.height ?? 0
  }));
}
function mapSongItem(item) {
  const artist = item.artists?.[0]?.name ?? item.author?.name ?? "Unknown Artist";
  return {
    type: "song",
    videoId: item.id ?? "",
    title: item.title ?? "Unknown",
    artist,
    duration: item.duration?.seconds ?? 0,
    thumbnails: mapThumbnails(item)
  };
}
function mapAlbumItem(item) {
  const artist = item.artists?.[0]?.name ?? item.author?.name ?? "Unknown Artist";
  return {
    type: "album",
    browseId: item.id ?? item.endpoint?.payload?.browseId ?? "",
    title: item.title ?? item.name ?? "Unknown",
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
    name: item.name ?? item.title ?? "Unknown",
    thumbnails: mapThumbnails(item),
    songs: [],
    albums: [],
    singles: []
  };
}
function flatContents(res) {
  return (res?.contents ?? []).flatMap((section) => section?.contents ?? []);
}
var DiscoveryClient = class {
  constructor(yt) {
    this.yt = yt;
  }
  async autocomplete(query) {
    const res = await this.yt.music.getSearchSuggestions(query);
    return res.flatMap(
      (section) => (section.contents ?? []).map((c) => c.suggestion?.text ?? c.query?.text).filter(Boolean)
    );
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
      if (options.filter === "songs") return items.map(mapSongItem);
      if (options.filter === "albums") return items.map(mapAlbumItem);
      if (options.filter === "artists") return items.map(mapArtistItem);
      return [];
    }
    const res = await this.yt.music.search(query);
    const all = flatContents(res);
    return {
      songs: all.filter((i) => i.item_type === "song" || i.duration?.seconds).map(mapSongItem),
      albums: all.filter((i) => i.item_type === "album").map(mapAlbumItem),
      artists: all.filter((i) => i.item_type === "artist").map(mapArtistItem),
      playlists: []
    };
  }
  async getHome() {
    const res = await this.yt.music.getHomeFeed();
    return (res?.sections ?? res?.contents ?? []).map((s) => ({
      title: s.title?.text ?? s.header?.title?.text ?? "",
      items: (s.contents ?? []).map(mapSongItem)
    }));
  }
  async getArtist(channelId) {
    const res = await this.yt.music.getArtist(channelId);
    if (!res) throw new Error(`Artist not found: ${channelId}`);
    const name = res.header?.title?.text ?? "Unknown";
    const songs = [];
    const albums = [];
    const singles = [];
    for (const section of res.sections ?? []) {
      const contents = section.contents ?? [];
      const title = (section.title?.text ?? section.header?.title?.text ?? "").toLowerCase();
      if (title.includes("song")) songs.push(...contents.map(mapSongItem));
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
    if (!res) throw new Error(`Album not found: ${browseId}`);
    const tracks = (res.contents ?? []).map((t) => ({
      type: "song",
      videoId: t.id ?? "",
      title: t.title ?? "Unknown",
      artist: t.artists?.[0]?.name ?? "Unknown Artist",
      duration: t.duration?.seconds ?? 0,
      thumbnails: mapThumbnails(res.header)
    }));
    return {
      type: "album",
      browseId,
      title: res.header?.title?.text ?? "Unknown",
      artist: res.header?.subtitle?.runs?.[2]?.text ?? "Unknown Artist",
      year: res.header?.subtitle?.runs?.[4]?.text,
      thumbnails: mapThumbnails(res.header),
      tracks
    };
  }
  async getRadio(videoId) {
    const res = await this.yt.music.getUpNext(videoId);
    return (res?.contents ?? []).map(mapSongItem);
  }
  async getRelated(videoId) {
    const res = await this.yt.music.getRelated(videoId);
    return (res?.contents ?? []).flatMap((s) => s.contents ?? []).map(mapSongItem);
  }
  async getCharts(options) {
    const res = await this.yt.music.getExplore?.(options) ?? { sections: [] };
    return (res.sections ?? []).map((s) => ({
      title: s.title?.text ?? "",
      items: (s.contents ?? []).map(mapSongItem)
    }));
  }
};

// src/stream/index.ts
var import_agnostic = require("youtubei.js/agnostic");
function patchEvalIfNeeded() {
  try {
    const shim = import_agnostic.Platform.shim;
    if (shim && typeof shim.eval === "function") {
      import_agnostic.Platform.load({
        ...shim,
        eval: (data, env) => {
          const fn = new Function(...Object.keys(env), data.output ?? data);
          return fn(...Object.values(env));
        }
      });
    }
  } catch {
  }
}
function parseCodec(mimeType) {
  return mimeType.includes("opus") ? "opus" : "mp4a";
}
function parseExpiry(url) {
  try {
    return parseInt(new URL(url).searchParams.get("expire") ?? "0", 10);
  } catch {
    return 0;
  }
}
var StreamResolver = class {
  constructor(cache, yt) {
    this.cache = cache;
    this.yt = yt;
    patchEvalIfNeeded();
  }
  async resolve(videoId, quality = "high") {
    const q = typeof quality === "string" ? quality : quality.quality ?? "high";
    const cacheKey = `stream:${videoId}:${q}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached;
    }
    const info = await this.yt.music.getInfo(videoId);
    const formats = info.streaming_data?.adaptive_formats ?? [];
    const audioFmts = formats.filter((f) => f.has_audio && !f.has_video);
    if (!audioFmts.length) {
      throw new Error(`No audio formats found for videoId: ${videoId}`);
    }
    const fmt = q === "high" ? audioFmts.sort((a, b) => b.bitrate - a.bitrate)[0] : audioFmts.sort((a, b) => a.bitrate - b.bitrate)[0];
    const url = await fmt.decipher(this.yt.session.player);
    const data = {
      url,
      codec: parseCodec(fmt.mime_type ?? ""),
      bitrate: fmt.bitrate ?? 0,
      expiresAt: parseExpiry(url),
      ...fmt.loudness_db !== void 0 && { loudnessDb: fmt.loudness_db },
      ...fmt.content_length !== void 0 && { sizeBytes: parseInt(fmt.content_length, 10) }
    };
    this.cache.set(cacheKey, data, Cache.TTL.STREAM);
    return data;
  }
};

// src/downloader/index.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
var import_node_child_process = require("child_process");
var INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
function sanitize(name) {
  return name.replace(INVALID_CHARS, "").trim();
}
function ytdlpDownload(videoId, destFile, format) {
  return new Promise((resolve, reject) => {
    const proc = (0, import_node_child_process.spawn)("yt-dlp", [
      "--no-playlist",
      "--js-runtimes",
      "node",
      "--remote-components",
      "ejs:github",
      "-f",
      format === "m4a" ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio[ext=webm]/bestaudio",
      "-x",
      "--audio-format",
      format,
      "-o",
      destFile,
      `https://music.youtube.com/watch?v=${videoId}`
    ]);
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d;
    });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`yt-dlp download failed: ${err.slice(0, 200)}`));
      else resolve();
    });
  });
}
var Downloader = class {
  constructor(resolver) {
    this.resolver = resolver;
  }
  async download(videoId, options = {}) {
    const format = options.format ?? "opus";
    const codec = format === "m4a" ? "mp4a" : "opus";
    const stream = await this.resolver.resolve(videoId, { codec });
    const song = options._mockSong ?? {
      type: "song",
      videoId,
      title: videoId,
      artist: "Unknown",
      duration: 0,
      thumbnails: []
    };
    const filename = `${sanitize(song.title)} (${sanitize(song.artist)}).${format}`;
    const dest = (0, import_node_path.join)(options.path ?? ".", filename);
    if (options._mockReadStream) {
      const writeStream2 = (0, import_node_fs.createWriteStream)(dest);
      return this.readWithProgress(options._mockReadStream, writeStream2, stream.sizeBytes, options.onProgress);
    }
    const writeStream = (0, import_node_fs.createWriteStream)(dest);
    try {
      await this.fetchAndWrite(stream.url, writeStream, stream.sizeBytes, options.onProgress);
    } catch (err) {
      writeStream.destroy();
      if (err.message?.includes("403") || err.message?.includes("audio fetch failed")) {
        const { unlink } = await import("fs/promises");
        await unlink(dest).catch(() => {
        });
        await ytdlpDownload(videoId, dest, format);
      } else {
        throw err;
      }
    }
  }
  async fetchAndWrite(url, writeStream, totalBytes, onProgress) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: audio fetch failed`);
    }
    const { Readable } = await import("stream");
    const readable = Readable.fromWeb(response.body);
    return new Promise((resolve, reject) => {
      let downloaded = 0;
      readable.on("data", (chunk) => {
        writeStream.write(chunk);
        downloaded += chunk.length;
        if (onProgress && totalBytes) {
          onProgress(Math.round(downloaded / totalBytes * 100));
        }
      });
      readable.on("error", (err) => {
        writeStream.destroy();
        reject(err);
      });
      readable.on("end", () => {
        writeStream.end();
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
    });
  }
  readWithProgress(readable, writeStream, totalBytes, onProgress) {
    return new Promise((resolve, reject) => {
      let downloaded = 0;
      readable.on("data", (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalBytes) {
          onProgress(Math.round(downloaded / totalBytes * 100));
        }
      });
      readable.on("error", reject);
      readable.on("end", resolve);
      readable.pipe?.(writeStream);
    });
  }
};

// src/events/index.ts
var MusicKitEmitter = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, /* @__PURE__ */ new Set());
    this.handlers.get(event).add(handler);
  }
  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event, ...args) {
    this.handlers.get(event)?.forEach((h) => h(...args));
  }
};

// src/musickit/index.ts
function makeReq(endpoint) {
  return { method: "GET", endpoint, headers: {}, body: null };
}
var MusicKit = class _MusicKit {
  constructor(config = {}, _yt) {
    this.searchCache = /* @__PURE__ */ new Map();
    this._discovery = null;
    this._stream = null;
    this._downloader = null;
    this._ytPromise = null;
    const cacheConfig = config.cache ?? {};
    this.cache = new Cache({
      enabled: cacheConfig.enabled ?? true,
      path: cacheConfig.dir
    });
    this.limiter = new RateLimiter(config.rateLimit ?? {}, config.minRequestGap ?? 100);
    this.emitter = new MusicKitEmitter();
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
    if (_yt) {
      this._discovery = new DiscoveryClient(_yt);
      this._stream = new StreamResolver(this.cache, _yt);
      this._downloader = new Downloader(this._stream);
    }
  }
  static async create(config = {}) {
    const yt = await import_youtubei.Innertube.create({ generate_session_locally: true });
    return new _MusicKit(config, yt);
  }
  async ensureClients() {
    if (this._discovery) return;
    if (!this._ytPromise) {
      this._ytPromise = import_youtubei.Innertube.create({ generate_session_locally: true });
    }
    const yt = await this._ytPromise;
    this._discovery = new DiscoveryClient(yt);
    this._stream = new StreamResolver(this.cache, yt);
    this._downloader = new Downloader(this._stream);
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
  async autocomplete(query) {
    await this.ensureClients();
    return this.call("autocomplete", () => this._discovery.autocomplete(query));
  }
  async search(query, options) {
    const cacheKey = `search:${query}:${options?.filter ?? "all"}`;
    const inMemory = this.searchCache.get(cacheKey);
    if (inMemory !== void 0) {
      this.emitter.emit("cacheHit", cacheKey, Cache.TTL.SEARCH);
      return inMemory;
    }
    const persisted = this.cache.get(cacheKey);
    if (persisted) {
      this.searchCache.set(cacheKey, persisted);
      this.emitter.emit("cacheHit", cacheKey, Cache.TTL.SEARCH);
      return persisted;
    }
    this.emitter.emit("cacheMiss", cacheKey);
    await this.limiter.throttle("search", (ep, waitMs) => this.emitter.emit("rateLimited", ep, waitMs));
    await this.ensureClients();
    const result = await this.call("search", () => this._discovery.search(query, options ?? {}));
    this.searchCache.set(cacheKey, result);
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getStream(videoId, options) {
    await this.ensureClients();
    return this.call("stream", () => this._stream.resolve(videoId, options?.quality ?? "high"));
  }
  async getTrack(videoId) {
    await this.ensureClients();
    const [songs, streamData] = await Promise.all([
      this.call("search", () => this._discovery.search(videoId, { filter: "songs" })),
      this.call("stream", () => this._stream.resolve(videoId, "high"))
    ]);
    const song = Array.isArray(songs) ? songs[0] : void 0;
    if (!song) throw new Error(`Track not found: ${videoId}`);
    return { ...song, stream: streamData };
  }
  async getHome() {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getHome());
  }
  async getArtist(channelId) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getArtist(channelId));
  }
  async getAlbum(browseId) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getAlbum(browseId));
  }
  async getRadio(videoId) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getRadio(videoId));
  }
  async getRelated(videoId) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getRelated(videoId));
  }
  async getCharts(options) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getCharts(options));
  }
  async download(videoId, options) {
    await this.ensureClients();
    return this._downloader.download(videoId, options);
  }
};

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Cache,
  DiscoveryClient,
  Downloader,
  HttpError,
  MusicKit,
  MusicKitEmitter,
  MusicKitErrorCode,
  RateLimiter,
  RetryEngine,
  SearchFilter,
  SessionManager,
  StreamResolver
});
