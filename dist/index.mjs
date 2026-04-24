// src/musickit/index.ts
import { Innertube } from "youtubei.js";

// src/cache/index.ts
import { DatabaseSync } from "sqlite";
var URL_EXPIRY_BUFFER = 1800;
var Cache = class {
  constructor(options) {
    this.db = null;
    this.enabled = options.enabled;
    if (!this.enabled) return;
    this.db = new DatabaseSync(options.path ?? ":memory:");
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
      if (options.filter === "playlists") return items.map(mapPlaylistItem);
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
      title: extractText(s.title) || extractText(s.header?.title) || "",
      items: (s.contents ?? []).map(mapSongItem)
    })).filter((s) => !isEmptySection(s.title, s.items));
  }
  async getArtist(channelId) {
    const res = await this.yt.music.getArtist(channelId);
    if (!res) throw new Error(`Artist not found: ${channelId}`);
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
    if (!res) throw new Error(`Album not found: ${browseId}`);
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
    if (!res) throw new Error(`Playlist not found: ${playlistId}`);
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
      return (res?.contents ?? []).flatMap((s) => s.contents ?? []).map(mapSongItem);
    } catch {
      try {
        const res = await this.yt.music.getUpNext(videoId);
        return (res?.contents ?? []).map(mapSongItem);
      } catch {
        return [];
      }
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
import { Platform } from "youtubei.js/agnostic";
function patchEvalIfNeeded() {
  try {
    const shim = Platform.shim;
    if (shim && typeof shim.eval === "function") {
      Platform.load({
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
      if (err) {
        reject(new Error(`yt-dlp failed: ${(err.stderr ?? String(err)).slice(0, 200)}`));
        return;
      }
      try {
        const json = JSON.parse(stdout);
        const url = json.url;
        const acodec = json.acodec ?? "";
        const codec = acodec.includes("opus") ? "opus" : "mp4a";
        const bitrateKbps = json.abr ?? json.tbr ?? 0;
        const sizeBytes = json.filesize ?? json.filesize_approx ?? void 0;
        resolve({
          url,
          codec,
          bitrate: Math.round(bitrateKbps * 1e3),
          expiresAt: parseExpiry(url),
          ...sizeBytes != null && { sizeBytes }
        });
      } catch (parseErr) {
        reject(new Error(`Failed to parse yt-dlp output: ${parseErr}`));
      }
    });
  });
}
var StreamResolver = class {
  constructor(cache, yt, cookiesPath) {
    this.cache = cache;
    this.yt = yt;
    this.cookiesPath = cookiesPath;
    patchEvalIfNeeded();
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
var INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
function sanitize(name) {
  return name.replace(INVALID_CHARS, "").trim();
}
function ytdlpDownload(videoId, destFile, format, cookiesPath) {
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
      "-o",
      destFile,
      `https://music.youtube.com/watch?v=${videoId}`
    ]);
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d;
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
  async download(videoId, options = {}) {
    const format = options.format ?? "opus";
    const codec = format === "m4a" ? "mp4a" : "opus";
    const [stream, song] = await Promise.all([
      this.resolver.resolve(videoId, { codec }),
      options._mockSong ? Promise.resolve(options._mockSong) : this.discovery.getInfo(videoId)
    ]);
    const filename = `${sanitize(song.title)} (${sanitize(song.artist)}).${format}`;
    const dest = join(options.path ?? ".", filename);
    if (options._mockReadStream) {
      const writeStream2 = createWriteStream(dest);
      return this.readWithProgress(options._mockReadStream, writeStream2, stream.sizeBytes, options.onProgress);
    }
    const { mkdir } = await import("fs/promises");
    await mkdir(options.path ?? ".", { recursive: true });
    const writeStream = createWriteStream(dest);
    try {
      await this.fetchAndWrite(stream.url, writeStream, stream.sizeBytes, options.onProgress);
    } catch (err) {
      writeStream.destroy();
      if (err.message?.includes("403") || err.message?.includes("audio fetch failed")) {
        const { unlink } = await import("fs/promises");
        await unlink(dest).catch(() => {
        });
        await ytdlpDownload(videoId, dest, format, this.cookiesPath);
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
      writeStream.on("error", (err) => {
        writeStream.destroy();
        reject(err);
      });
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
        writeStream.once("finish", resolve);
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
    if (!song) throw new Error(`JioSaavn: song not found \u2014 ${id}`);
    const decrypted = decryptStreamUrl(song.more_info.encrypted_media_url);
    const { suffix, bitrate } = BITRATE[quality];
    const url = decrypted.replace("_96", suffix);
    return { url, codec: "mp4a", bitrate, expiresAt: extractExpiry(url) };
  }
  async getMetadata(id) {
    const raw = await this.client.getSong(stripPrefix(id));
    const song = raw.songs?.[0];
    if (!song) throw new Error(`JioSaavn: song not found \u2014 ${id}`);
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

// src/utils/url-resolver.ts
var JIOSAAVN_RE = /^https?:\/\/(?:www\.)?jiosaavn\.com\//;
var YTM_BASE = "music.youtube.com";
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
    const z = Math.abs(b - mean) / stdDev;
    const ds = Math.max(0, 1 - z / 2) * 0.35;
    const as = albumScore(s.album) * 0.15;
    const artistBoost = dominant && s.artist.toLowerCase() === dominant ? 0.1 : 0;
    return { song: s, score: ts + ds + as + artistBoost };
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.song);
}

// src/musickit/index.ts
function makeReq(endpoint) {
  return { method: "GET", endpoint, headers: {}, body: null };
}
function resolveSourceOrder(pref = "default") {
  if (pref === "default") return ["jiosaavn", "youtube"];
  if (pref === "best") return ["youtube", "jiosaavn"];
  return pref;
}
var MusicKit = class _MusicKit {
  constructor(config = {}, _yt) {
    this.searchCache = /* @__PURE__ */ new Map();
    this.sources = [];
    this._discovery = null;
    this._stream = null;
    this._downloader = null;
    this._ytPromise = null;
    this.config = config;
    this.sourceOrder = resolveSourceOrder(config.sourceOrder ?? "best");
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
      this._stream = new StreamResolver(this.cache, _yt, config.cookiesPath);
      this._downloader = new Downloader(this._stream, this._discovery, config.cookiesPath);
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
      if (!found) throw new Error(`Source '${override}' is not registered \u2014 check your sourceOrder config`);
      return found;
    }
    const source = this.sources.find((s) => s.canHandle(query));
    if (!source) throw new Error(`No source can handle: ${query}`);
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
      this._stream = new StreamResolver(this.cache, yt, this.config.cookiesPath);
      this._downloader = new Downloader(this._stream, this._discovery, this.config.cookiesPath);
    }
    if (this.sources.length === 0) {
      for (const name of this.sourceOrder) {
        if (name === "jiosaavn") this.sources.push(new JioSaavnSource());
        if (name === "youtube") this.sources.push(new YouTubeMusicSource(this._discovery, this._stream));
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
  async autocomplete(query) {
    await this.ensureClients();
    const resolved = resolveInput(query);
    if (resolved.startsWith("jio:")) return [];
    return this.call("autocomplete", () => this._discovery.autocomplete(resolved));
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
    if (options?.source === "youtube") {
      return this.call("browse", () => this._discovery.getHome());
    }
    if (options?.source === "jiosaavn") {
      const src = this.sources.find((s) => s.name === "jiosaavn" && s.getHome);
      if (src) return this.call("browse", () => src.getHome(lang));
      return [];
    }
    const useJio = !lang || JIOSAAVN_LANGUAGES.has(lang);
    if (useJio) {
      const src = this.sources.find((s) => s.getHome);
      if (src) return this.call("browse", () => src.getHome(lang));
    }
    return this.call("browse", () => this._discovery.getHome());
  }
  async getFeaturedPlaylists(options) {
    await this.ensureClients();
    const targetName = options?.source === "youtube" ? "youtube-music" : options?.source === "jiosaavn" ? "jiosaavn" : null;
    const src = targetName ? this.sources.find((s) => s.name === targetName && s.getFeaturedPlaylists) : this.sources.find((s) => s.getFeaturedPlaylists);
    if (src) return this.call("browse", () => src.getFeaturedPlaylists(options?.language));
    return [];
  }
  async getArtist(channelId) {
    await this.ensureClients();
    const id = resolveInput(channelId);
    if (id.startsWith("jio:")) {
      const src = this.sourceFor(id);
      if (src.getArtist) return this.call("browse", () => src.getArtist(id));
    }
    return this.call("browse", () => this._discovery.getArtist(id));
  }
  async getAlbum(browseId) {
    await this.ensureClients();
    const id = resolveInput(browseId);
    if (id.startsWith("jio:")) {
      const src = this.sourceFor(id);
      if (src.getAlbum) return this.call("browse", () => src.getAlbum(id));
    }
    return this.call("browse", () => this._discovery.getAlbum(id));
  }
  async getPlaylist(playlistId) {
    await this.ensureClients();
    const id = resolveInput(playlistId);
    if (id.startsWith("jio:")) {
      const src = this.sourceFor(id);
      if (src.getPlaylist) return this.call("browse", () => src.getPlaylist(id));
    }
    return this.call("browse", () => this._discovery.getPlaylist(id));
  }
  async getRadio(videoId) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    if (id.startsWith("jio:")) {
      const src = this.sourceFor(id);
      if (src.getRadio) return this.call("browse", () => src.getRadio(id));
    }
    return this.call("browse", () => this._discovery.getRadio(id));
  }
  async getRelated(videoId) {
    await this.ensureClients();
    const id = resolveInput(videoId);
    return this.call("browse", () => this._discovery.getRelated(id));
  }
  async getSuggestions(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    if (resolved.startsWith("jio:")) {
      const src = this.sourceFor(resolved);
      try {
        const meta = await src.getMetadata(resolved);
        const query = `${meta.title} ${meta.artist}`;
        const ytSongs = await this._discovery.search(query, { filter: "songs" });
        const ytId = ytSongs[0]?.videoId;
        if (ytId) {
          return await this._discovery.getRelated(ytId);
        }
      } catch {
      }
      if (src.getRadio) return this.call("browse", () => src.getRadio(resolved));
      return [];
    }
    return this.call("browse", () => this._discovery.getRelated(resolved));
  }
  async getMetadata(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    if (resolved.startsWith("jio:")) {
      return this.call("browse", () => this.sourceFor(resolved).getMetadata(resolved));
    }
    return this.call("browse", () => this._discovery.getInfo(resolved));
  }
  async getLyrics(id) {
    await this.ensureClients();
    const resolved = resolveInput(id);
    if (resolved.startsWith("jio:")) {
      const src = this.sourceFor(resolved);
      if (src.getLyrics) return src.getLyrics(resolved);
    }
    return null;
  }
  async getCharts(options) {
    await this.ensureClients();
    return this.call("browse", () => this._discovery.getCharts(options));
  }
  async download(videoId, options) {
    await this.ensureClients();
    let id = resolveInput(videoId);
    if (id.startsWith("jio:")) {
      const meta = await this.sourceFor(id).getMetadata(id);
      const ytSongs = await this._discovery.search(`${meta.title} ${meta.artist}`, { filter: "songs" });
      const match = ytSongs.find((s) => s.videoId && !s.videoId.startsWith("jio:"));
      if (!match?.videoId) throw new Error(`No downloadable YouTube equivalent found for: ${id}`);
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
      if (!response.ok) throw new Error(`Stream fetch failed: ${response.status}`);
      const { Readable } = await import("stream");
      return Readable.fromWeb(response.body);
    }
    return this._downloader.streamAudio(resolved);
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
  Cache,
  DiscoveryClient,
  Downloader,
  HttpError,
  JIOSAAVN_LANGUAGES,
  MusicKit,
  MusicKitEmitter,
  MusicKitErrorCode,
  RateLimiter,
  RetryEngine,
  SearchFilter,
  SessionManager,
  StreamResolver,
  getBestThumbnail,
  isStreamExpired
};
