/**
 * Integration — MusicKit.getAnalysis facade with real essentia + fixture audio.
 *
 * Proves the full getAnalysis pipeline end-to-end at the public API level:
 * cache hit/miss, in-flight dedup, retry engine, event emission, and Zod
 * schema validation — all against real EssentiaAnalysisProvider running on
 * pre-decoded fixture PCM files (no network, no yt-dlp).
 *
 * Approach A: custom AnalysisProvider injected via MusicKitConfig.analysis.provider.
 * The provider wraps EssentiaAnalysisProvider but loads fixture bytes from
 * tests/fixtures/audio/ instead of calling yt-dlp, bypassing the SDK's internal
 * audio fetcher entirely. The facade still exercises real cache + InflightMap
 * dedup + RetryEngine + MusicKitEmitter.
 *
 * What's real: MusicKit facade, Cache (SQLite :memory:), RateLimiter,
 *   RetryEngine, InflightMap dedup, MusicKitEmitter, EssentiaAnalysisProvider
 *   (WASM), AnalysisSchema Zod validation.
 * What's mocked: nothing — yt-dlp is bypassed by Approach A fixture injection.
 * Audio fixtures generated once by: pnpm exec tsx playground/decode-audio-fixtures.ts
 *
 * Tolerance bands calibrated from the Wave-1 essentia spike and L's provider
 * integration test (essentia-provider.test.ts). Key assertions are intentionally
 * loose (valid tonic set only) because 30-second clip key detection can differ
 * from full-song analysis; BPM bands are the primary numeric assertion.
 *
 * Known stable IDs used:
 *   videoId  -tJYN-eG1zk  — Queen "We Will Rock You" (BPM ~81 after half-tempo correction)
 *   videoId  dQw4w9WgXcQ  — Rick Astley "Never Gonna Give You Up" (BPM ~113)
 *   videoId  kXYiU_JCYtU  — Linkin Park "Numb" (BPM ~110)
 *
 * Run with: RUN_INTEGRATION=1 pnpm test:integration
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { MusicKit } from '../../src/musickit'
import { EssentiaAnalysisProvider } from '../../src/analysis/essentia-provider'
import { AnalysisSchema } from '../../src/analysis/schema'
import type { AnalysisProvider } from '../../src/analysis/types'
import type { Analysis } from '../../src/analysis/types'
import { audioFixtures } from '../helpers/audio-fixtures'

const SKIP = !process.env.RUN_INTEGRATION

// ─── Valid tonic set (spec mandates sharps-only notation) ─────────────────────

const VALID_TONICS = new Set([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
])

// ─── Spec — calibrated BPM bands per fixture clip ────────────────────────────
//
// BPM bands from the Wave-1 spike and L's provider integration test.
// Keys are intentionally not pinned — they vary by clip window.

const SPEC = [
  {
    videoId: '-tJYN-eG1zk',
    label: 'Queen — We Will Rock You',
    bpmRange: [79, 83] as [number, number],
  },
  {
    videoId: 'dQw4w9WgXcQ',
    label: 'Rick Astley — Never Gonna Give You Up',
    bpmRange: [111, 115] as [number, number],
  },
  {
    videoId: 'kXYiU_JCYtU',
    label: 'Linkin Park — Numb',
    bpmRange: [108, 112] as [number, number],
  },
] as const

// ─── Approach A: fixture-backed AnalysisProvider ─────────────────────────────
//
// Wraps EssentiaAnalysisProvider but intercepts the audio param (which the
// facade passes as new Uint8Array(0)) and replaces it with the fixture PCM
// bytes. The facade never needs to call yt-dlp.

const realEssentia = new EssentiaAnalysisProvider()

function makeFixtureProvider(callSpy?: { count: number }): AnalysisProvider {
  return {
    name: 'fixture-essentia',
    async analyze(videoId: string, _audio: Uint8Array): Promise<Analysis> {
      // Ignore the empty audio the facade passed — load fixture bytes instead.
      const audio = audioFixtures.forVideoId(videoId)
      if (callSpy) callSpy.count++
      return realEssentia.analyze(videoId, audio)
    },
  }
}

// ─── Slow async provider — used for dedup tests ───────────────────────────────
//
// Wraps a real analysis result behind a genuine async delay so both parallel
// calls are in-flight simultaneously when they reach the InflightMap. Without
// this, synchronous WASM blocks the event loop and the second call arrives
// after the first has already resolved.

function makeSlowAsyncProvider(
  inner: AnalysisProvider,
  delayMs: number,
  callSpy?: { count: number },
): AnalysisProvider {
  return {
    name: 'slow-async-wrapper',
    async analyze(videoId: string, audio: Uint8Array): Promise<Analysis> {
      if (callSpy) callSpy.count++
      // Genuine async delay ensures both parallel callers are in-flight
      // at the same time, so InflightMap dedup has a chance to fire.
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
      return inner.analyze(videoId, audio)
    },
  }
}

// ─── MusicKit factory — in-memory SQLite cache, no network required ───────────
//
// No path → Cache uses ':memory:' SQLite so tests are isolated from each
// other and from any on-disk state. logLevel:'silent' suppresses noise.
// minRequestGap:0 removes the 100ms between-request floor so parallel
// calls are not serialised by the rate limiter before reaching the
// InflightMap (needed for dedup tests).

function makeMK(provider: AnalysisProvider, opts?: { noGap?: boolean }): MusicKit {
  return new MusicKit({
    logLevel: 'silent',
    analysis: { provider },
    minRequestGap: opts?.noGap ? 0 : 100,
    // Disable warnings: no API key or cookies needed for analysis-only tests.
    youtubeApiKey: 'INTEGRATION_TEST_NOOP',
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)('Integration — MusicKit.getAnalysis facade', () => {
  // Gate early: all fixture files must exist before any test runs.
  beforeAll(() => {
    const missing = audioFixtures.missing()
    if (missing.length > 0) {
      throw new Error(
        `Audio fixtures missing for: ${missing.join(', ')}\n` +
        `Generate them by running:\n` +
        `  pnpm exec tsx playground/decode-audio-fixtures.ts`,
      )
    }
  })

  // ─── Happy path — one MusicKit per spec entry ─────────────────────────────
  //
  // Each test gets its own MusicKit + fresh in-memory cache to avoid
  // cross-test pollution.

  for (const spec of SPEC) {
    describe(spec.label, () => {
      let mk: MusicKit
      let result: Analysis

      beforeAll(async () => {
        mk = makeMK(makeFixtureProvider())
        result = await mk.getAnalysis(spec.videoId)
      })

      it('returns a result without error', () => {
        expect(result).toBeDefined()
      })

      it('validates against AnalysisSchema', () => {
        const parsed = AnalysisSchema.safeParse(result)
        expect(parsed.success).toBe(true)
      })

      it('videoId matches the requested id', () => {
        expect(result.videoId).toBe(spec.videoId)
      })

      it(`BPM is within spec tolerance [${spec.bpmRange[0]}, ${spec.bpmRange[1]}]`, () => {
        expect(result.tempo.bpm).toBeGreaterThanOrEqual(spec.bpmRange[0])
        expect(result.tempo.bpm).toBeLessThanOrEqual(spec.bpmRange[1])
      })

      it('key.tonic is a valid sharp', () => {
        // Key detection can differ between 30-second clips and full songs.
        // Assert validity of the value, not the exact tonic.
        if (result.key !== null) {
          expect(VALID_TONICS.has(result.key.tonic)).toBe(true)
        }
      })

      it('has required fields (duration, onsets, analyzedAt)', () => {
        expect(typeof result.duration).toBe('number')
        expect(result.duration).toBeGreaterThan(0)
        expect(Array.isArray(result.onsets)).toBe(true)
        expect(result.onsets.length).toBeGreaterThan(0)
        expect(typeof result.analyzedAt).toBe('string')
        expect(result.analyzedAt.length).toBeGreaterThan(0)
      })

      it('beat grid is non-empty', () => {
        expect(result.tempo.beatGrid.length).toBeGreaterThan(5)
      })
    })
  }

  // ─── Cache hit — second call must hit cache, provider not re-invoked ──────

  describe('cache hit on second call', () => {
    let mk: MusicKit
    let spy: { count: number }

    beforeAll(async () => {
      spy = { count: 0 }
      mk = makeMK(makeFixtureProvider(spy))
      // First call — cache miss, provider invoked once.
      await mk.getAnalysis('-tJYN-eG1zk')
    })

    it('provider is called exactly once on the first (cache miss) call', () => {
      expect(spy.count).toBe(1)
    })

    it('second call returns the same result without re-invoking provider', async () => {
      const before = spy.count
      const start = Date.now()

      const result = await mk.getAnalysis('-tJYN-eG1zk')
      const elapsed = Date.now() - start

      // Provider must NOT have been called again.
      expect(spy.count).toBe(before)

      // Cache hit must be sub-100ms (SQLite :memory: lookup).
      expect(elapsed).toBeLessThan(100)

      // Result must be valid.
      expect(AnalysisSchema.safeParse(result).success).toBe(true)
    })
  })

  // ─── Dedup — parallel calls with same id invoke provider exactly once ─────
  //
  // Real WASM is synchronous and blocks the event loop — two parallel calls
  // can't actually be "in-flight" at the same time when WASM is running.
  // We use a slow async wrapper (~200ms genuine Promise delay) so both callers
  // arrive at the InflightMap while the factory is still pending. The real
  // InflightMap dedup is exercised; the provider result is still a real
  // essentia analysis (the wrapper just delays delivering it).
  // minRequestGap:0 disables the rate-limiter's per-request gap so the two
  // calls are not serialised before reaching the InflightMap.

  describe('in-flight dedup on parallel calls (same videoId)', () => {
    let mk: MusicKit
    let spy: { count: number }

    beforeEach(() => {
      spy = { count: 0 }
      const base = makeFixtureProvider()
      // 200ms delay → both callers are in-flight simultaneously when they
      // reach _analysisInflight, since the real analysis is deferred.
      const slow = makeSlowAsyncProvider(base, 200, spy)
      mk = makeMK(slow, { noGap: true })
    })

    it('two parallel calls invoke provider exactly once', async () => {
      const [r1, r2] = await Promise.all([
        mk.getAnalysis('dQw4w9WgXcQ'),
        mk.getAnalysis('dQw4w9WgXcQ'),
      ])

      expect(spy.count).toBe(1)
      expect(r1.videoId).toBe('dQw4w9WgXcQ')
      expect(r2.videoId).toBe('dQw4w9WgXcQ')
      // Both callers get the same result (dedup shares the promise).
      expect(r1).toEqual(r2)
    })
  })

  // ─── No false dedup — different videoIds run independently ───────────────
  //
  // Same slow-async + noGap approach to avoid rate-limiter serialisation.

  describe('parallel calls with different videoIds (no false dedup)', () => {
    let mk: MusicKit
    let spy: { count: number }

    beforeEach(() => {
      spy = { count: 0 }
      const base = makeFixtureProvider()
      const slow = makeSlowAsyncProvider(base, 200, spy)
      mk = makeMK(slow, { noGap: true })
    })

    it('two parallel calls with different ids invoke provider exactly twice', async () => {
      const [r1, r2] = await Promise.all([
        mk.getAnalysis('-tJYN-eG1zk'),
        mk.getAnalysis('dQw4w9WgXcQ'),
      ])

      expect(spy.count).toBe(2)
      expect(r1.videoId).toBe('-tJYN-eG1zk')
      expect(r2.videoId).toBe('dQw4w9WgXcQ')
    })
  })

  // ─── Cache events — cacheMiss on first call, cacheHit on second ──────────

  describe('cache events', () => {
    let mk: MusicKit

    beforeEach(() => {
      mk = makeMK(makeFixtureProvider())
    })

    it('fires cacheMiss on the first call and cacheHit on the second', async () => {
      const misses: string[] = []
      const hits: string[] = []

      mk.on('cacheMiss', (key) => misses.push(key))
      mk.on('cacheHit', (key) => hits.push(key))

      // First call — cache miss.
      await mk.getAnalysis('kXYiU_JCYtU')
      expect(misses).toContain('analysis:kXYiU_JCYtU')
      expect(hits).not.toContain('analysis:kXYiU_JCYtU')

      // Second call — cache hit.
      await mk.getAnalysis('kXYiU_JCYtU')
      expect(hits).toContain('analysis:kXYiU_JCYtU')
    })

    it('fires beforeRequest on the analysis endpoint', async () => {
      const endpoints: string[] = []
      mk.on('beforeRequest', (req) => endpoints.push(req.endpoint))

      await mk.getAnalysis('kXYiU_JCYtU')
      expect(endpoints).toContain('analysis')
    })
  })
})
