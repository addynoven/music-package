import { Innertube, ClientType } from 'youtubei.js'
import type { StreamClient } from './multi-client.js'

// ─── StreamClient → ClientType mapping ───────────────────────────────────────
//
// youtubei.js ClientType enum values (from Session.d.ts):
//   ClientType.MUSIC        = "WEB_REMIX"   ← used for both 'YTMUSIC' and 'WEB_REMIX'
//   ClientType.ANDROID_VR   = "ANDROID_VR"  ← no PoToken required; best for non-age-restricted
//   ClientType.TV           = "TVHTML5"     ← full TVHTML5 client (not the embedded variant)
//
// Note: Our StreamClient 'YTMUSIC' maps to ClientType.MUSIC ("WEB_REMIX") because
// the CLIENTS constant in Constants.d.ts shows YTMUSIC.NAME === "WEB_REMIX".
// There is no separate "YTMUSIC" string in youtubei.js — WEB_REMIX is the correct value.

const CLIENT_TYPE_MAP: Record<StreamClient, ClientType> = {
  YTMUSIC: ClientType.MUSIC,    // "WEB_REMIX"
  ANDROID_VR: ClientType.ANDROID_VR, // "ANDROID_VR"
  TVHTML5: ClientType.TV,       // "TVHTML5"
  WEB_REMIX: ClientType.MUSIC,  // "WEB_REMIX" — same as YTMUSIC
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface InnertubePoolOptions {
  /** Fetch override (proxy + session headers) — same one passed to existing Innertube.create */
  fetch?: typeof globalThis.fetch
  /** Cookie header string for authenticated sessions */
  cookie?: string
  /** Locale */
  lang?: string
  /** Country */
  location?: string
  /**
   * Static PoToken — NOT passed at session-create time (Innertube doesn't accept it
   * there in a meaningful way for per-request use). Stored here for caller retrieval;
   * the resolver passes it per-call.
   */
  poToken?: string
  /**
   * Async PoToken generator — called per (videoId, client) when poToken is needed.
   * NOT passed at session-create time; resolver passes it per-call.
   */
  getPoToken?: (videoId: string, client: StreamClient) => Promise<string | null>
}

// ─── InnertubePool ────────────────────────────────────────────────────────────

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
export class InnertubePool {
  private readonly options: InnertubePoolOptions
  // Cache stores Promise<Innertube> so concurrent gets for the same client
  // share a single in-flight create rather than spawning N parallel sessions.
  private readonly cache = new Map<StreamClient, Promise<Innertube>>()

  constructor(options: InnertubePoolOptions = {}) {
    this.options = options
  }

  /**
   * Returns a cached `Innertube` instance for the given client, creating one
   * on first use. Concurrent calls for the same client share one in-flight
   * `Innertube.create` promise.
   */
  get(client: StreamClient): Promise<Innertube> {
    const existing = this.cache.get(client)
    if (existing !== undefined) return existing

    const promise = Innertube.create({
      client_type: CLIENT_TYPE_MAP[client],
      generate_session_locally: true,
      ...(this.options.fetch !== undefined && { fetch: this.options.fetch }),
      ...(this.options.cookie !== undefined && { cookie: this.options.cookie }),
      ...(this.options.lang !== undefined && { lang: this.options.lang }),
      ...(this.options.location !== undefined && { location: this.options.location }),
    })

    this.cache.set(client, promise)
    return promise
  }

  /**
   * Returns `true` if a (resolved or pending) entry exists for the given client.
   */
  has(client: StreamClient): boolean {
    return this.cache.has(client)
  }

  /**
   * Returns the list of client types that have been loaded (resolved or pending).
   */
  clients(): StreamClient[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Clears the pool. Subsequent `get` calls will re-create instances.
   * Returns a Promise for symmetry with potential future async cleanup.
   */
  async close(): Promise<void> {
    this.cache.clear()
  }
}
