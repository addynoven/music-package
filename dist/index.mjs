// src/musickit/index.ts
import { Innertube } from "youtubei.js";

// src/cache/index.ts
import { DatabaseSync } from "node:sqlite";
var URL_EXPIRY_BUFFER = 1800;
var Cache = class {
  constructor(options) {
    this.db = null;
    this.hits = 0;
    this.misses = 0;
    this.enabled = options.enabled;
    if (!this.enabled) return;
    this.db = new DatabaseSync(options.path ?? ":memory:");
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
import { z } from "zod";
var ThumbnailSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number()
});
var SongSchema = z.object({
  type: z.literal("song"),
  videoId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  duration: z.number(),
  thumbnails: z.array(ThumbnailSchema),
  album: z.string().optional()
});
var AlbumSchema = z.object({
  type: z.literal("album"),
  browseId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  year: z.string().optional(),
  thumbnails: z.array(ThumbnailSchema),
  tracks: z.array(z.any())
});
var ArtistSchema = z.object({
  type: z.literal("artist"),
  channelId: z.string().min(1),
  name: z.string().min(1),
  thumbnails: z.array(ThumbnailSchema),
  songs: z.array(z.any()),
  albums: z.array(z.any()),
  singles: z.array(z.any())
});
var PlaylistSchema = z.object({
  type: z.literal("playlist"),
  playlistId: z.string().min(1),
  title: z.string().min(1),
  thumbnails: z.array(ThumbnailSchema)
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
import { execFile } from "child_process";
function parseExpiry(url) {
  try {
    return parseInt(new URL(url).searchParams.get("expire") ?? "0", 10);
  } catch {
    return 0;
  }
}
function ytdlpResolve(videoId, quality, cookiesPath) {
  return new Promise((resolve, reject) => {
    const formatSelector = quality === "low" ? "worstaudio" : "bestaudio";
    const cookiesArgs = cookiesPath ? ["--cookies", cookiesPath] : [];
    execFile("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
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
          expiresAt: parseExpiry(url),
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
  constructor(cache, cookiesPath) {
    this.cache = cache;
    this.cookiesPath = cookiesPath;
  }
  async resolve(videoId, quality = "high") {
    const raw = typeof quality === "string" ? quality : quality.quality ?? "high";
    const q = raw === "low" ? "low" : "high";
    const cacheKey = `stream:${videoId}:${q}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !this.cache.isUrlExpired(cached.url)) {
      return cached;
    }
    const data = await ytdlpResolve(videoId, q, this.cookiesPath);
    this.cache.set(cacheKey, data, Cache.TTL.STREAM);
    return data;
  }
};

// src/downloader/index.ts
import { createWriteStream } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";

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
function ytdlpDownload(videoId, destFile, format, cookiesPath, filename, onProgress) {
  return new Promise((resolve, reject) => {
    const cookiesArgs = cookiesPath ? ["--cookies", cookiesPath] : [];
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
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
  constructor(resolver, discovery, cookiesPath) {
    this.resolver = resolver;
    this.discovery = discovery;
    this.cookiesPath = cookiesPath;
  }
  streamAudio(videoId) {
    const cookiesArgs = this.cookiesPath ? ["--cookies", this.cookiesPath] : [];
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
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
    const ffmpeg = spawn("ffmpeg", [
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
    const ytdlp = spawn("yt-dlp", [
      "--no-playlist",
      ...cookiesArgs,
      "-f",
      "bestaudio",
      "-o",
      "-",
      `https://music.youtube.com/watch?v=${videoId}`
    ]);
    const ffmpeg = spawn("ffmpeg", [
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
    pipeline(ytdlp.stdout, ffmpeg.stdin).catch(() => {
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
    const dest = join(options.path ?? ".", filename);
    if (options._mockReadStream) {
      const writeStream = createWriteStream(dest);
      return this.readWithProgress(options._mockReadStream, writeStream, filename, stream.sizeBytes, options.onProgress);
    }
    const { mkdir } = await import("fs/promises");
    await mkdir(options.path ?? ".", { recursive: true });
    await ytdlpDownload(videoId, dest, format, this.cookiesPath, filename, options.onProgress);
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
import { spawn as spawn2, execFile as execFile2 } from "child_process";
import { unlink } from "fs/promises";
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
    const response = await fetch(`${ACOUSTID_ENDPOINT}?${params}`);
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
      execFile2("fpcalc", ["-json", filePath], (err, stdout) => {
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
    const clipPath = `/tmp/songrec-clip-${Date.now()}.wav`;
    await this.extractClip(filePath, clipPath);
    let output;
    try {
      output = await new Promise((resolve, reject) => {
        const proc = spawn2(this.options.songrecBin, ["audio-file-to-recognized-song", clipPath]);
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
      unlink(clipPath).catch(() => {
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
  extractClip(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const proc = spawn2("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "60",
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
import Parser from "rss-parser";
var parser = new Parser({
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
  canHandle(query) {
    return !query.startsWith("jio:");
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
  canHandle(query) {
    return !query.startsWith("jio:");
  }
  async search(query, options = {}) {
    if (options.filter && options.filter !== "songs") return [];
    const maxResults = Math.min(options.limit ?? 10, 50);
    const searchUrl = new URL(`${YT_API}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
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
      return {
        type: "song",
        videoId: id,
        title: detail.snippet.title,
        artist: detail.snippet.channelTitle,
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
    return {
      type: "song",
      videoId: id,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      duration: parseDuration2(item.contentDetails?.duration ?? ""),
      thumbnails: mapThumbnails2(item.snippet.thumbnails ?? {})
    };
  }
  async getStream(id, quality = "high") {
    return this.resolver.resolve(id, quality);
  }
};

// src/sources/jiosaavn/decrypt.ts
import forge from "node-forge";
var KEY = "38346591";
var IV = "00000000";
var BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
function decryptStreamUrl(encryptedBase64) {
  if (!BASE64_RE.test(encryptedBase64.trim())) {
    throw new Error(`Invalid base64 input: ${encryptedBase64}`);
  }
  const encrypted = forge.util.decode64(encryptedBase64);
  const decipher = forge.cipher.createDecipher("DES-ECB", forge.util.createBuffer(KEY));
  decipher.start({ iv: forge.util.createBuffer(IV) });
  decipher.update(forge.util.createBuffer(encrypted));
  decipher.finish();
  return decipher.output.getBytes();
}

// src/sources/jiosaavn/client.ts
var BASE_URL = "https://www.jiosaavn.com/api.php";
var COMMON_PARAMS = "_format=json&_marker=0&api_version=4";
async function jioFetch(params, ctx = "web6dot0") {
  const url = `${BASE_URL}?${COMMON_PARAMS}&ctx=${ctx}&${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  if (!res.ok) throw new Error(`JioSaavn HTTP ${res.status}`);
  return res.json();
}
var DefaultJioSaavnClient = class {
  async searchSongs(query, page = 0, limit = 20) {
    return jioFetch(`__call=search.getResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`);
  }
  async searchAlbums(query, page = 0, limit = 20) {
    return jioFetch(`__call=search.getAlbumResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`);
  }
  async searchArtists(query, page = 0, limit = 20) {
    return jioFetch(`__call=search.getArtistResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`);
  }
  async searchPlaylists(query, page = 0, limit = 20) {
    return jioFetch(`__call=search.getPlaylistResults&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`);
  }
  async searchAll(query) {
    return jioFetch(`__call=autocomplete.get&query=${encodeURIComponent(query)}`);
  }
  async getSong(id) {
    return jioFetch(`__call=song.getDetails&pids=${encodeURIComponent(id)}`);
  }
  async getAlbum(albumId) {
    return jioFetch(`__call=content.getAlbumDetails&albumid=${encodeURIComponent(albumId)}`);
  }
  async getArtist(artistId) {
    return jioFetch(`__call=artist.getArtistPageDetails&artistId=${encodeURIComponent(artistId)}&n_song=10&n_album=10&page=0&sort_order=asc&category=overview`);
  }
  async getPlaylist(playlistId, page = 0, limit = 20) {
    return jioFetch(`__call=playlist.getDetails&listid=${encodeURIComponent(playlistId)}&p=${page}&n=${limit}`);
  }
  async createEntityStation(songId) {
    const entityId = encodeURIComponent(JSON.stringify([encodeURIComponent(songId)]));
    return jioFetch(`__call=webradio.createEntityStation&entity_id=${entityId}&entity_type=queue`, "android");
  }
  async getRadioSongs(stationId, limit = 20) {
    return jioFetch(`__call=webradio.getSong&stationid=${encodeURIComponent(stationId)}&k=${limit}`, "android");
  }
  async getHome(language = "hindi") {
    return jioFetch(`__call=content.getBrowseModules&language=${encodeURIComponent(language)}`);
  }
  async getTrending(entityType, language, limit = 20) {
    return jioFetch(`__call=content.getTrending&entity_type=${entityType}&entity_language=${encodeURIComponent(language)}&n=${limit}`);
  }
  async getFeaturedPlaylists(language, limit = 20) {
    return jioFetch(`__call=content.getFeaturedPlaylists&fetch_from_serialized_files=true&p=1&n=${limit}&languages=${encodeURIComponent(language)}`);
  }
  async getNewReleases(language, limit = 20) {
    return jioFetch(`__call=content.getAlbums&p=1&n=${limit}&languages=${encodeURIComponent(language)}`);
  }
  async getLyrics(id) {
    return jioFetch(`__call=lyrics.getLyrics&lyrics_id=${encodeURIComponent(id)}`);
  }
};

// src/sources/jiosaavn/index.ts
var YOUTUBE_URL_RE = /youtube\.com|youtu\.be/;
var YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
var IMAGE_SIZES = ["50x50", "150x150", "500x500"];
var JIOSAAVN_LANGUAGES = /* @__PURE__ */ new Set([
  "hindi",
  "english",
  "punjabi",
  "tamil",
  "telugu",
  "kannada",
  "malayalam",
  "gujarati",
  "marathi",
  "bengali",
  "bhojpuri",
  "urdu",
  "rajasthani",
  "odia",
  "assamese",
  "haryanvi",
  "sindhi"
]);
function keyToTitle(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
var BITRATE = {
  high: { suffix: "_320", bitrate: 32e4 },
  low: { suffix: "_96", bitrate: 96e3 }
};
function imageToThumbnails(image) {
  if (!image) return [];
  const base = typeof image === "string" ? image : Array.isArray(image) ? image[0]?.link ?? "" : "";
  if (!base) return [];
  return IMAGE_SIZES.map((size) => {
    const [w, h] = size.split("x").map(Number);
    return {
      url: base.replace(/150x150|50x50/, size).replace(/^http:/, "https:"),
      width: w,
      height: h
    };
  });
}
function mapSong(raw) {
  const primaryArtist = raw.more_info?.artistMap?.primary_artists?.[0]?.name ?? raw.subtitle ?? "Unknown Artist";
  return {
    type: "song",
    videoId: `jio:${raw.id}`,
    title: raw.title,
    artist: primaryArtist,
    album: raw.more_info?.album,
    duration: parseInt(raw.more_info?.duration ?? "0", 10),
    thumbnails: imageToThumbnails(raw.image)
  };
}
function mapAlbum(raw) {
  const primaryArtist = raw.more_info?.artistMap?.primary_artists?.[0]?.name ?? "Unknown Artist";
  return {
    type: "album",
    browseId: `jio:${raw.id}`,
    title: raw.title,
    artist: primaryArtist,
    year: raw.year,
    thumbnails: imageToThumbnails(raw.image),
    tracks: []
  };
}
function mapArtist(raw) {
  return {
    type: "artist",
    channelId: `jio:${raw.id}`,
    name: raw.name,
    thumbnails: imageToThumbnails(raw.image),
    songs: [],
    albums: [],
    singles: []
  };
}
function mapPlaylist(raw) {
  return {
    type: "playlist",
    playlistId: `jio:${raw.id}`,
    title: raw.title,
    thumbnails: imageToThumbnails(raw.image)
  };
}
function stripPrefix(id) {
  return id.startsWith("jio:") ? id.slice(4) : id;
}
function extractExpiry(url) {
  const match = url.match(/[?&](?:Expires|expires)=(\d+)/);
  return match ? parseInt(match[1], 10) : Math.floor(Date.now() / 1e3) + 3600;
}
var JioSaavnSource = class {
  constructor(client = new DefaultJioSaavnClient()) {
    this.client = client;
    this.name = "jiosaavn";
  }
  canHandle(query) {
    if (query.startsWith("jio:")) return true;
    if (query.includes("jiosaavn.com")) return true;
    if (YOUTUBE_URL_RE.test(query)) return false;
    if (YOUTUBE_ID_RE.test(query)) return false;
    return true;
  }
  async search(query, options = {}) {
    const { filter } = options;
    if (filter === "songs") {
      const raw2 = await this.client.searchSongs(query, 0, 20);
      return (raw2.results ?? []).map(mapSong);
    }
    if (filter === "albums") {
      const raw2 = await this.client.searchAlbums(query, 0, 20);
      return (raw2.results ?? []).map(mapAlbum);
    }
    if (filter === "artists") {
      const raw2 = await this.client.searchArtists(query, 0, 20);
      return (raw2.results ?? []).map(mapArtist);
    }
    if (filter === "playlists") {
      const raw2 = await this.client.searchPlaylists(query, 0, 20);
      return (raw2.results ?? []).map(mapPlaylist);
    }
    const raw = await this.client.searchAll(query);
    return {
      songs: (raw.songs?.data ?? []).map((s) => ({
        type: "song",
        videoId: `jio:${s.id}`,
        title: s.title,
        artist: s.more_info?.primary_artists ?? "Unknown Artist",
        duration: 0,
        thumbnails: imageToThumbnails(s.image)
      })),
      albums: (raw.albums?.data ?? []).map((a) => ({
        type: "album",
        browseId: `jio:${a.id}`,
        title: a.title,
        artist: a.more_info?.music ?? "Unknown Artist",
        year: a.more_info?.year,
        thumbnails: imageToThumbnails(a.image),
        tracks: []
      })),
      artists: (raw.artists?.data ?? []).map((a) => ({
        type: "artist",
        channelId: `jio:${a.id}`,
        name: a.title,
        thumbnails: imageToThumbnails(a.image),
        songs: [],
        albums: [],
        singles: []
      })),
      playlists: (raw.playlists?.data ?? []).map((p) => ({
        type: "playlist",
        playlistId: `jio:${p.id}`,
        title: p.title,
        thumbnails: imageToThumbnails(p.image)
      }))
    };
  }
  async getStream(id, quality = "high") {
    const raw = await this.client.getSong(stripPrefix(id));
    const song = raw.songs?.[0];
    if (!song) throw new NotFoundError(`JioSaavn: song not found \u2014 ${id}`, id);
    const decrypted = decryptStreamUrl(song.more_info.encrypted_media_url);
    const { suffix, bitrate } = BITRATE[quality];
    const url = decrypted.replace("_96", suffix);
    return { url, codec: "mp4a", mimeType: "audio/mp4", bitrate, expiresAt: extractExpiry(url) };
  }
  async getMetadata(id) {
    const raw = await this.client.getSong(stripPrefix(id));
    const song = raw.songs?.[0];
    if (!song) throw new NotFoundError(`JioSaavn: song not found \u2014 ${id}`, id);
    return { ...mapSong(song), videoId: id.startsWith("jio:") ? id : `jio:${id}` };
  }
  async getAlbum(id) {
    const raw = await this.client.getAlbum(stripPrefix(id));
    const artist = raw.more_info?.artistMap?.primary_artists?.[0]?.name ?? "Unknown Artist";
    const browseId = id.startsWith("jio:") ? id : `jio:${id}`;
    return {
      type: "album",
      browseId,
      title: raw.title,
      artist,
      year: raw.year,
      thumbnails: imageToThumbnails(raw.image),
      tracks: (raw.list ?? []).map((s) => ({ ...mapSong(s) }))
    };
  }
  async getArtist(id) {
    const raw = await this.client.getArtist(stripPrefix(id));
    const channelId = id.startsWith("jio:") ? id : `jio:${id}`;
    return {
      type: "artist",
      channelId,
      name: raw.name,
      thumbnails: imageToThumbnails(raw.image),
      songs: (raw.topSongs ?? []).map(mapSong),
      albums: (raw.topAlbums ?? []).map(mapAlbum),
      singles: (raw.singles ?? []).map((s) => ({
        type: "album",
        browseId: `jio:${s.id}`,
        title: s.title,
        artist: s.more_info?.artistMap?.primary_artists?.[0]?.name ?? raw.name,
        thumbnails: imageToThumbnails(s.image),
        tracks: []
      }))
    };
  }
  async getPlaylist(id) {
    const raw = await this.client.getPlaylist(stripPrefix(id));
    const playlistId = id.startsWith("jio:") ? id : `jio:${id}`;
    return {
      type: "playlist",
      playlistId,
      title: raw.title,
      thumbnails: imageToThumbnails(raw.image),
      songs: (raw.list ?? []).map(mapSong)
    };
  }
  async getRadio(id) {
    const strippedId = stripPrefix(id);
    const { stationid } = await this.client.createEntityStation(strippedId);
    const raw = await this.client.getRadioSongs(stationid, 20);
    return Object.entries(raw).filter(([key, val]) => key !== "stationid" && typeof val === "object" && val !== null && "song" in val).map(([, val]) => mapSong(val.song));
  }
  async getLyrics(id) {
    try {
      const raw = await this.client.getLyrics(stripPrefix(id));
      if (!raw.lyrics) return null;
      return raw.lyrics.replace(/<br\s*\/?>/gi, "\n");
    } catch {
      return null;
    }
  }
  async getHome(language) {
    if (language) {
      return this.getLanguageHome(language);
    }
    const raw = await this.client.getHome();
    const sections = [];
    for (const [key, val] of Object.entries(raw)) {
      if (!Array.isArray(val) || val.length === 0) continue;
      const items = val.filter((item) => item?.type && ["song", "album", "playlist"].includes(item.type)).map((item) => {
        if (item.type === "song") return mapSong(item);
        if (item.type === "album") return mapAlbum(item);
        return mapPlaylist(item);
      });
      if (items.length > 0) {
        sections.push({ title: keyToTitle(key), items });
      }
    }
    return sections;
  }
  async getLanguageHome(language) {
    const [trendingSongs, trendingAlbums, trendingPlaylists, featuredPlaylists, newReleases] = await Promise.allSettled([
      this.client.getTrending("song", language),
      this.client.getTrending("album", language),
      this.client.getTrending("playlist", language),
      this.client.getFeaturedPlaylists(language),
      this.client.getNewReleases(language)
    ]);
    const sections = [];
    const songs = trendingSongs.status === "fulfilled" ? (trendingSongs.value.data ?? []).map(mapSong) : [];
    if (songs.length) sections.push({ title: "Trending Songs", items: songs });
    const albums = trendingAlbums.status === "fulfilled" ? (trendingAlbums.value.data ?? []).map(mapAlbum) : [];
    if (albums.length) sections.push({ title: "Trending Albums", items: albums });
    const releases = newReleases.status === "fulfilled" ? (newReleases.value.data ?? []).map(mapAlbum) : [];
    if (releases.length) sections.push({ title: "New Releases", items: releases });
    const playlists = trendingPlaylists.status === "fulfilled" ? (trendingPlaylists.value.data ?? []).map(mapPlaylist) : [];
    if (playlists.length) sections.push({ title: "Trending Playlists", items: playlists });
    const featured = featuredPlaylists.status === "fulfilled" ? (featuredPlaylists.value.data ?? []).map(mapPlaylist) : [];
    if (featured.length) sections.push({ title: "Featured Playlists", items: featured });
    return sections;
  }
  async getFeaturedPlaylists(language) {
    try {
      const lang = language ?? "hindi";
      const raw = await this.client.getFeaturedPlaylists(lang);
      return (raw.data ?? []).map(mapPlaylist);
    } catch {
      return [];
    }
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
        if (wordText) words.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text: wordText });
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
async function fetchFromLrclib(artist, title) {
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "User-Agent": "musicstream-sdk (https://github.com/addynoven/music-package)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.plainLyrics) return null;
    return {
      plain: data.plainLyrics.trim(),
      synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null
    };
  } catch {
    return null;
  }
}

// src/lyrics/lyrics-ovh.ts
async function fetchFromLyricsOvh(artist, title) {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const plain = data.lyrics?.trim();
    if (!plain) return null;
    return { plain, synced: null };
  } catch {
    return null;
  }
}

// src/utils/url-resolver.ts
var JIOSAAVN_RE = /^https?:\/\/(?:www\.)?jiosaavn\.com\//;
var YTM_BASE = "music.youtube.com";
var SPOTIFY_TRACK_RE = /^https?:\/\/open\.spotify\.com\/track\//;
var TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
function resolveInput(input) {
  if (!input) return input;
  const jio = resolveJioSaavnUrl(input);
  if (jio !== null) return jio;
  const yt = resolveYouTubeUrl(input);
  if (yt !== null) return yt;
  const ytm = resolveYouTubeMusicUrl(input);
  if (ytm !== null) return ytm;
  return input;
}
function resolveJioSaavnUrl(input) {
  if (!JIOSAAVN_RE.test(input)) return null;
  try {
    const url = new URL(input);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const id = segments[segments.length - 1];
    if (!id) return null;
    return `jio:${id}`;
  } catch {
    return null;
  }
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

// src/utils/stream-utils.ts
var EXPIRY_BUFFER_SECONDS = 300;
function isStreamExpired(stream) {
  return Math.floor(Date.now() / 1e3) > stream.expiresAt - EXPIRY_BUFFER_SECONDS;
}

// src/discovery/ranker.ts
var TITLE_NOISE = /\b(live|cover|remix|karaoke|tribute|instrumental|acoustic|demo|remaster|bamboo|anniversary)\b/i;
var ALBUM_NOISE = /\b(party|mix|hits|summer|workout|greatest|essential|ultimate|collection)\b/i;
function titleScore(title) {
  return TITLE_NOISE.test(title) ? 0 : 1;
}
function albumScore(album) {
  if (!album) return 1;
  return ALBUM_NOISE.test(album) ? 0 : 1;
}
function dominantCleanArtist(songs) {
  const counts = /* @__PURE__ */ new Map();
  for (const s of songs) {
    if (titleScore(s.title) === 0) continue;
    const key = s.artist.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let max = 0;
  let dominant = "";
  for (const [artist, count] of counts) {
    if (count > max) {
      max = count;
      dominant = artist;
    }
  }
  return dominant;
}
function rankSongs(songs) {
  if (songs.length === 0) return [];
  const buckets = songs.map((s) => s.duration ? Math.round(s.duration / 10) : null);
  const validBuckets = buckets.filter((b) => b !== null);
  const mean = validBuckets.length ? validBuckets.reduce((a, b) => a + b, 0) / validBuckets.length : 0;
  const variance = validBuckets.length ? validBuckets.reduce((sum, b) => sum + (b - mean) ** 2, 0) / validBuckets.length : 0;
  const stdDev = Math.sqrt(variance) || 1;
  const dominant = dominantCleanArtist(songs);
  const scored = songs.map((s, i) => {
    const ts = titleScore(s.title) * 0.4;
    const b = buckets[i] ?? mean;
    const z2 = Math.abs(b - mean) / stdDev;
    const ds = Math.max(0, 1 - z2 / 2) * 0.35;
    const as = albumScore(s.album) * 0.15;
    const artistBoost = dominant && s.artist.toLowerCase() === dominant ? 0.1 : 0;
    return { song: s, score: ts + ds + as + artistBoost };
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.song);
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
function resolveSourceOrder(pref) {
  if (!pref || pref === "best") return ["youtube", "jiosaavn"];
  return pref;
}
var MusicKit = class _MusicKit {
  constructor(config = {}, _yt) {
    this.searchCache = /* @__PURE__ */ new Map();
    this.sources = [];
    this._discovery = null;
    this._stream = null;
    this._downloader = null;
    this._identifier = null;
    this._podcast = null;
    this._ytPromise = null;
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
    if (_yt) {
      this._discovery = new DiscoveryClient(_yt);
      this._stream = new StreamResolver(this.cache, config.cookiesPath);
      this._downloader = new Downloader(this._stream, this._discovery, config.cookiesPath);
    }
    if (!config.youtubeApiKey && !config.cookiesPath) {
      this.log.warn("[MusicKit] No youtubeApiKey or cookiesPath configured. You may hit YouTube rate limits under heavy usage. Recommendation: set youtubeApiKey for search, cookiesPath for streams.");
    }
    if (!config.identify?.acoustidApiKey) {
      this.log.warn("[MusicKit] identify() is unavailable \u2014 no acoustidApiKey set. Get a free key at acoustid.org and pass it as config.identify.acoustidApiKey.");
    }
  }
  static async create(config = {}) {
    const yt = await Innertube.create({
      generate_session_locally: true,
      ...config.language ? { lang: config.language } : {},
      ...config.location ? { location: config.location } : {}
    });
    return new _MusicKit(config, yt);
  }
  registerSource(source) {
    this.sources.push(source);
  }
  sourceFor(query, override) {
    if (override) {
      const targetName = override === "youtube" ? "youtube-music" : "jiosaavn";
      const found = this.sources.find((s) => s.name === targetName);
      if (!found) throw new ValidationError(`Source '${override}' is not registered \u2014 check your sourceOrder config`, "sourceOrder");
      return found;
    }
    const source = this.sources.find((s) => s.canHandle(query));
    if (!source) throw new NotFoundError(`No source can handle: ${query}`, query);
    return source;
  }
  async ensureClients() {
    if (!this._discovery) {
      if (!this._ytPromise) {
        this._ytPromise = Innertube.create({
          generate_session_locally: true,
          ...this.config.language ? { lang: this.config.language } : {},
          ...this.config.location ? { location: this.config.location } : {}
        });
      }
      const yt = await this._ytPromise;
      this._discovery = new DiscoveryClient(yt);
      this._stream = new StreamResolver(this.cache, this.config.cookiesPath);
      this._downloader = new Downloader(this._stream, this._discovery, this.config.cookiesPath);
    }
    if (this.sources.length === 0) {
      for (const name of this.sourceOrder) {
        if (name === "jiosaavn") this.sources.push(new JioSaavnSource());
        if (name === "youtube") {
          this.sources.push(
            this.config.youtubeApiKey ? new YouTubeDataAPISource(this.config.youtubeApiKey, this._stream) : new YouTubeMusicSource(this._discovery, this._stream)
          );
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
    if (resolved.startsWith("jio:")) return [];
    const cacheKey = `autocomplete:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    await this.ensureClients();
    const result = await this.call("autocomplete", () => this._discovery.autocomplete(resolved));
    this.cache.set(cacheKey, result, 60);
    return result;
  }
  async search(query, options) {
    const resolved = resolveInput(query);
    const cacheKey = `search:${resolved}:${options?.filter ?? "all"}:${options?.limit ?? "default"}:${options?.source ?? "auto"}`;
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
    const { source: sourceOverride, ...searchOpts } = options ?? {};
    const raw = await this.call("search", () => this.sourceFor(resolved, sourceOverride).search(resolved, searchOpts));
    const isJioResults = (songs) => songs.length > 0 && songs[0].videoId.startsWith("jio:");
    const result = options?.filter === "songs" ? isJioResults(raw) ? rankSongs(raw) : raw : !Array.isArray(raw) ? isJioResults(raw.songs) ? { ...raw, songs: rankSongs(raw.songs) } : raw : raw;
    this.searchCache.set(cacheKey, result);
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getStream(videoId, options) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    const quality = options?.quality ?? "high";
    if (id.startsWith("jio:")) {
      const cacheKey = `stream:${id}:${quality}`;
      const cached = this.cache.get(cacheKey);
      if (cached && !isStreamExpired(cached)) return cached;
      const result = await this.call("stream", () => this.sourceFor(id).getStream(id, quality));
      this.cache.set(cacheKey, result, Cache.TTL.STREAM);
      return result;
    }
    return this.call("stream", () => this.sourceFor(id).getStream(id, quality));
  }
  async getTrack(videoId) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    const src = this.sourceFor(id);
    const [song, streamData] = await Promise.all([
      id.startsWith("jio:") ? this.call("browse", () => src.getMetadata(id)) : this.call("browse", () => this._discovery.getInfo(id)),
      this.call("stream", () => src.getStream(id, "high"))
    ]);
    return { ...song, stream: streamData };
  }
  async getHome(options) {
    await this.ensureClients();
    const lang = options?.language;
    const cacheKey = `home:${lang ?? "default"}:${options?.source ?? "auto"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    let result;
    if (options?.source === "youtube") {
      result = await this.call("browse", () => this._discovery.getHome());
    } else if (options?.source === "jiosaavn") {
      const src = this.sources.find((s) => s.name === "jiosaavn" && s.getHome);
      result = src ? await this.call("browse", () => src.getHome(lang)) : [];
    } else {
      const useJio = !lang || JIOSAAVN_LANGUAGES.has(lang);
      if (useJio) {
        const src = this.sources.find((s) => s.getHome);
        result = src ? await this.call("browse", () => src.getHome(lang)) : await this.call("browse", () => this._discovery.getHome());
      } else {
        result = await this.call("browse", () => this._discovery.getHome());
      }
    }
    this.cache.set(cacheKey, result, Cache.TTL.HOME);
    return result;
  }
  async getFeaturedPlaylists(options) {
    await this.ensureClients();
    const cacheKey = `featured:${options?.language ?? "default"}:${options?.source ?? "auto"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const targetName = options?.source === "youtube" ? "youtube-music" : options?.source === "jiosaavn" ? "jiosaavn" : null;
    const src = targetName ? this.sources.find((s) => s.name === targetName && s.getFeaturedPlaylists) : this.sources.find((s) => s.getFeaturedPlaylists);
    const result = src ? await this.call("browse", () => src.getFeaturedPlaylists(options?.language)) : [];
    if (result.length > 0) this.cache.set(cacheKey, result, Cache.TTL.HOME);
    return result;
  }
  async getArtist(channelId) {
    await this.ensureClients();
    const id = resolveInput(channelId);
    const cacheKey = `artist:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const result = id.startsWith("jio:") ? await (async () => {
      const src = this.sourceFor(id);
      if (src.getArtist) return this.call("browse", () => src.getArtist(id));
      return this.call("browse", () => this._discovery.getArtist(id));
    })() : await this.call("browse", () => this._discovery.getArtist(id));
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST);
    return result;
  }
  async getAlbum(browseId) {
    await this.ensureClients();
    const id = resolveInput(browseId);
    const cacheKey = `album:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const result = id.startsWith("jio:") ? await (async () => {
      const src = this.sourceFor(id);
      if (src.getAlbum) return this.call("browse", () => src.getAlbum(id));
      return this.call("browse", () => this._discovery.getAlbum(id));
    })() : await this.call("browse", () => this._discovery.getAlbum(id));
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST);
    return result;
  }
  async getPlaylist(playlistId) {
    await this.ensureClients();
    const id = resolveInput(playlistId);
    const cacheKey = `playlist:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const result = id.startsWith("jio:") ? await (async () => {
      const src = this.sourceFor(id);
      if (src.getPlaylist) return this.call("browse", () => src.getPlaylist(id));
      return this.call("browse", () => this._discovery.getPlaylist(id));
    })() : await this.call("browse", () => this._discovery.getPlaylist(id));
    this.cache.set(cacheKey, result, Cache.TTL.ARTIST);
    return result;
  }
  async getRadio(videoId) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    const cacheKey = `radio:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const result = id.startsWith("jio:") ? await (async () => {
      const src = this.sourceFor(id);
      if (src.getRadio) return this.call("browse", () => src.getRadio(id));
      return this.call("browse", () => this._discovery.getRadio(id));
    })() : await this.call("browse", () => this._discovery.getRadio(id));
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getRelated(videoId) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    const cacheKey = `related:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const result = await this.call("browse", () => this._discovery.getRelated(id));
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getSuggestions(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    const cacheKey = `suggestions:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    let result;
    if (resolved.startsWith("jio:")) {
      const src = this.sourceFor(resolved);
      try {
        const meta = await this.getMetadata(resolved);
        const query = `${meta.title} ${meta.artist}`;
        const ytSongs = await this.search(query, { filter: "songs" });
        const ytId = ytSongs[0]?.videoId;
        if (ytId) {
          result = await this.getRelated(ytId);
          this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
          return result;
        }
      } catch {
      }
      result = src.getRadio ? await this.call("browse", () => src.getRadio(resolved)) : [];
    } else {
      result = await this.getRelated(resolved);
    }
    this.cache.set(cacheKey, result, Cache.TTL.SEARCH);
    return result;
  }
  async getMetadata(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    const cacheKey = `metadata:${resolved}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const result = resolved.startsWith("jio:") ? await this.call("browse", () => this.sourceFor(resolved).getMetadata(resolved)) : await this.call("browse", () => this._discovery.getInfo(resolved));
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
      lyrics = await fetchFromLrclib(artist, title) ?? await fetchFromLyricsOvh(artist, title);
    } catch {
    }
    if (lyrics) this.cache.set(cacheKey, lyrics, Cache.TTL.LYRICS);
    return lyrics;
  }
  async getCharts(options) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getCharts(options));
  }
  async getMoodCategories() {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getMoodCategories());
  }
  async getMoodPlaylists(params) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getMoodPlaylists(params));
  }
  async download(videoId, options) {
    await this.ensureClients();
    let id = resolveInput(videoId);
    if (id.startsWith("jio:")) {
      const meta = await this.sourceFor(id).getMetadata(id);
      const ytSongs = await this._discovery.search(`${meta.title} ${meta.artist}`, { filter: "songs" });
      const match = ytSongs.find((s) => s.videoId && !s.videoId.startsWith("jio:"));
      if (!match?.videoId) throw new NotFoundError(`No downloadable YouTube equivalent found for: ${id}`, id);
      id = match.videoId;
    }
    return this._downloader.download(id, options);
  }
  async streamAudio(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    if (resolved.startsWith("jio:")) {
      const streamData = await this.call("stream", () => this.sourceFor(resolved).getStream(resolved, "high"));
      const response = await fetch(streamData.url);
      if (!response.ok) throw new NetworkError(`Stream fetch failed: ${response.status}`, response.status);
      const { Readable } = await import("stream");
      return Readable.fromWeb(response.body);
    }
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
        songrecBin: this.config.identify.songrecBin
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
var version = "1.0.1";

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
export {
  AlbumSchema,
  ArtistSchema,
  Cache,
  DiscoveryClient,
  Downloader,
  HttpError,
  Identifier,
  JIOSAAVN_LANGUAGES,
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
};
