# SDK Fix Plan — checklist

Companion to `AUDIT.md`. Each task is **independently shippable** and includes:

- **Touches** — files that will change
- **Verification** — how we confirm it works (test command + expected output)
- **Rollback** — how to revert if it breaks something
- **No-env guarantee** — what the no-key/no-cookies behavior must remain

Mark `[x]` when complete, `[~]` when in progress.

---

## Status legend

- `[ ]` — not started
- `[~]` — in progress
- `[x]` — complete and verified
- `[!]` — blocked / abandoned (note in row)

---

## T1 — Cookies into InnerTube  [Sev 1.1] [x]
<!-- 2026-04-30: Added src/utils/cookies.ts (readCookieHeader); both Innertube.create call sites now pass cookie: when cookiesPath is set and file exists -->

**Goal:** when `cookiesPath` is set, InnerTube becomes a logged-in session — kills the rate-limit / IP-ban surface.

**Touches:**
- `src/musickit/index.ts` — both `Innertube.create(...)` call sites (constructor static, `ensureClients`)
- New helper to read the Netscape cookies file → cookie header string

**Plan:**
1. Add `readCookieFile(path: string): string` (sync read; tiny; transforms Netscape lines into `name=value; name=value`).
2. Pass `cookie` option to both `Innertube.create()` invocations when `cookiesPath` is set.
3. (Optional, if we want UA control) Pass `user_agent` from `config.userAgent` here too.

**Verification:**
- `playground/verify-api-usage.ts` — without API key, hit a search; check that response succeeds and stays consistent across many calls. (Indirect — InnerTube doesn't expose auth-state in responses, but rate-limit pressure should drop.)
- Smoke run `pnpm test` — no regressions.

**No-env guarantee:** if `cookiesPath` is unset, behavior is identical to today — the option is conditionally added.

**Rollback:** revert the helper and the two extra option spreads.

---

## T2 — Co-register both YouTube sources  [Sev 1.2 + 1.3] [x]
<!-- 2026-04-30: ensureClients() registers [YouTubeDataAPISource, YouTubeMusicSource] when youtubeApiKey set; pickSearchSource() routes non-songs filters to YT Music; quota errors (403/429) fall through to next source via tryEachSource() -->

**Goal:** when `youtubeApiKey` is set, register *both* `YouTubeDataAPISource` and `YouTubeMusicSource`. Data API gets first priority for `songs` search; YT Music handles albums/artists/playlists/all browse + serves as Data-API quota fallback.

**Touches:**
- `src/musickit/index.ts:148-158` — replace XOR with both-when-key.
- `src/sources/youtube-data-api.ts` — keep `canHandle()` returning true for now; the per-call routing decides.
- May need a tiny capability hint on sources or a routing tweak in `sourceFor()`.

**Plan:**
1. With key set: register `[YouTubeDataAPISource, YouTubeMusicSource]` in that order.
2. `YouTubeDataAPISource.search()` already returns `[]` for non-songs filters — so for albums/artists/playlists we want to skip it. Either:
   - Add `canHandle(query, options)` overload, OR
   - In `MusicKit.search()`, if filter ≠ 'songs', pick the YT Music source explicitly.
3. Wrap source calls so a 403/quota error from Data API falls through to next registered source.

**Verification:**
- Live test: `mk.search('Adele', { filter: 'albums' })` returns non-empty when key is set.
- Live test: same query, same key, returns songs from the Data API.
- Force-fail Data API (bad key) and confirm fallback returns YT Music results.

**No-env guarantee:** without the key, only YT Music is registered (same as today).

---

## T3 — Route browse/metadata methods through `sourceFor()`  [Sev 2.1] [x]
<!-- 2026-04-30: Added tryEachSource() to MusicKit; YouTubeMusicSource implements getAlbum/getArtist/getPlaylist/getRadio/getRelated/getHome/getCharts/getMoodCategories/getMoodPlaylists/autocomplete; all 11 MusicKit browse methods now route through tryEachSource() instead of _discovery directly -->

**Goal:** `getMetadata`, `getHome`, `getArtist`, `getAlbum`, `getPlaylist`, `getRadio`, `getRelated`, `getCharts`, `getMoodCategories`, `getMoodPlaylists`, `autocomplete` all go through the configured source list (which after T2 includes both backends).

**Touches:**
- `src/musickit/index.ts` — every `_discovery.X(...)` call site.
- `src/sources/audio-source.ts` — make the optional methods real (or define a smaller interface).
- `src/sources/youtube-music.ts` — implement the methods by delegating to its `_discovery`.
- `src/sources/youtube-data-api.ts` — implement what's possible via Data API; throw `NotImplementedError` for the rest so fallback works.

**Plan (per method):**
- Convert `this._discovery!.foo(args)` → `this.sourceFor(arg).foo(args)` with try/fallback.
- Default fallback chain: data-api → youtube-music.

**Verification:**
- Each method's unit test still passes.
- New test confirming that with API key, `getAlbum` still hits InnerTube (because Data API can't handle albums) — i.e., fallback works.

**No-env guarantee:** without env, registered sources are unchanged → behavior unchanged.

---

## T4 — Fix `sourceFor()` override  [Sev 2.2] [x]
<!-- 2026-04-30: sourceFor() now maps override === 'youtube' to first source with name.startsWith('youtube'); other named overrides do exact match; hardcoded 'youtube-music' removed -->

**Goal:** `mk.search(q, { source: 'youtube' })` actually honors the override.

**Touches:**
- `src/musickit/index.ts:122-128`

**Plan:**
- Replace the hardcoded `targetName = 'youtube-music'` with logic that maps `SourceName` → registered source name(s) and picks the first registered.
- If `'youtube'` should mean "any youtube backend", document that and pick from registered list filtered by name prefix.

**Verification:**
- Test: with key set, `mk.search('q', { source: 'youtube' })` does not throw and returns results.
- Test: with no key, same call returns results (current happy-path preserved).

**No-env guarantee:** N/A — this affects only the override branch.

---

## T5 — Wire SessionManager OR delete it  [Sev 3.1] [x]
<!-- 2026-04-30: Added src/utils/fetch.ts (makeFetch); sharedFetch wraps session.buildHeaders() for external calls (lrclib, lyrics-ovh, acoustid); innerTubeFetch (proxy-only) wired to Innertube.create to avoid header conflicts with youtubei's own session management -->

**Goal:** decide. Either SessionManager headers actually reach requests (visitor ID is genuinely useful for InnerTube anti-ban), or we delete the dead class.

**Recommendation:** wire it.

**Touches (if wiring):**
- `src/musickit/index.ts` — pass `session.getHeaders()` results into Innertube via custom `fetch` option, and into LRCLIB / AcoustID fetch calls.
- Possibly into a shared fetch helper.

**Verification:**
- Add live integration check that the `X-Goog-Visitor-Id` header appears on outbound InnerTube calls (intercept fetch in playground).

**No-env guarantee:** SessionManager generates a visitor ID even without env, so this should *strengthen* the no-env path (make it more anti-ban resilient).

---

## T6 — Wire `proxy` config  [Sev 3.2] [x]
<!-- 2026-04-30: makeFetch uses dynamic undici import (ProxyAgent) when proxy set; --proxy passed to yt-dlp in StreamResolver + Downloader; proxy threaded through StreamResolver/Downloader constructors in musickit -->

**Goal:** `config.proxy` actually proxies all outbound traffic (Innertube, LRCLIB, AcoustID, lyrics.ovh, downloader's yt-dlp).

**Touches:**
- A shared fetch wrapper that applies proxy via `undici.ProxyAgent`.
- Innertube config — pass custom `fetch`.
- yt-dlp args (it has its own `--proxy` flag).

**Verification:**
- Set `PROXY` in `.env` to a known proxy and watch traffic flow.

**No-env guarantee:** if `proxy` is unset, the wrapper is a passthrough.

---

## T7 — Throttle non-search endpoints  [Sev 3.3] [ ]

**Goal:** `rateLimit.browse`, `rateLimit.stream`, `rateLimit.autocomplete` actually do something.

**Touches:**
- `src/musickit/index.ts` — wrap browse/stream/autocomplete calls with `this.limiter.throttle('<name>', ...)`.

**Verification:**
- Set `rateLimit.autocomplete = 1000` in playground, fire 5 autocomplete calls back-to-back, confirm spacing.

**No-env guarantee:** default rate limits should match current effective behavior (no surprise throttling).

---

## T8 — Cleanup: delete unreachable code  [Sev 3.5 + 4] [ ]

**Goal:** remove dead code so future readers aren't misled.

**Touches:**
- `src/sources/audio-source.ts` — delete optional methods that no source implements.
- `src/sources/youtube-data-api.ts` — delete `getMetadata` if T3 didn't end up calling it; otherwise keep.
- `src/models/index.ts:212` + `src/events/index.ts:7` — remove `'visitorIdRefreshed'` event (or emit it in T5).
- `src/musickit/index.ts:61` — add eviction policy to `searchCache` Map (LRU cap or TTL sweep).

**Verification:**
- `pnpm typecheck` clean.
- `pnpm test` clean.

**No-env guarantee:** N/A — all removed code was unreachable.

---

## Test/playground assets

These should be added/maintained as we go (not separate tasks):

- `playground/verify-api-usage.ts` — already exists; expand to verify each method's backend after T3.
- `playground/test-lyrics-sync.ts` — already exists; keep green throughout.
- `playground/_env.ts` — env loader; keep current shape.

---

## Working agreement

- One task per branch / commit chunk.
- After each task: `pnpm test` + `pnpm typecheck` + a relevant playground smoke run, all green before moving on.
- Update this file with `[x]` and notes immediately on completion.
- If something is abandoned: `[!]` with a short reason.
