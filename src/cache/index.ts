import Database from 'better-sqlite3'

interface CacheOptions {
  enabled: boolean
  path?: string
}

const URL_EXPIRY_BUFFER = 1800 // 30 minutes in seconds

export class Cache {
  static readonly TTL = {
    STREAM: 21_600,
    SEARCH: 300,
    HOME: 28_800,
    ARTIST: 3_600,
    VISITOR_ID: 2_592_000,
  } as const

  private db: Database.Database | null = null
  private readonly enabled: boolean

  constructor(options: CacheOptions) {
    this.enabled = options.enabled
    if (!this.enabled) return

    this.db = new Database(options.path ?? ':memory:')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `)
  }

  get<T = unknown>(key: string): T | null {
    if (!this.enabled || !this.db) return null

    const row = this.db
      .prepare('SELECT value, expires_at FROM cache WHERE key = ?')
      .get(key) as { value: string; expires_at: number } | undefined

    if (!row) return null
    if (Date.now() > row.expires_at) {
      this.db.prepare('DELETE FROM cache WHERE key = ?').run(key)
      return null
    }

    return JSON.parse(row.value) as T
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    if (!this.enabled || !this.db) return

    this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, expires_at)
      VALUES (?, ?, ?)
    `).run(key, JSON.stringify(value), Date.now() + ttlSeconds * 1000)
  }

  delete(key: string): void {
    if (!this.enabled || !this.db) return
    this.db.prepare('DELETE FROM cache WHERE key = ?').run(key)
  }

  isUrlExpired(url: string): boolean {
    try {
      const expire = new URL(url).searchParams.get('expire')
      if (!expire) return true
      const expiresAt = parseInt(expire, 10)
      const nowSeconds = Math.floor(Date.now() / 1000)
      return nowSeconds >= expiresAt - URL_EXPIRY_BUFFER
    } catch {
      return true
    }
  }

  close(): void {
    this.db?.close()
    this.db = null
  }
}
