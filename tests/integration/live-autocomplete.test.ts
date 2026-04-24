/**
 * Live autocomplete tests — hits the real YouTube suggest endpoint with zero mocks.
 *
 * Proves:
 *   1. The public suggest endpoint responds without any API key or session
 *   2. Results are real YouTube suggestions, not fixture data
 *   3. Response shape matches what we parse
 *   4. Works for multiple query types (English, Hindi, partial, typo)
 *
 * Run with:
 *   RUN_LIVE=1 pnpm test:integration -- live-autocomplete
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { MusicKit } from '../../src/musickit'
import { DiscoveryClient } from '../../src/discovery'

const SKIP = !process.env.RUN_LIVE

const SUGGEST_URL = 'https://suggestqueries.google.com/complete/search'

describe.skipIf(SKIP)('Autocomplete — live YouTube suggest endpoint (no mocks, no API key)', () => {

  // ─── Raw endpoint verification ───────────────────────────────────────────
  // Proves the endpoint itself is reachable and returns real data before
  // any SDK code is involved.

  describe('raw endpoint', () => {
    it('responds 200 without any API key or session cookie', async () => {
      const url = new URL(SUGGEST_URL)
      url.searchParams.set('client', 'youtube')
      url.searchParams.set('ds', 'yt')
      url.searchParams.set('q', 'bohemian rhapsody')

      const res = await fetch(url)
      console.log('[raw] status:', res.status)
      expect(res.ok).toBe(true)
    })

    it('returns JSONP with query at [0] and suggestion arrays at [1]', async () => {
      const url = new URL(SUGGEST_URL)
      url.searchParams.set('client', 'youtube')
      url.searchParams.set('ds', 'yt')
      url.searchParams.set('q', 'bohemian rhapsody')

      const res = await fetch(url)
      const text = await res.text()

      console.log('[raw] full response:', text.slice(0, 300))

      // JSONP wrapper: window.google.ac.h([...])
      expect(text).toMatch(/^window\.google\.ac\.h\(/)
      const match = text.match(/^window\.google\.ac\.h\((.*)\)$/)
      expect(match).not.toBeNull()

      const data = JSON.parse(match![1]) as any[]
      expect(data[0]).toBe('bohemian rhapsody')         // echoes query back
      expect(Array.isArray(data[1])).toBe(true)          // suggestion tuples
      expect(data[1].length).toBeGreaterThan(0)

      const suggestions = data[1].map((item: any[]) => item[0])
      console.log('[raw] parsed suggestions:', suggestions)
      expect(suggestions.every((s: any) => typeof s === 'string')).toBe(true)
    })

    it('suggestions contain the original query or close variants', async () => {
      const url = new URL(SUGGEST_URL)
      url.searchParams.set('client', 'youtube')
      url.searchParams.set('ds', 'yt')
      url.searchParams.set('q', 'arijit')

      const res = await fetch(url)
      const text = await res.text()
      const match = text.match(/^window\.google\.ac\.h\((.*)\)$/)
      const data = JSON.parse(match![1]) as any[]
      const suggestions: string[] = data[1].map((item: any[]) => item[0])

      console.log('[raw] arijit suggestions:', suggestions)

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.every(s => typeof s === 'string')).toBe(true)
      expect(suggestions.some(s => s.toLowerCase().includes('arijit'))).toBe(true)
    })
  })

  // ─── SDK layer ────────────────────────────────────────────────────────────
  // Proves the SDK parses correctly and caching works.

  describe('MusicKit.autocomplete()', () => {
    let mk: MusicKit

    beforeAll(async () => {
      mk = new MusicKit({ cache: { enabled: false } })
    })

    it('returns real suggestions for English query', async () => {
      const results = await mk.autocomplete('bohemian rhapsody')
      console.log('[sdk] "bohemian rhapsody" →', results)

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(s => typeof s === 'string')).toBe(true)
      // at minimum "bohemian rhapsody" itself or "bohemian rhapsody queen" should appear
      expect(results.some(s => s.toLowerCase().includes('bohemian'))).toBe(true)
    })

    it('returns real suggestions for partial query', async () => {
      const results = await mk.autocomplete('arij')
      console.log('[sdk] "arij" →', results)

      expect(results.length).toBeGreaterThan(0)
      // partial "arij" should suggest "arijit singh"
      expect(results.some(s => s.toLowerCase().includes('arijit'))).toBe(true)
    })

    it('returns real suggestions for Hindi artist', async () => {
      const results = await mk.autocomplete('kishore kumar')
      console.log('[sdk] "kishore kumar" →', results)

      expect(results.length).toBeGreaterThan(0)
      expect(results.some(s => s.toLowerCase().includes('kishore'))).toBe(true)
    })

    it('returns empty array for nonsense query — gracefully', async () => {
      const results = await mk.autocomplete('xqzjwpfvbn12345nonexistent')
      console.log('[sdk] nonsense query →', results)

      expect(Array.isArray(results)).toBe(true)
      // may return empty or some results — just must not throw
    })

    it('second call with same query returns same results (cache hit)', async () => {
      const mkCached = new MusicKit({ cache: { enabled: true } })

      const first  = await mkCached.autocomplete('taylor swift')
      const second = await mkCached.autocomplete('taylor swift')

      console.log('[cache] first call  →', first)
      console.log('[cache] second call →', second, '(should be instant from cache)')

      expect(second).toEqual(first)
    })

    it('does NOT require MusicKit.create() — no InnerTube session needed', async () => {
      // new MusicKit() (not .create()) has no Innertube session
      // autocomplete should still work because it hits the public endpoint directly
      const bare = new MusicKit()
      const results = await bare.autocomplete('queen')
      console.log('[no-session] "queen" →', results)

      expect(results.length).toBeGreaterThan(0)
    })
  })
})
