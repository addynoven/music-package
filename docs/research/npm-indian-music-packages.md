# Indian Music Streaming npm Packages

Research into existing npm packages, GitHub projects, and REST API wrappers targeting Indian music streaming services (JioSaavn, Gaana, Wynk). Purpose: reverse-engineer design patterns, identify reusable ideas, spot gaps to exploit.

---

## [@saavn-labs/sdk](https://www.npmjs.com/package/@saavn-labs/sdk)

**Downloads:** ~low (very new — org has 2 repos, 1–2 stars each)
**GitHub:** https://github.com/saavn-labs/sdk
**Stack:** TypeScript, Node 18+, Bun, Deno, Cloudflare Workers

**What it does:**
A low-level, framework-agnostic TypeScript SDK directly over JioSaavn's native internal API. The stated philosophy is "stability and transparency over convenience" — it exposes the raw upstream surface with light normalization rather than hiding it behind opinionated helpers.

**Interesting bits:**

- **Zod schemas on everything.** Both input params and raw API responses are validated with Zod at runtime. Schemas are tested against recorded Postman fixtures, meaning the type contracts are grounded in real response shapes, not guesswork. Worth borrowing — gives you runtime safety plus TypeScript inference from a single source.
- **1:1 input mapping philosophy.** Parameters map directly to what the native endpoint expects. No magic parameter renaming or collapsing. When the upstream changes, you know exactly where to update.
- **Explicit "what it isn't" section.** The README explicitly calls out what the SDK won't do: no UI abstractions, no opinionated helpers, no media hosting, no caching. That clarity of scope is itself a good design signal.
- **Operations covered:** entity details (songs, albums, artists, playlists), recommendations, trending content, multi-entity search, web API integrations, radio station creation/management.
- **Install ergonomics:** supports npm/pnpm/yarn/bun.

```typescript
import { Song } from '@saavn-labs/sdk';
const result = await Song.getById({ songIds: '9fH2K1aB' });
```

**Gaps/weaknesses:**
- Essentially zero community adoption so far (1 star). No battle-testing outside the org.
- "Low-level" means the consumer has to do a lot of assembly — no stream URL resolution helper, no quality selection abstraction, no lyrics-with-fallback.
- No mention of rate limiting, retry logic, or caching strategy. Leaves all resilience concerns to the consumer.
- Tightly coupled to JioSaavn's undocumented internal API. Any Saavn-side change breaks it with no fallback.

---

## [sumitkolhe/jiosaavn-api](https://github.com/sumitkolhe/jiosaavn-api) — deployed at saavn.dev

**Downloads:** Not an npm package — a self-hosted REST API service (~434 stars, 368 forks on GitHub — most starred JS JioSaavn project)
**npm equivalent:** The API docs at `saavn.dev` are the consumable surface; no installable package
**Stack:** TypeScript (99%), Hono.js, Bun/Node.js, Cloudflare Workers or Vercel

**What it does:**
The most widely adopted unofficial JioSaavn REST API in the ecosystem. Deployed as a microservice (saavn.dev). Provides endpoints for songs, albums, playlists, artists, search, lyrics, radio, recommendations, and podcasts. Acts as a transparent proxy/decoder between you and JioSaavn's internal API.

**Interesting bits:**

- **Hono.js for multi-runtime portability.** The API runs identically on Bun, Node.js, Cloudflare Workers, and Vercel. The choice of Hono (instead of Express/Fastify) is interesting — it's optimized for edge runtimes without the cold-start overhead. Good pattern if you're building something that needs to run in serverless India-region deploys.
- **Deploy-to-India note.** All documentation explicitly says: "Deploy in an India region for all APIs to work properly (recommended: Mumbai)." This is an important signal about geo-restriction in JioSaavn's internal API. Your SDK needs to account for this — either by routing through a regional proxy or documenting the requirement.
- **Stream URL decryption is included.** JioSaavn's media URLs are encrypted. This API handles decryption and returns usable 320kbps, 160kbps, 96kbps, 48kbps streams. The decryption logic lives in a dedicated `crypto_service` module — clean separation of concerns worth copying.
- **Lyrics support** alongside regular song metadata.
- **OpenAPI/Scalar docs** served at `/docs` and `/openapi.json`. Easy to explore or generate client SDKs from.
- **Response envelope is consistent:** `{ success: boolean, data: T }` across all endpoints. Simple and predictable.

**Endpoints covered:**
- `GET /api/songs/:id` — song by ID, supports multiple IDs comma-separated
- `GET /api/songs/:id/suggestions` — recommendations
- `GET /api/albums` — by ID or link
- `GET /api/playlists` — by ID or link
- `GET /api/artists/:id` — profile + top tracks + albums
- `GET /api/search` — unified search across all entity types
- `GET /api/search/songs`, `/albums`, `/playlists`, `/artists` — typed search
- `GET /api/lyrics/:id` — lyrics
- `GET /api/modules` — homepage modules (trending, charts, new releases by language)

**Gaps/weaknesses:**
- No npm package — consumers must either run their own instance or depend on the public `saavn.dev` endpoint (flaky for production use).
- No auth layer on the public instance — open to abuse.
- High-quality (320kbps) requires a JioSaavn Pro account on the backend.
- 57 open issues — endpoint breakage when JioSaavn updates internal API is a recurring problem. No versioning strategy.
- Lyrics endpoint is limited to songs that have synced lyrics on Saavn's side.

---

## [rajput-hemant/jiosaavn-api-ts](https://github.com/rajput-hemant/jiosaavn-api-ts)

**Downloads:** GitHub-only, ~44 stars, 46 forks. Not on npm.
**Stack:** TypeScript (100%), Hono.js, Bun/Node.js/Cloudflare Workers/Vercel

**What it does:**
Another Hono-based JioSaavn REST API wrapper, independently developed. Slightly newer, fewer stars than sumitkolhe but actively maintained. Provides the same core surface: songs, albums, playlists, artists, radio, podcasts, recommendations, lyrics.

**Interesting bits:**

- **`RegExpRouter` performance emphasis.** Explicitly calls out Hono's `RegExpRouter` for speed. Benchmarks in the Hono ecosystem show it significantly faster than Express for routing-heavy APIs — relevant if you're building a high-throughput aggregation layer.
- **Scalar API reference at `/docs`** and OpenAPI JSON at `/openapi.json` — same pattern as sumitkolhe's project. Both converged on Scalar independently, which suggests it's become the standard for this class of TypeScript REST API.
- **Multi-runtime deployment buttons.** README has one-click Vercel and Cloudflare Workers deploy buttons. Good DX pattern for open source APIs that need to be self-hosted.
- **Minimal deps philosophy.** Low dependency count is a recurring theme across all JioSaavn wrappers — makes sense because you don't want a JioSaavn wrapper pulling in 200MB of node_modules.

**Gaps/weaknesses:**
- Overlaps almost entirely with sumitkolhe's project. Neither has a clear functional differentiator.
- No npm package — same self-hosting burden.
- 7 open issues, mostly around endpoint breakage when JioSaavn updates its internals.
- No SDK client — just a REST service. Consumers still need to write their own fetch wrappers.

---

## [notdeltaxd/Gaana-API](https://github.com/notdeltaxd/Gaana-API)

**Downloads:** GitHub only, 18 stars, 9 forks. Not on npm.
**Stack:** TypeScript (99.9%), Hono.js, Bun

**What it does:**
Unofficial REST API wrapper for Gaana, India's second major streaming platform. Built for educational/research purposes. Wraps Gaana's internal API to expose songs, albums, playlists, artists, trending, charts, new releases, and stream URLs (decrypted HLS).

**Interesting bits:**

- **HLS stream URL decryption.** This is the most technically interesting feature — Gaana protects stream URLs with encryption. The API decrypts them and returns usable HLS URLs with quality options. Decryption is a separate concern from metadata retrieval, cleanly separated.
- **Flexible input types.** Endpoints accept both `seokeys` (Gaana's slug format) and full Gaana URLs interchangeably. This is a great UX pattern — users shouldn't need to know the internal ID format.
- **Parallel unified search.** `GET /api/search` queries across songs, albums, playlists, and artists simultaneously and returns a combined response. Useful for building search UIs without making 4 calls.
- **Optional API key protection.** Supports bearer token auth via `Authorization` header or query param, with multiple keys via comma-separated env vars. Simple but covers the use case of self-hosted instances that want basic access control.
- **Language-filtered trending.** `GET /api/trending` accepts language as a filter. Important for Indian content — Hindi, Tamil, Telugu, Kannada, Malayalam content is separated.
- **Lyrics with pagination.** Lyrics endpoint supports pagination, suggesting longer lyrics aren't just dumped in one shot.

**Endpoint summary:**
```
GET /api/search            — parallel multi-entity search
GET /api/songs/:id         — song detail + metadata
GET /api/albums/:id        — album + tracklist
GET /api/playlists/:id     — playlist + tracks
GET /api/artists/:id       — profile + top tracks
GET /api/trending          — language-filtered trending
GET /api/stream/:trackId   — decrypted HLS stream URL + quality
GET /api/lyrics/:seokey    — paginated lyrics
```

**Gaps/weaknesses:**
- Gaana.com has been struggling as a platform (Tencent divestment, reduced investment). Long-term stability of the underlying service is uncertain.
- No npm package — self-hosting required.
- Very small community (18 stars). Limited real-world validation.
- HLS stream decryption will likely break whenever Gaana rotates keys or changes their encryption scheme.
- No mention of caching, rate limiting, or how to handle Gaana's internal API throttling.

---

## [musicfetch](https://www.npmjs.com/package/musicfetch) (musicfetch.io)

**Downloads:** ~387/week (verified via Snyk advisor)
**npm:** `npm install musicfetch` (v1.1.2)
**What it is:** Multi-source music link converter and metadata aggregator API

**What it does:**
Musicfetch is the only actual multi-source aggregator in this space with an npm package. Given a Spotify URL, Apple Music URL, YouTube URL, or ISRC code, it returns matching links across 38+ music platforms — including JioSaavn, Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, SoundCloud, Audiomack, and more. One API call, all platform links.

**Interesting bits:**

- **ISRC-based cross-platform matching.** The most robust way to match tracks across services without string-matching song names. If you're building a music aggregator SDK, ISRC lookup is the correct foundation.
- **38 platforms in one call.** For a developer building a "play anywhere" experience, this is the canonical aggregation approach. You don't maintain per-platform scrapers — you let Musicfetch do the resolution.
- **Browser + Node.js compatible.** Works isomorphically. Configure once with token, use anywhere.
- **Token-based auth.** Up to 5 access tokens per account. Secrets-based, not OAuth. Simple for backend use.
- **Response shape includes artists, metadata, and all links in one shot.** No separate calls needed.
- **Viable as an SDK dependency.** At 387 downloads/week with a real npm package, it's actually installable and maintained. Others in this list are GitHub repos with no npm presence.

```js
// Typical usage pattern
const result = await musicfetch.find({
  url: 'https://open.spotify.com/track/...',
  services: ['jioSaavn', 'appleMusic', 'youtubeMusic']
});
```

**Gaps/weaknesses:**
- Paid API — requires an account and token. Not suitable as the primary data layer for an offline or fully self-hosted SDK.
- 387 downloads/week is modest — not a widely battle-tested package.
- Returns links, not stream URLs or audio data. You still need per-platform stream resolution after getting the link.
- Not open source — black box. Can't fork or self-host if the service goes down.
- Rate limits not publicly documented.

---

## [gaana (npm)](https://www.npmjs.com/package/gaana)

**Downloads:** Negligible — last published ~10 years ago (v2.3.0)
**What it does:** Downloads songs from gaana.com. Basically abandoned.

**Interesting bits:**
- Historically interesting as one of the earliest attempts at an Indian music npm package.
- The API surface was extremely thin: search + download. No metadata, no albums, no artists.

**Gaps/weaknesses:**
- Dead. Do not use. Gaana's internal API has completely changed since this was written.
- No TypeScript, no streaming, no proper metadata model.
- Listed here only as a historical data point to show the gap between early attempts and what's been built since.

---

## Key Patterns and Takeaways

### What the ecosystem has converged on

1. **Hono.js + TypeScript + Bun** is the de facto stack for any new JioSaavn/Gaana wrapper. Every active project in 2024-2025 uses this exact combo. The multi-runtime portability (edge + serverless) is the main draw.

2. **REST API deployed as a self-hosted service, not an npm library.** This is the dominant pattern — nobody is publishing installable packages. The implication: if you build an actual npm SDK, you're filling a real gap.

3. **Consistent response envelope: `{ success: boolean, data: T }`** across all projects. Simple, predictable. Worth standardizing on.

4. **Stream URL decryption as a first-class concern.** Both JioSaavn and Gaana encrypt stream URLs. Every serious wrapper includes decryption logic. It's not optional.

5. **Deploy-to-India requirement.** Geo-restriction is real. Any production use needs India-region hosting (Mumbai) or a regional proxy.

6. **Language filtering on trending/charts.** All Indian platforms organize content by language. Hindi, Tamil, Telugu, Kannada, Malayalam, Punjabi are separate content buckets. Your SDK data model needs a `language` field everywhere it matters.

### Gaps worth building around

- **No real npm-installable SDK for JioSaavn.** `@saavn-labs/sdk` is the only attempt, and it has essentially no adoption yet. The market for a well-designed, maintained, Zod-typed npm package is open.
- **No multi-source aggregator that includes stream URLs.** Musicfetch gives you links; you still need per-platform resolvers. An SDK that handles both link resolution and stream URL resolution in one chain is missing.
- **No caching or resilience layer in any existing package.** Every existing wrapper hits JioSaavn's internal API directly on every call. An SDK with optional built-in Redis/memory cache for metadata (not streams) would be a meaningful differentiator.
- **No webhook/polling for "now trending" or content change events.** The ecosystem is purely pull-based. A push or at least long-poll mechanism for trending content updates doesn't exist.
- **Wynk Music (Airtel) has zero developer tooling.** No unofficial API wrappers in any language. The platform exists but is effectively developer-inaccessible.
