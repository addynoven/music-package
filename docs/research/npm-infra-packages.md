# Audio Processing & SDK Infrastructure npm Packages

Research into npm packages worth studying for API design patterns around audio processing,
caching, retry logic, and rate limiting — applicable to a music streaming SDK.

---

## [fluent-ffmpeg](https://www.npmjs.com/package/fluent-ffmpeg)

**Downloads:** ~1.6M/week  
**What it does:** Wraps the FFmpeg CLI behind a chainable Node.js API. You configure
audio/video processing pipelines by chaining methods instead of building shell-command
strings by hand.

**Interesting bits:**

- **Builder/fluent pattern done right.** Every configuration method returns `this`, so
  you get readable pipelines like:
  ```js
  ffmpeg('input.mp3')
    .audioCodec('libmp3lame')
    .audioBitrate(192)
    .format('mp3')
    .on('progress', handler)
    .on('end', handler)
    .save('output.mp3');
  ```
  For a music SDK this pattern maps cleanly to things like "transcode this track to this
  format at this quality" without exposing the underlying binary complexity.

- **Event-driven progress.** Emits `start`, `progress`, `end`, and `error` events
  rather than a single callback. The `progress` event carries percentage and bitrate
  data mid-process — useful for a streaming SDK that needs to report encoding progress
  to a client.

- **Polymorphic inputs.** `addInput()` accepts file paths, readable streams, and network
  URLs with the same interface. A music SDK could adopt this — let callers pass a local
  file path, a remote URL, or a Node stream interchangeably without separate methods for
  each.

- **Internal state model.** The library separates "command building" from "command
  execution" — all the chain calls populate an internal state object, and `.save()` /
  `.pipe()` triggers the actual FFmpeg spawn. This is the right architecture for anything
  that needs to validate configuration before executing.

**Gaps/weaknesses:**

- **Officially deprecated and archived** (2024/2025). The maintainer called it unmaintained
  and it no longer works correctly with recent FFmpeg versions. Study the API design, but
  don't use it as a dependency.
- No TypeScript types in the package itself (community `@types/fluent-ffmpeg` exists but
  lags behind).
- No built-in retry or error-recovery for failed FFmpeg processes — you'd wire that
  separately.
- The event emitter model doesn't compose with async/await natively; you have to wrap
  in a Promise yourself.

**Modern alternatives to actually use:** Direct `child_process.spawn()` + ffmpeg-static
for binary bundling, or `@ffmpeg/ffmpeg` (WASM) for environments without binary access.

---

## [bottleneck](https://www.npmjs.com/package/bottleneck)

**Downloads:** ~3–10M/week (range reported across tracking sources; sits around 10M at peak)  
**What it does:** Distributed task scheduler and rate limiter. Controls how many
async jobs run concurrently and how fast they execute, with optional Redis-backed
clustering so limits are enforced across multiple Node processes.

**Interesting bits:**

- **Reservoir model for time-window limits.** You set a `reservoir` (token bucket) and
  a `reservoirRefreshInterval`. Example: allow 100 API calls per 60 seconds — the
  reservoir depletes as jobs fire and refills on the interval. This is exactly the model
  you need when wrapping a music platform API like Spotify (rate limited per rolling window).
  ```js
  const limiter = new Bottleneck({
    reservoir: 100,
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 5,
    minTime: 200,
  });
  ```

- **Priority queuing.** Every job gets a priority (0 = highest). Track metadata fetches
  could be priority 1; background prefetch jobs priority 5. The queue respects this when
  deciding what to run next.

- **`Group` abstraction.** Create a `Bottleneck.Group` where each unique key (e.g., a
  user ID or artist ID) gets its own sub-limiter automatically. Useful in a multi-tenant
  SDK: rate limit per-user rather than globally.

- **Redis clustering.** All limiters sharing the same `id` and pointing at the same Redis
  instance share one distributed rate limit. Critical if the SDK runs across multiple
  server instances.

- **Event hooks.** Emits `queued`, `scheduled`, `executing`, `done`, `failed`, `retry`
  events — you can instrument the queue without touching job logic.

**Gaps/weaknesses:**

- Last published 7 years ago. Not actively maintained. No ESM support.
- Redis dependency (ioredis) for clustering adds operational complexity.
- No built-in retry logic — it just rate-limits; you'd pair it with p-retry.
- The `reservoir` model doesn't natively handle APIs that use "points-based" limits
  (where different endpoints cost different amounts). You'd have to decrement the
  reservoir manually for weighted calls.

---

## [p-throttle](https://www.npmjs.com/package/p-throttle)

**Downloads:** ~2.4M/week  
**What it does:** Throttles promise-returning and async functions — limits how many times
a function can be called in a given time interval without dropping calls. Calls that
exceed the limit are queued and executed after the interval window opens up.

**Interesting bits:**

- **Zero-queue-loss by design.** Unlike a debounce, throttle here *does not drop calls*
  — every invocation eventually runs, just delayed if the rate limit is hit. Critical
  distinction for an SDK wrapping an API where every call matters.

- **Weight-based limiting.** You can specify a `weight` per call — different endpoints
  that cost different "points" against your rate limit can be weighted accordingly.
  ```js
  const throttled = pThrottle({ limit: 10, interval: 1000 });
  const expensiveCall = throttled(fn, { weight: 3 }); // costs 3 of the 10/s budget
  ```

- **`onDelay` callback.** Fires whenever a call is queued for delay, passing the original
  arguments. Use this to log that rate limiting is happening, or to surface backpressure
  to callers.

- **AbortController cancellation.** Pass a signal to cancel pending throttled calls,
  which prevents queue buildup when a request is abandoned (e.g., user navigates away).

- **Strict vs. windowed mode.** Default is windowed (sliding interval); `strict: true`
  enforces spacing between every individual call. Useful when an API says "no more than
  one request per 100ms" vs "10 per second aggregate".

- **Tiny, ESM-native, TypeScript first.** From Sindre Sorhus — no dependencies, pure
  ESM, full TypeScript types included.

**Gaps/weaknesses:**

- No distributed/Redis mode — only works within a single Node.js process.
- No priority queue — all throttled calls are FIFO.
- Queue can grow unbounded if calls arrive faster than the limit allows indefinitely.
  No built-in max queue depth option.
- No built-in retry — separate concern.

---

## [p-retry](https://www.npmjs.com/package/p-retry)

**Downloads:** ~25–27M/week  
**What it does:** Retries a promise-returning or async function with configurable
exponential backoff. The de-facto standard for retry logic in modern Node.js.

**Interesting bits:**

- **Exponential backoff with jitter baked in.** Default behavior: retries with increasing
  delays following the `retry` npm package's algorithm (which adds randomized jitter by
  default to avoid thundering herds).

- **Per-error retry control.** Throw an `AbortError` from inside the function to signal
  "don't retry this, fail permanently". Useful in an SDK: if a 401 Unauthorized comes
  back, you want to abort immediately rather than retry pointlessly.
  ```js
  await pRetry(async () => {
    const res = await fetch(url);
    if (res.status === 401) throw new pRetry.AbortError('Invalid API key');
    if (res.status === 429) throw new Error('Rate limited'); // will retry
  }, { retries: 4 });
  ```

- **Rich option set.** `retries`, `minTimeout`, `maxTimeout`, `factor`, `randomize`,
  `onFailedAttempt` callback. The `onFailedAttempt` hook gives you the error, attempt
  number, and remaining retries — good for logging or escalating alerting.

- **Network error detection.** Built-in dependency on `is-network-error` — won't retry
  on TypeErrors unless they're network errors, avoiding silent retries on programming
  mistakes.

- **ESM + TypeScript native.** Sindre Sorhus package, no external dependencies beyond
  `is-network-error`.

**Gaps/weaknesses:**

- No awareness of rate limiting — doesn't read `Retry-After` headers from 429 responses.
  You'd implement that in `onFailedAttempt` yourself.
- No circuit breaker pattern — retries blindly until exhausted. In an SDK you might want
  to trip a circuit breaker after sustained failures rather than always doing max retries.
- Doesn't integrate with cancellation (AbortController at the outer scope) natively —
  you'd need to wire that manually.

---

## [node-cache](https://www.npmjs.com/package/node-cache)

**Downloads:** ~1.5M/week  
**What it does:** Simple in-memory key-value cache for Node.js with TTL support, events,
and hit/miss statistics. Think "in-process memcached" — no Redis needed, no network hop.

**Interesting bits:**

- **TTL-first design.** Every key can have a TTL in seconds. When it expires, the key is
  silently deleted. Global default TTL can be set at cache creation, overridden per key.
  Exactly what you need for caching track metadata or search results that go stale.

- **Built-in stats.** `cache.getStats()` returns `{ keys, hits, misses, ksize, vsize }`.
  Free observability: you can expose cache hit rate in your SDK's debug mode without
  adding instrumentation code.

- **`expired` and `del` events.** You can hook into when keys expire or are deleted.
  Useful if an SDK needs to trigger a refresh-ahead fetch when a cached token is about
  to expire.

- **`mget` / `mset` batch operations.** Get or set multiple keys at once, returning a
  key→value map. Efficient for fetching a playlist's worth of track metadata in one
  cache lookup.

- **Clone on set/get (optional).** The `useClones` option deep-clones stored values so
  external mutations don't corrupt cache state. Costly for large objects but safe for
  shared mutable state.

**Gaps/weaknesses:**

- **No LRU eviction.** If TTL isn't set, keys live forever. Memory will grow unbounded
  under high load unless you set TTLs everywhere.
- **No size-based eviction** — no concept of max memory footprint.
- **Single process only** — no Redis or distributed mode.
- Last stable release is 5.1.2 — maintenance is slow; `@cacheable/node-cache` is a
  modern drop-in replacement worth tracking.
- No async-native API — all operations are synchronous (fine for in-memory, but
  inconsistent if you later swap to Redis).

**Better alternative for LRU semantics:** `lru-cache` (~415M/week downloads) — supports
size-based eviction, TTL, and has a strongly-typed modern API. The go-to for in-process
caching in 2026.

---

## [got](https://www.npmjs.com/package/got)

**Downloads:** ~17–20M/week  
**What it does:** A comprehensive HTTP client for Node.js with built-in retry,
stream support, pagination, TypeScript types, and a deep hooks system. More
featureful than `fetch`, more maintainable than `axios` for SDK internals.

**Interesting bits:**

- **`got.extend()` for SDK instances.** Create a pre-configured client instance
  with base URL, default headers, auth tokens, and hooks baked in. This is the
  right pattern for an SDK's internal HTTP layer — callers get a clean API and
  the instance handles all the boilerplate:
  ```js
  const apiClient = got.extend({
    prefixUrl: 'https://api.musicplatform.com/v1',
    headers: { 'User-Agent': 'musicstream-sdk/1.0' },
    retry: { limit: 3, statusCodes: [429, 500, 502, 503] },
  });
  ```

- **Lifecycle hooks.** `beforeRequest`, `afterResponse`, `beforeRetry`, `beforeError`
  hooks form a middleware pipeline. The `afterResponse` hook gets the response *and*
  a `retryWithMergedOptions()` function — you can detect a 401, refresh the OAuth token,
  and trigger a retry with new auth headers, all in one hook.

- **Built-in retry with status code awareness.** Unlike `p-retry` (which retries any
  thrown error), `got` understands HTTP semantics — you configure which status codes
  are retryable. It also respects `Retry-After` headers on 429 responses natively.

- **First-class streaming.** `got.stream(url)` returns a Node.js readable stream directly.
  Pipe it to a response, to disk, or to a transcoder. For a music SDK streaming audio
  content this is a key capability.

- **Pagination helper.** `got.paginate()` walks paginated API endpoints automatically,
  yielding results. Useful for search results or playlist track listing that spans
  multiple pages.

- **TypeScript-first, ESM + CJS.** Full generics support on response types.

**Gaps/weaknesses:**

- **ESM-only since v12** — if the SDK needs to support CommonJS consumers, you must
  either stay on got v11 or use `got-cjs` as a bridge.
- Larger than `node-fetch` or native `fetch` — more surface area to understand and
  audit.
- The hooks system is powerful but complex; `beforeRetry` and `afterResponse`
  interactions during retries have had known bugs historically (hooks running multiple
  times on paginated retries).
- No built-in rate limiting — you'd pair with bottleneck or p-throttle for that.

---

## [axios-retry](https://www.npmjs.com/package/axios-retry)

**Downloads:** ~4.5–7M/week  
**What it does:** Axios interceptor plugin that adds configurable retry behavior to
any Axios instance. Intercepts failed requests and replays them with exponential backoff.

**Interesting bits:**

- **Interceptor-based, zero refactor required.** Attach to any existing Axios instance
  with one call: `axiosRetry(axiosInstance, options)`. For an SDK already built on
  Axios, this is a one-line upgrade.

- **Per-request retry config.** Override retry behavior on individual requests via the
  request config object:
  ```js
  axiosInstance.get('/endpoint', {
    'axios-retry': { retries: 5, retryDelay: axiosRetry.exponentialDelay }
  });
  ```
  This per-call override pattern is worth borrowing — SDK callers shouldn't need separate
  client instances to get different retry behavior.

- **`retryCondition` function.** Accepts a function `(error) => boolean` to decide
  whether a specific error should be retried. Pair with a check on `error.response.status`
  to retry 429/503 but abort on 401/403.

- **`onRetry` callback.** Fires before each retry attempt with `(retryCount, error, config)`.
  Use for logging, metrics, or escalation.

- **Idempotency check.** By default only retries idempotent methods (GET, HEAD, PUT,
  DELETE, OPTIONS, TRACE). POST retries are opt-in, which is safe default behavior.

**Gaps/weaknesses:**

- Tightly coupled to Axios — if you ever want to swap your HTTP client, retry logic
  goes with it. `got`'s built-in retry avoids this coupling.
- No `Retry-After` header parsing out of the box — you implement that in `retryDelay`.
- No distributed rate-limit awareness — purely client-side retry counting.
- The per-request config key being the string `'axios-retry'` is a slightly awkward
  API (string key on the config object rather than typed options).

---

## [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) (as a caching backend)

**Downloads:** ~3M/week  
**What it does:** The fastest SQLite3 driver for Node.js. Synchronous, native C++
extension, used internally by Drizzle ORM and many others. Not a cache library
itself, but a common pattern is using it as a persistent local cache with SQL
queries instead of in-memory stores.

**Interesting bits:**

- **Synchronous API on purpose.** SQLite is single-writer, and the sync API actually
  outperforms async wrappers because it avoids libuv overhead and event loop round-trips.
  This is counterintuitive but correct. A music SDK's local cache (offline metadata,
  downloaded track info) can be a SQLite DB with zero async complexity:
  ```js
  const db = new Database('sdk-cache.db');
  const getTrack = db.prepare('SELECT * FROM tracks WHERE id = ?');
  const track = getTrack.get(trackId); // synchronous, fast
  ```

- **Prepared statements are first-class.** `db.prepare()` compiles once, runs many times.
  Batch metadata lookups stay fast at scale.

- **Transaction helpers.** `db.transaction(fn)` wraps a function in a BEGIN/COMMIT.
  If `fn` throws, it rolls back automatically. Clean pattern for "cache miss → fetch
  from API → write to cache" as an atomic operation.

- **WAL mode + memory-mapped I/O.** Enable with pragmas at startup:
  ```js
  db.pragma('journal_mode = WAL');
  db.pragma('mmap_size = 268435456'); // 256MB
  ```
  WAL mode allows concurrent reads while writes happen — a meaningful throughput
  improvement for an SDK that reads cache while background jobs write to it.

- **Schema migrations are just SQL.** No ORM ceremony. Run `CREATE TABLE IF NOT EXISTS`
  on startup and you're done.

**Gaps/weaknesses:**

- Synchronous API is a deal-breaker if the SDK runs in an async-heavy context where
  blocking the event loop for even 1–5ms matters (e.g., inside a real-time audio
  pipeline). Use worker threads in that case.
- SQLite is single-writer — if the SDK runs in a cluster (multiple Node processes),
  writes will contend. Fine for a local/embedded SDK; not fine for a shared server cache.
- Requires native compilation — adds complexity to cross-platform builds and serverless
  cold starts.
- No TTL built in. You'd add a `expires_at` column and run periodic cleanup queries
  yourself.

---

## Summary: What to Borrow for the Music SDK

| Concern | Package to Learn From | Key Pattern |
|---|---|---|
| Audio processing API | fluent-ffmpeg | Builder/fluent chain, polymorphic inputs, event-driven progress |
| Rate limiting (distributed) | bottleneck | Reservoir + refresh interval, Group per-user limiters |
| Rate limiting (simple) | p-throttle | Weight-based calls, onDelay hook, AbortController cancellation |
| Retry logic | p-retry | AbortError for non-retryable errors, onFailedAttempt hook |
| HTTP client internals | got | `got.extend()` for SDK instance, afterResponse token-refresh hook |
| HTTP client (Axios-based) | axios-retry | Per-request retry config override pattern |
| In-memory cache | node-cache / lru-cache | TTL-per-key, hit/miss stats, batch mget/mset |
| Persistent local cache | better-sqlite3 | Prepared statements, WAL mode, sync API for embedded use |
