import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionManager } from '../../../src/session'
import { Cache } from '../../../src/cache'

// Mock the HTTP module used by SessionManager to fetch music.youtube.com
vi.mock('../../../src/session/fetcher', () => ({
  fetchYouTubeHomePage: vi.fn(),
}))

import { fetchYouTubeHomePage } from '../../../src/session/fetcher'

const mockFetch = fetchYouTubeHomePage as ReturnType<typeof vi.fn>

describe('SessionManager', () => {
  let cache: Cache

  beforeEach(() => {
    cache = new Cache({ enabled: true })
    vi.clearAllMocks()
  })

  // ─── visitor ID generation ────────────────────────────────────────────────

  describe('getVisitorId', () => {
    it('parses VISITOR_DATA from the YouTube home page HTML', async () => {
      mockFetch.mockResolvedValue(
        '<script>ytcfg.set({"VISITOR_DATA":"CgtBQnlVMnBiVFJPYyiD7pK_BjIK"})</script>'
      )

      const session = new SessionManager(cache)
      const id = await session.getVisitorId()

      expect(id).toBe('CgtBQnlVMnBiVFJPYyiD7pK_BjIK')
    })

    it('caches the visitor ID — does not fetch again on second call', async () => {
      mockFetch.mockResolvedValue(
        '<script>ytcfg.set({"VISITOR_DATA":"CachedId123"})</script>'
      )

      const session = new SessionManager(cache)
      await session.getVisitorId()
      await session.getVisitorId()

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('returns cached ID without fetching when already in cache', async () => {
      cache.set('visitor_id', 'PreCachedId', Cache.TTL.VISITOR_ID)

      const session = new SessionManager(cache)
      const id = await session.getVisitorId()

      expect(id).toBe('PreCachedId')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('falls back to hardcoded ID when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'))

      const session = new SessionManager(cache)
      const id = await session.getVisitorId()

      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('falls back to hardcoded ID when HTML contains no VISITOR_DATA', async () => {
      mockFetch.mockResolvedValue('<html>no ytcfg here</html>')

      const session = new SessionManager(cache)
      const id = await session.getVisitorId()

      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })
  })

  // ─── refreshVisitorId ─────────────────────────────────────────────────────

  describe('refreshVisitorId', () => {
    it('clears the cached ID and fetches a new one', async () => {
      cache.set('visitor_id', 'OldId', Cache.TTL.VISITOR_ID)
      mockFetch.mockResolvedValue(
        '<script>ytcfg.set({"VISITOR_DATA":"BrandNewId999"})</script>'
      )

      const session = new SessionManager(cache)
      const newId = await session.refreshVisitorId()

      expect(newId).toBe('BrandNewId999')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  // ─── buildHeaders ─────────────────────────────────────────────────────────

  describe('buildHeaders', () => {
    it('includes all required YouTube Music headers', async () => {
      const session = new SessionManager(cache, { visitorId: 'test-id' })
      const headers = await session.buildHeaders()

      expect(headers['User-Agent']).toContain('Mozilla')
      expect(headers['Origin']).toBe('https://music.youtube.com/')
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['Cookie']).toContain('CONSENT=YES+1')
      expect(headers['X-Goog-Visitor-Id']).toBe('test-id')
    })

    it('uses a custom user agent when provided', async () => {
      const session = new SessionManager(cache, {
        visitorId: 'id',
        userAgent: 'MyBot/2.0',
      })
      const headers = await session.buildHeaders()

      expect(headers['User-Agent']).toBe('MyBot/2.0')
    })

    it('includes the visitor ID from the cache when none is pre-configured', async () => {
      cache.set('visitor_id', 'CachedForHeaders', Cache.TTL.VISITOR_ID)

      const session = new SessionManager(cache)
      const headers = await session.buildHeaders()

      expect(headers['X-Goog-Visitor-Id']).toBe('CachedForHeaders')
    })
  })
})
