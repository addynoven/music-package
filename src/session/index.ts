import { Cache } from '../cache'
import { fetchYouTubeHomePage } from './fetcher'

const FALLBACK_VISITOR_ID = 'CgtBQnlVMnBiVFJPYyiD7pK_BjIK'
const DEFAULT_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface SessionOptions {
  visitorId?: string
  userAgent?: string
}

export class SessionManager {
  private readonly cache: Cache
  private readonly options: SessionOptions

  constructor(cache: Cache, options: SessionOptions = {}) {
    this.cache = cache
    this.options = options
  }

  async getVisitorId(): Promise<string> {
    if (this.options.visitorId) return this.options.visitorId

    const cached = this.cache.get<string>('visitor_id')
    if (cached) return cached

    return this.fetchAndCache()
  }

  async refreshVisitorId(): Promise<string> {
    this.cache.delete('visitor_id')
    return this.fetchAndCache()
  }

  async buildHeaders(): Promise<Record<string, string>> {
    const visitorId = await this.getVisitorId()
    return {
      'User-Agent': this.options.userAgent ?? DEFAULT_UA,
      'Origin': 'https://music.youtube.com/',
      'Content-Type': 'application/json',
      'Cookie': 'CONSENT=YES+1; GPS=1',
      'X-Goog-Visitor-Id': visitorId,
    }
  }

  private async fetchAndCache(): Promise<string> {
    try {
      const html = await fetchYouTubeHomePage()
      const match = html.match(/"VISITOR_DATA":"([^"]+)"/)
      const id = match?.[1] ?? FALLBACK_VISITOR_ID
      this.cache.set('visitor_id', id, Cache.TTL.VISITOR_ID)
      return id
    } catch {
      return FALLBACK_VISITOR_ID
    }
  }
}
