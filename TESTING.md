---
name: musicstream-sdk-testing
description: How testing works in this repo. Self-contained skill — any LLM that reads this should be able to write tests that match the existing style without further context.
type: skill
applies_to: musicstream-sdk (and any sibling repo that wants to copy this discipline)
---

# Testing — How We Do It Here

> One file. Read it once. Match it forever.
> If your test doesn't fit a pattern in this file, you're either doing something genuinely new (rare) or you're wrong (common). Default to wrong.

---

## TL;DR for the LLM in a hurry

1. **Two test trees:** `tests/unit/` (mirrors `src/` 1:1) and `tests/integration/` (cross-layer behavior).
2. **Two vitest configs:** `vitest.config.ts` (unit, 10s timeout, fetch globally killed) and `vitest.integration.config.ts` (30s, no kill switch).
3. **Three test "shapes"** — pick one based on what's being tested:
   - **Pure logic** → no mocks. Just instantiate and assert.
   - **HTTP fetcher** → mock `globalThis.fetch` only.
   - **Facade / orchestrator** → `vi.mock()` every internal collaborator at module boundary.
4. **Network leak guard** — `tests/setup.ts` makes every unit test fail loudly if it hits real `fetch` without explicit mocking. Don't disable it.
5. **Hybrid TDD discipline:** TDD red→green for *contracts* (public API shape, cache/dedup logic, schema validation, error paths). Test-after with calibration for *empirical* code (anything where the right answer comes from a library you can't predict — audio analysis, ML, fingerprinting). Both styles are valid here.
6. **Coverage gates real:** 75% branches / 85% functions, lines, statements. CI fails below.
7. **No "should" in test names.** `it('starts empty')` not `it('should start empty')`.

If those rules are obvious already, skim the rest. If not, read all of it.

---

## 1. Philosophy — TDD vs test-after, when each wins

This repo is **test-heavy, not test-first**. That's a deliberate choice, not laziness. Here's the reasoning so future-you (or future-LLM) doesn't relitigate it.

### TDD red→green works when:
- The **contract is fully specifiable up front** — you can write `expect(cache.get('missing')).toBeNull()` before the cache exists.
- **Design pressure on the API matters** — TDD forces you to be the first user of your own interface, which surfaces awkward signatures.
- The code is **pure logic** — given X, return Y, no external calls, no flaky upstream.

→ Use TDD here for: cache, queue, rate limiter, retry engine, registry, schemas, URL parsing, LRC parsing, error mapping.

### TDD struggles when:
- The behavior is **empirical** — you can't write `expect(bpm).toBe(81.3)` before running the audio library, because you don't know what it returns. You write the test, run it, see the actual number, *then* lock the tolerance band. That's calibration, not red→green.
- The hard part is **wrestling an external API** (YouTube InnerTube, AcoustID, lyrics providers). The contract is "whatever upstream gave us today" — you can't TDD against a moving target.
- The code is **glue** — most of an SDK is "call upstream, reshape response, return." There's no design to drive; the upstream design already won.

→ Use test-after for: stream resolution, lyrics provider fetchers, identifier (chromaprint), audio analysis (essentia/librosa), anything that wraps `youtubei.js`.

### The hybrid in practice

| Layer | Style |
|-------|-------|
| Public facade (`MusicKit`) | TDD-style. Contract is fully specifiable. |
| Cache / Queue / RateLimiter / RetryEngine | TDD. Pure logic. |
| Schemas (Zod), URL parsers, LRC utils | TDD. Pure functions. |
| HTTP fetchers (`fetchFromLrclib`, `fetchFromKuGou`, etc.) | Test-after. Real fetch is mocked, but the *shape* of the response was discovered, not designed. |
| `StreamResolver`, `Identifier` | Test-after. Wraps external libs whose behavior you discover. |
| Integration tests | Always last. They're verification, not driver. |

**Don't fight this.** A test like `expect(librosa.beat(audio).bpm).toBe(120)` written before running librosa is fiction. Run it first, see what the lib actually does, then write a test that locks that behavior.

---

## 2. Folder structure (this is mandatory)

```
sdk/
├── src/
│   ├── cache/
│   ├── queue/
│   ├── lyrics/
│   ├── musickit/
│   ├── stream/
│   └── ...                       # any feature module
│
├── tests/
│   ├── setup.ts                  # GLOBAL — kills real fetch in unit tests
│   ├── fixtures/
│   │   └── responses/            # pre-recorded API JSON for integration replay
│   │       ├── search-results.json
│   │       ├── home-feed.json
│   │       └── ...
│   ├── helpers/
│   │   ├── mock-factory.ts       # makeSong(), makeAlbum(), makeStreamingData(), ...
│   │   └── fixtures.ts           # fixtures.search(), fixtures.home(), ...
│   ├── unit/
│   │   ├── cache/
│   │   │   └── cache.test.ts
│   │   ├── queue/
│   │   │   └── queue.test.ts
│   │   ├── lyrics/
│   │   │   ├── lrclib.test.ts
│   │   │   ├── kugou.test.ts
│   │   │   ├── registry.test.ts
│   │   │   └── ...               # one file per provider + one per orchestration concern
│   │   ├── musickit/
│   │   │   ├── search.test.ts
│   │   │   ├── stream.test.ts
│   │   │   ├── events.test.ts
│   │   │   ├── source-routing.test.ts
│   │   │   └── ...               # split BY BEHAVIOR, not by source file
│   │   └── version.test.ts       # one-off lives at top level if it doesn't fit a folder
│   └── integration/
│       ├── pipeline.test.ts
│       ├── cache-behavior.test.ts
│       ├── anti-ban.test.ts
│       ├── live.test.ts          # gated by RUN_LIVE=1 — real network
│       └── live-autocomplete.test.ts
│
├── vitest.config.ts              # unit config
└── vitest.integration.config.ts  # integration config
```

### Rules for this layout

- `tests/unit/` mirrors `src/` **directory-for-directory**. New module → new folder.
- One unit test file per **behavior cluster**, not per source file. `MusicKit` has one source file but 18 test files (`search.test.ts`, `events.test.ts`, `source-routing.test.ts`, `stream-cache-refresh.test.ts`, etc.) because those are 18 distinct contracts.
- Helpers (`mock-factory`, `fixtures`) live at `tests/helpers/`. Don't duplicate `makeSong()` in every test file.
- Fixtures (raw recorded JSON) live at `tests/fixtures/responses/`. Loaded via the `fixtures` helper, never imported by raw path.
- Integration tests are flat (`tests/integration/*.test.ts`) — they cut across modules.

### When you add a new module

1. Create `src/<module>/`.
2. Create `tests/unit/<module>/` immediately — even before the first test. Empty folder is a placeholder for "this needs tests."
3. If the new module has external collaborators that need fixtures, add JSON to `tests/fixtures/responses/` and a loader entry to `tests/helpers/fixtures.ts`.

---

## 3. The two vitest configs (and why both exist)

### `vitest.config.ts` — unit

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],            // ← network leak guard
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    testTimeout: 10_000,                          // unit tests must be fast
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',                          // barrel, no behavior
        'src/models/index.ts',                   // types only
        'src/session/fetcher.ts',                // not exposed
        'src/sources/audio-source.ts',           // pure interface
        'src/sources/index.ts',                  // barrel
      ],
      thresholds: {
        branches: 75,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
})
```

**Important details:**
- `globals: true` — `describe`, `it`, `expect` are available without import. Most test files still import them explicitly for clarity. Match whatever the surrounding files do.
- `setupFiles` runs `tests/setup.ts` before every test file — that's the network kill switch.
- 10s timeout is generous; most tests complete in <50ms. If a unit test takes 5s+, you're doing it wrong (probably a real timer instead of fake timers).
- Coverage thresholds are real and enforced. Don't disable. If a file genuinely has nothing to test (a pure interface), add it to `exclude`, don't lower the threshold.

### `vitest.integration.config.ts` — integration

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,                          // network is slow
  },
})
```

**Important details:**
- **No `setupFiles`.** Integration tests are *allowed* to hit real network. Don't add the kill switch here.
- 30s timeout because real YouTube/LRCLIB calls can be slow.
- Tests inside this tree gate themselves on env vars (see §10).

### Scripts in `package.json`

```jsonc
{
  "test":              "vitest run tests/unit --reporter=verbose",
  "test:watch":        "vitest tests/unit",
  "test:coverage":     "vitest run tests/unit --coverage",
  "test:integration":  "RUN_INTEGRATION=1 vitest run --config vitest.integration.config.ts --reporter=verbose",
  "test:all":          "vitest run --reporter=verbose"
}
```

**Run a single file:**
```bash
pnpm exec vitest run tests/unit/lyrics/lrclib.test.ts
```

---

## 4. The network kill switch (`tests/setup.ts`)

This file is the cornerstone of the discipline. **Read it. Understand it. Don't break it.**

```ts
import { beforeAll, afterAll, vi } from 'vitest'

beforeAll(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error(
      'Real network call intercepted in unit test. Use vi.mock() or pass a fixture instead.'
    )
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})
```

### Why it matters

Without this, a test that *forgot* to mock the network would either:
- Pass slowly (real call returns a sensible response by coincidence) — passes in dev, breaks in CI when offline.
- Pass with cached state from a previous run.
- Flake randomly when upstream is slow.

This file makes a forgotten mock fail **immediately and loudly** with a message that tells you exactly what to do: `Use vi.mock() or pass a fixture instead.`

### How tests should re-enable fetch

Two patterns — pick by what you're testing:

**Pattern A — testing a fetcher (you want to assert the URL/body sent):**
```ts
// Inside the test, override the global mock for this call only.
vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve({ plainLyrics: '...' }),
} as any)
```

**Pattern B — testing logic that *uses* a fetcher (mock the fetcher module):**
```ts
vi.mock('../../../src/lyrics/lrclib', () => ({
  fetchFromLrclib: vi.fn().mockResolvedValue(null),
  lrclibProvider: { name: 'lrclib', fetch: vi.fn() },
}))
```

Pattern A is for `tests/unit/lyrics/lrclib.test.ts` (testing the fetcher). Pattern B is for `tests/unit/musickit/lyrics.test.ts` (testing the orchestration *around* the fetcher).

---

## 5. Mock decision tree (the most important section)

When you sit down to write a test, the *first* question is "what do I mock?" Answer this with the tree below.

```
Is the subject a pure function or a class with no external deps?
├── YES → mock NOTHING. Instantiate and assert.
│         examples: Queue, LyricsRegistry, parseLrc(), Cache (in-memory mode)
│
└── NO → does it call fetch() directly?
    ├── YES → mock globalThis.fetch with vi.spyOn.
    │         examples: fetchFromLrclib, fetchFromBetterLyrics, fetchFromKuGou
    │
    └── NO → does it use an external library (youtubei.js, child_process)?
        ├── YES → vi.mock('library-name', () => ...) at top of file.
        │         examples: stream/innertube-pool tests, identifier tests
        │
        └── NO → it's a facade or orchestrator that uses internal modules.
                 vi.mock() each internal collaborator's module path.
                 examples: ALL musickit/ tests
```

### The four mock shapes — copy these verbatim

#### Shape 1: Pure logic, zero mocks

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Queue } from '../../../src/queue'
import { makeSong } from '../../helpers/mock-factory'

describe('Queue — basics', () => {
  let q: Queue

  beforeEach(() => { q = new Queue() })

  it('starts empty', () => {
    expect(q.current).toBeNull()
    expect(q.upcoming).toEqual([])
  })

  it('add() appends to upcoming', () => {
    q.add(makeSong())
    expect(q.size).toBe(1)
  })
})
```

Notes: no `vi` import needed at all. Reset state in `beforeEach`. Use `mock-factory` for input objects.

#### Shape 2: HTTP fetcher — mock global fetch

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromLrclib } from '../../../src/lyrics/lrclib'

function mockFetch(body: unknown, ok = true) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(body),
  } as any)
}

beforeEach(() => vi.restoreAllMocks())

describe('fetchFromLrclib', () => {
  it('returns plain and synced lyrics when both are present', async () => {
    mockFetch({ plainLyrics: '...', syncedLyrics: '[00:01.00] hello' })
    const result = await fetchFromLrclib('Artist', 'Title')
    expect(result!.plain).toBe('...')
  })

  it('returns null when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'))
    expect(await fetchFromLrclib('Artist', 'Title')).toBeNull()
  })
})
```

Notes: tiny helper `mockFetch` keeps tests readable. Use `mockResolvedValueOnce` (not `Once` would leak across tests). Always test the failure path — `null` on network error, `null` on `!ok`, etc.

#### Shape 3: External library — `vi.mock()` at module level

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('youtubei.js', () => ({
  Innertube: { create: vi.fn() },
  ClientType: { /* ...full enum, copy verbatim from existing tests... */ },
}))

import { Innertube } from 'youtubei.js'
import { InnertubePool } from '../../../src/stream/innertube-pool.js'

const mockCreate = vi.mocked(Innertube.create)

beforeEach(() => { vi.clearAllMocks() })

describe('InnertubePool', () => {
  it('creates one Innertube instance on first call', async () => {
    mockCreate.mockResolvedValueOnce({ _id: 'fake' })
    const pool = new InnertubePool()
    await pool.get('ANDROID_VR')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})
```

Notes:
- `vi.mock()` is hoisted to the top of the file — it runs before imports. You **cannot** reference local vars inside its factory.
- If you need shared mock fns inside the factory, use `vi.hoisted()`:
  ```ts
  const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }))
  vi.mock('some-lib', () => ({ doThing: mockFn }))
  ```
- Always import the mocked module *after* the `vi.mock()` call (visually — TS hoists it but order shows intent).
- `vi.mocked(fn)` gives you a typed handle to the mock without `as any`.

#### Shape 4: Facade — mock every internal module

This is the biggest pattern; `MusicKit` tests look like this. Copy this template when adding new facade tests.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MusicKit } from '../../../src/musickit'
import { makeStreamingData, makeSong } from '../../helpers/mock-factory'

// ─── mock the youtubei.js boundary ────────────────────────────────────────────
vi.mock('youtubei.js', () => ({
  Innertube: { create: vi.fn().mockResolvedValue({}) },
  ClientType: {
    WEB: 'WEB', MWEB: 'MWEB', KIDS: 'WEB_KIDS', MUSIC: 'WEB_REMIX',
    IOS: 'iOS', ANDROID: 'ANDROID', ANDROID_VR: 'ANDROID_VR',
    ANDROID_MUSIC: 'ANDROID_MUSIC', ANDROID_CREATOR: 'ANDROID_CREATOR',
    TV: 'TVHTML5', TV_SIMPLY: 'TVHTML5_SIMPLY',
    TV_EMBEDDED: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    WEB_EMBEDDED: 'WEB_EMBEDDED_PLAYER', WEB_CREATOR: 'WEB_CREATOR',
  },
}))
vi.mock('youtubei.js/agnostic', () => ({ Platform: { shim: null, load: vi.fn() } }))

// ─── mock every internal collaborator ─────────────────────────────────────────
vi.mock('../../../src/discovery')
vi.mock('../../../src/stream')
vi.mock('../../../src/cache')
vi.mock('../../../src/rate-limiter')
vi.mock('../../../src/retry')
vi.mock('../../../src/session')

// ─── wire the auto-mocks (vi.mock() with no factory creates ghost classes) ────
import { DiscoveryClient } from '../../../src/discovery'
import { StreamResolver } from '../../../src/stream'
import { RetryEngine } from '../../../src/retry'

;(RetryEngine as any).mockImplementation(() => ({
  execute: vi.fn().mockImplementation((fn: Function) => fn()),
}))

const mockDiscovery = { search: vi.fn(), getInfo: vi.fn() }
const mockStream = { resolve: vi.fn() }
;(DiscoveryClient as any).mockImplementation(() => mockDiscovery)
;(StreamResolver as any).mockImplementation(() => mockStream)

// ─── tests ────────────────────────────────────────────────────────────────────
describe('MusicKit — getStream', () => {
  let mk: MusicKit

  beforeEach(() => {
    vi.clearAllMocks()
    mk = new MusicKit({ logLevel: 'silent' })
  })

  it('returns a StreamingData object', async () => {
    mockStream.resolve.mockResolvedValue(makeStreamingData())
    const result = await mk.getStream('dQw4w9WgXcQ')
    expect(result).toMatchObject({
      url: expect.any(String),
      codec: expect.stringMatching(/^(opus|mp4a)$/),
    })
  })
})
```

Notes on this shape:
- The `youtubei.js` mock factory must include the **full `ClientType` enum**. Copy from any existing test. Missing entries cause `MusicKit` constructor to throw at import time.
- `vi.mock('../../../src/X')` with no factory **auto-mocks** the module — every export becomes a `vi.fn()`. You then attach `mockImplementation()` to give it behavior.
- `RetryEngine` must always be wired with `execute: (fn) => fn()` because otherwise the facade waits for retries that never come.
- `logLevel: 'silent'` on the `MusicKit` constructor prevents test noise.
- Use `mock-factory.ts` helpers for all input objects (`makeSong`, `makeStreamingData`).

---

## 6. Helpers — what's already there, what to add

### `tests/helpers/mock-factory.ts`

Builders for every domain object. Realistic defaults; override only what your test cares about.

```ts
makeThumbnail(overrides?)
makeSong(overrides?)
makeAlbum(overrides?)
makeArtist(overrides?)
makeStreamingData(overrides?)
makeAudioTrack(overrides?)
makeSection(overrides?)
makePlaylist(overrides?)
```

**Rule:** if a new domain model is added to `src/models/`, add a `makeX()` factory to `mock-factory.ts` in the same PR. Tests should never construct domain objects inline with all 12 fields.

**Defaults must be realistic.** `videoId: 'dQw4w9WgXcQ'`, real-looking thumbnail URL, real codec strings (`'opus' | 'mp4a'`). Garbage defaults make assertions garbage.

### `tests/helpers/fixtures.ts`

JSON loader for integration tests. One method per recorded response.

```ts
export const fixtures = {
  search: () => load('search-results'),
  autocomplete: () => load('autocomplete'),
  stream: () => load('stream-data'),
  // ...
} as const
```

**Rule:** unit tests use `mock-factory`. Integration tests use `fixtures`. Don't cross the streams.

### When to record a new fixture

A test needs a fixture when:
1. It's an integration test (lives in `tests/integration/`).
2. The thing under test consumes a complex external response shape.
3. The shape isn't worth recreating by hand from a `make*` factory.

To record: run the live API once, paste the JSON into `tests/fixtures/responses/<name>.json`, add a `<name>: () => load('<name>')` line to `fixtures.ts`.

---

## 7. Naming and style

### Test descriptions = behavior contracts

Read them top to bottom and they should sound like a spec.

✅ **Good:**
```
Queue — basics
  starts empty
  add() appends to upcoming
  next() sets current and removes from upcoming
  next() pushes previous current to history
  next() returns null when queue is empty
```

❌ **Bad:**
```
Queue tests
  test 1
  it should work correctly
  basic functionality test
```

### Rules

- **No "should".** `it('starts empty')` not `it('should start empty')`.
- **State the contract, not the implementation.** `it('returns null for a missing key')` not `it('checks the map and returns null')`.
- **Describe blocks use the unit name + em-dash sub-area.** `describe('MusicKit — events')`, `describe('Cache — get / set')`. Em-dash (`—`) is the separator. Don't use hyphens.
- **Section dividers in long test files:**
  ```ts
  // ─── get / set ────────────────────────────────────────────────────────────
  ```
  Box-drawing character `─` (U+2500), not regular hyphens. Keep them roughly the same length so they line up visually.

### Code style inside tests

- One blank line between `arrange / act / assert` blocks.
- `await` async calls explicitly; never `.then()`.
- `vi.mocked(fn)` over `(fn as any)` when you want type help.
- Cast to `any` is fine when the type system would slow you down (e.g. `as Response`).
- Imports first, then `vi.mock()` calls, then the import of the subject under test, then test setup.

---

## 8. Time control — fake timers

Anything that depends on `Date.now()`, `setTimeout`, `setInterval`, or TTL needs fake timers. Pattern:

```ts
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())   // ← don't forget. Leaks break the next test.

it('returns null for an expired entry', () => {
  cache.set('key', 'value', 1)              // 1-second TTL
  vi.advanceTimersByTime(2_000)             // jump 2 seconds
  expect(cache.get('key')).toBeNull()
})
```

For async work that schedules timers (rate limiter, retry backoff):
```ts
const promise = engine.execute(fn, 'search')
await vi.runAllTimersAsync()                // flush all pending timers
expect(await promise).toBe('ok')
```

**Rules:**
- Always `vi.useRealTimers()` in `afterEach`. Forgetting this poisons every later test in the file.
- Use `_` thousands separators in time literals: `60_000`, `1_800` — same as the codebase.

---

## 9. Coverage policy

```
branches:    75 %
functions:   85 %
lines:       85 %
statements:  85 %
```

These are CI gates. PRs below them fail.

### How to think about coverage

- **Coverage is a smoke alarm, not a goal.** 100% coverage with bad assertions is worse than 80% with sharp ones.
- **If a file is impossible to cover** (pure type definition, barrel re-export, abstract interface), **add it to the `exclude` list** in `vitest.config.ts`. Don't drop the threshold.
- **Don't write tests just to bump numbers.** A test that calls a function and asserts nothing isn't a test.

### Currently excluded (don't add unless reason matches)
- `src/index.ts` — barrel
- `src/models/index.ts` — types only
- `src/sources/audio-source.ts` — pure interface
- `src/sources/index.ts` — barrel
- `src/session/fetcher.ts` — not exposed; covered indirectly

---

## 10. Integration tests — two flavors

### Flavor A: Fixture-based (default)

Files: `pipeline.test.ts`, `cache-behavior.test.ts`, `anti-ban.test.ts`.
Uses pre-recorded JSON from `tests/fixtures/responses/`. **Real implementations of internal classes, no mocks of upstream.**

Header comment template (use this exactly):
```ts
/**
 * Integration — <what this proves>.
 *
 * <one paragraph: what's being tested, why it's an integration test
 *  and not a unit test, what's mocked vs real>
 *
 * Run with: RUN_INTEGRATION=1 pnpm test:integration
 */

const SKIP = !process.env.RUN_INTEGRATION

describe.skipIf(SKIP)('Integration — <area>', () => { /* ... */ })
```

The `SKIP` pattern means these files are *included* in unit runs but every `describe` is skipped. That's intentional — it confirms the file at least imports cleanly even when integration is off.

### Flavor B: Live (real network)

Files: `live.test.ts`, `live-autocomplete.test.ts`.
Hits real YouTube Music. Gated by a **separate env var** `RUN_LIVE` so day-to-day integration runs (which use `RUN_INTEGRATION`) don't burn quota.

```ts
const SKIP = !process.env.RUN_LIVE

describe.skipIf(SKIP)('Live API — real YouTube Music responses', () => { /* ... */ })
```

**Live tests must document their stable IDs at the top of the file:**
```ts
/**
 * Known stable IDs used:
 *   videoId  uT_HXrrmHX8           — Arijit Singh track (Radio test confirmed 50 results)
 *   artist   UCDxKh1gFWeYsqePvgVzmPoQ — Arijit Singh channel
 *   album    MPREb_HtIOxExZ0ci     — The Arijit Singh Collection (compilation — exposed
 *                                    the artist/year swap bug)
 */
```

Each ID gets a comment explaining *why this one*. Includes any bug it once exposed. This prevents future devs from "cleaning up" an ID that's load-bearing.

### Live test tolerance

YouTube/LRCLIB/etc. are flaky. Don't assert exact equality on live data. Use:

```ts
// instead of: expect(songs.length).toBe(20)
expect(songs.length).toBeGreaterThan(0)

// instead of: expect(song.artist).toBe('Queen')
expect(song.title).not.toBe('Unknown')

// majority-correct rather than all-correct:
const withArtist = sample.filter((s) => s.artist !== 'Unknown Artist')
expect(withArtist.length).toBeGreaterThan(sample.length / 2)
```

---

## 11. Anti-patterns — don't do these

| ❌ | ✅ | Why |
|---|---|---|
| Real `setTimeout(resolve, 1000)` in tests | `vi.useFakeTimers()` + `vi.advanceTimersByTime` | Tests must be sub-second |
| Importing test files from each other | Move shared code to `tests/helpers/` | Test files are leaves, never imports |
| Testing private methods | Test the public method that uses them | If a private method needs its own test, extract it to its own file with a public API |
| Snapshot tests for object shapes | `expect(x).toMatchObject({ ... })` with explicit fields | Snapshots rot; explicit assertions document intent |
| `describe('test the cache')` | `describe('Cache — get / set')` | Name the unit and the area, no filler words |
| `it('should return null')` | `it('returns null')` | "Should" is filler. The whole file is "should." |
| One giant test file per module | Split by behavior cluster | `MusicKit` has 18 test files for one source file |
| Skipping the integration `SKIP` gate | Always gate with `process.env.RUN_INTEGRATION` (or `RUN_LIVE`) | Otherwise CI without those vars hits real network |
| Mocking the same module in every test in a file | Mock once at top of file | `vi.mock()` is hoisted; one declaration covers the whole file |
| Letting `vi.useRealTimers()` slip | Always in `afterEach` | Fake timers leak into the next test silently |
| Hardcoding `expect(bpm).toBe(81.3)` for empirical libs | Run lib first, then lock with tolerance bands | Empirical code = calibrate, don't predict |
| Disabling coverage thresholds | Add genuinely uncoverable files to `exclude` | The threshold is the contract, not a suggestion |

---

## 12. Cookbook — copy-paste recipes

### Recipe: testing a new pure-logic class

1. Create `src/<feature>/<feature>.ts`.
2. Create `tests/unit/<feature>/<feature>.test.ts`.
3. Use Shape 1 (no mocks). Cover: empty case, one-element case, mutation-doesn't-leak case, error path.

### Recipe: testing a new HTTP fetcher

1. Create `src/<area>/<provider>.ts` exporting `fetchFromX(...)`.
2. Create `tests/unit/<area>/<provider>.test.ts`.
3. Use Shape 2. Cover: success (full response), partial response, `!ok`, network throw, unexpected response shape.

### Recipe: testing a new MusicKit method

1. Create `tests/unit/musickit/<method-name>.test.ts`.
2. Copy the Shape 4 template at the top.
3. If your method touches a new collaborator, add `vi.mock('../../../src/<new>')` and wire its mock implementation in the prelude.
4. Cover: happy path, cache hit, cache miss, error from collaborator, event emission (if applicable).

### Recipe: testing time-dependent behavior

1. Use `vi.useFakeTimers()` / `vi.useRealTimers()` in `beforeEach`/`afterEach`.
2. Call your code, then `vi.advanceTimersByTime(N)` or `await vi.runAllTimersAsync()`.
3. Assert before *and* after the time advance to prove the time was load-bearing.

### Recipe: testing a new lyrics provider

1. Create `src/lyrics/<name>.ts` exporting `fetchFromX` + `xProvider: LyricsProvider`.
2. Create `tests/unit/lyrics/<name>.test.ts` (Shape 2 — fetch only).
3. Add the provider to the registry test (`tests/unit/lyrics/registry.test.ts`) if it changes default ordering.
4. Add a mock entry in `tests/unit/musickit/lyrics.test.ts`'s `vi.mock` block so the orchestration test still passes.

### Recipe: adding a new fixture for integration

1. Run the live call once locally.
2. Save raw JSON to `tests/fixtures/responses/<name>.json`.
3. Add `<name>: () => load('<name>'),` to `tests/helpers/fixtures.ts`.
4. Use it in integration tests via `fixtures.<name>()`.

---

## 13. The TDD vs test-after decision (per agent / per task)

When an LLM (or human) starts a task in this repo, the **first** decision is which mode applies. Here's the rubric:

```
Is the public API shape fully specified before coding?
├── YES → can you write a failing test that locks the public contract?
│   ├── YES → TDD: write the test first, watch it fail, write code to make it pass.
│   └── NO  → test-after with care.
└── NO  → test-after with care.

Then for each layer of the implementation:
- Glue / orchestration    → tests can be TDD (Shape 4 above)
- External lib wrapper    → test-after; calibrate after first run
- Pure helper / utility   → TDD (Shape 1)
- HTTP fetcher            → test-after the response shape, TDD the error paths
- Cache / dedup / retry   → TDD (logic is fully specifiable)
```

### What "test-after with care" means

Not "ship code, then write whatever tests pass." It means:

1. Write the simplest implementation against the real external dep.
2. Run it once on real input. Note the output.
3. Lock that output as the test, with appropriate tolerance.
4. Add tests for failure modes you've now seen (errors thrown, null returned, weird shapes).
5. Add tests for the **contract** around the dep — caching, dedup, retry, schema validation. Those are TDD-able even though the dep itself isn't.

### Example: audio analysis (essentia.js)

- ❌ TDD: `expect(getAnalysis('-tJYN-eG1zk').tempo.bpm).toBe(81.3)` — fiction. You don't know what essentia returns.
- ✅ Test-after with care:
  1. Run `getAnalysis('-tJYN-eG1zk')` once. Essentia returns `81.27`.
  2. Lock: `expect(result.tempo.bpm).toBeCloseTo(81, 0)` (±2 BPM tolerance from spec).
  3. Lock failure: `expect(getAnalysis('not-a-real-id')).rejects.toThrow(NotFoundError)`.
  4. **TDD** the cache: write failing test that two calls with same id only hit essentia once. Implement. Pass.
  5. **TDD** the dedup: two parallel calls with same id share one in-flight promise. Implement. Pass.
  6. **TDD** the schema: response validates against Zod schema. Implement. Pass.

The empirical bit (steps 1-3) is calibrated. The structural bits (4-6) are TDD. **That's the hybrid.**

---

## 14. Running tests — quick reference

```bash
# Unit tests (fast, no network, run on every save)
pnpm test
pnpm test:watch                                  # auto-rerun on file change
pnpm test:coverage                               # with v8 coverage report

# Single file
pnpm exec vitest run tests/unit/lyrics/lrclib.test.ts

# Single test by name match
pnpm exec vitest run tests/unit/queue -t "starts empty"

# Integration (fixture-based, no real network unless RUN_LIVE is also set)
pnpm test:integration

# Live (hits real YouTube/LRCLIB — burns quota, only run when needed)
RUN_LIVE=1 pnpm test:integration

# Everything (CI uses this)
pnpm test:all
```

---

## 15. Final pre-commit checklist

Before opening a PR with new tests, verify:

- [ ] New module → `tests/unit/<module>/` exists with at least one test file.
- [ ] New domain model → `make<Model>()` factory added to `mock-factory.ts`.
- [ ] New external response → fixture JSON added under `tests/fixtures/responses/`, loader entry in `fixtures.ts`.
- [ ] New facade method → test file under `tests/unit/musickit/<method>.test.ts` covering happy path, cache hit, error.
- [ ] All new test descriptions read as a spec (no "should", no "test 1").
- [ ] No real `setTimeout`, no real `fetch` outside the mocked patterns.
- [ ] `pnpm test` passes locally.
- [ ] `pnpm test:coverage` thresholds still met.
- [ ] If touching live behavior: `RUN_LIVE=1 pnpm test:integration` passes (or you've explained why it can't be tested live).

---

## 16. The one-paragraph version

> Two test trees that mirror `src/`. Two vitest configs (unit kills network, integration doesn't). Three test shapes (pure logic = no mocks; fetcher = mock global fetch; facade = mock every internal module at boundary). Coverage is enforced at 75/85/85/85. TDD when the contract is specifiable (cache, queue, registry, schemas, error paths). Test-after with calibration when the behavior is empirical (lib wrappers, real upstream). Names read like specs (no "should"). Helpers (`mock-factory`, `fixtures`) are mandatory — never construct domain objects inline. Live tests document their stable IDs and use majority-correct assertions instead of exact equality. The `tests/setup.ts` network kill switch is the cornerstone — it makes test-after safe by failing loudly on forgotten mocks.

If you can recite that paragraph and apply it, you're writing tests like this repo.
