# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`musicstream-sdk` (v3.0.0) — a Node.js SDK published on npm that provides search, streaming, browse, lyrics, download, podcast/RSS, audio identification, and a playback queue. **YouTube Music only** as of v3.0 (JioSaavn was removed in commit `9d33f96`). Targets single-user apps (CLI tools, Discord bots, desktop players). Requires Node ≥ 22.

External runtime deps the user must install separately: `yt-dlp` on PATH for stream/download. SongRec is optional for Shazam-based identification.

## Commands

```bash
pnpm install                       # Install deps (pnpm@10.33.0)
pnpm build                         # tsup — outputs dist/index.{js,mjs,d.ts}
pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest run tests/unit
pnpm test:watch                    # vitest tests/unit (watch)
pnpm test:coverage                 # unit tests + v8 coverage
pnpm test:integration              # RUN_INTEGRATION=1 vitest --config vitest.integration.config.ts
pnpm test:all                      # full vitest run (unit + integration)
pnpm play                          # tsx playground/download-test.ts — manual smoke test
```

Single test file:
```bash
pnpm exec vitest run tests/unit/musickit/lyrics.test.ts
```

Integration tests gate on `RUN_INTEGRATION=1`; the `test:integration` script sets it. Integration tests may hit live YouTube Music / LRCLIB / lyrics.ovh — flakes here often mean upstream changes, not regressions.

## Publishing

Publish is automated via GitHub Actions on `v*` tags:
```bash
git tag v3.x.x && git push origin v3.x.x
```
The workflow stamps the version from the tag, builds, and runs `npm publish`. `dist/` is committed (used as the `main`/`module`/`types` entrypoints) and also rebuilt fresh in CI.

## Architecture

Three-layer design centered on the `MusicKit` facade:

```
Public API     MusicKit  — search / getStream / getTrack / getMetadata / getLyrics
                          getHome / getArtist / getAlbum / getPlaylist / getRadio / getRelated
                          getSuggestions / getFeaturedPlaylists / getCharts / autocomplete / download
                          + registerSource(), event emitter, Queue, Identifier, PodcastClient

Anti-Ban       Rate limiter · SessionManager (visitor IDs) · SQLite cache · RetryEngine

Sources        YouTubeMusicSource    (InnerTube via youtubei.js — default)
               YouTubeDataAPISource  (YouTube Data API v3, optional — set youtubeApiKey)
               + custom sources via AudioSource interface
```

### Source routing

`MusicKit` config accepts `sourceOrder: 'best' | SourceName[]` and per-call `{ source }` override. Custom sources are added via `mk.registerSource(name, instance)`. With YouTube as the only built-in source, ordering primarily matters for user-registered sources.

### Stream resolution (YouTube)

`StreamResolver.resolve(videoId, quality)` walks this chain — first success wins:

1. **SQLite cache** — `~6h` TTL keyed by `stream:<videoId>:<quality>`, skipped when the cached URL has expired.
2. **InnerTube fast-path** (`src/stream/innertube-resolver.ts`) — calls `yt.music.getInfo`, reads `videoDetails.musicVideoType` from the raw player response (youtubei.js doesn't surface this field), picks an audio format via `info.chooseFormat({ format: 'opus' })` with `'mp4a'` fallback, then calls `format.decipher(yt.session.player)`. Sets `isPrivateTrack` when `musicVideoType === 'MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK'` so callers can skip HEAD validation. Skipped when no `Innertube` instance is wired (e.g. in unit tests that bypass `ensureClients`).
3. **yt-dlp fallback** — universal last resort. Used when InnerTube throws (cipher failure, geo block, age gate) or when the resolver wasn't given an `Innertube` instance. Slower (~2-3s shell-out vs ~1.5-2s for InnerTube) but covers cases InnerTube can't.

`StreamResolver` accepts an optional `onFallback(videoId, reason)` callback that fires when (2) fails and (3) takes over — `MusicKit` wires this to a `'retry'` event with endpoint `'stream'`.

`src/stream/multi-client.ts` exports `tryClients()` and `STREAM_CLIENT_FALLBACK_ORDER`. Currently unused by the default resolver — youtubei.js binds a single client at session creation. Future work (v4.2.0) will use this helper to rotate across `YTMUSIC` / `ANDROID_VR` / `TVHTML5` Innertube sessions when a client is throttled.

### Lyrics

`getLyrics(videoId)` returns `{ plain: string, synced: LyricLine[] | null } | null`. `LyricLine.words` is optionally populated with per-word timings — only `BetterLyrics` fills this; the others leave it undefined.

Provider chain (first non-null wins):

1. **BetterLyrics** (`lyrics-api.boidu.dev`) — Apple Music TTML with real per-word `<span begin end>` timings. The only free no-auth source of word-level data.
2. **LRCLIB** (`lrclib.net/api/get` strict ±2s, falls through to `/api/search` ±5s closest) — best line-level coverage for global music.
3. **lyrics.ovh** — plain text only, `synced: null`. Catches songs the others miss.
4. **KuGou** (`mobileservice.kugou.com` + `lyrics.kugou.com`) — Chinese music coverage where LRCLIB is empty.

YouTube titles/artists are sanitized before lookup — strips "Official Video", VEVO suffix, "(Explicit)", etc. (`sanitizeTitle`/`sanitizeArtist` in `src/musickit/index.ts`).

Cached 10 years per resolved id — lyrics don't change.

`src/lyrics/lrc-utils.ts` exports parse/seek/offset/serialize helpers (re-exported from the SDK root). `src/lyrics/provider.ts` defines the `LyricsProvider` interface; existing providers expose conforming exports (`lrclibProvider`, `lyricsOvhProvider`).

### Audio identification (`src/identifier/`)

Fingerprints local audio files using `@unimusic/chromaprint` + AcoustID, with optional SongRec (Shazam) fallback. The fix in `7e03ce9` uses a dynamic start offset for SongRec clip extraction — when changing identifier behavior, preserve that offset logic (don't hardcode start time).

### Caching (SQLite)

Uses `node:sqlite` (Node 22+ built-in — zero native compilation, no `better-sqlite3` dep).

| Data | TTL |
|------|-----|
| Stream URLs | ~6h |
| Search results | 5 min |
| Home feed | 8h |
| Artist pages | 1h |
| Lyrics | 10 years |
| Visitor ID | 30 days |

### `tsup.config.ts` quirk

esbuild rewrites `node:sqlite` → `sqlite` during bundling (no bare `sqlite` module exists in Node). The config has a post-build `onSuccess` hook that patches both output files (`dist/index.js` and `dist/index.mjs`) back to `"node:sqlite"`. Don't drop this hook.

## Source layout

| Path | Role |
|------|------|
| `src/musickit/` | Main SDK class — public API, source routing, cache/rate-limit orchestration |
| `src/sources/` | `AudioSource` interface + `YouTubeMusicSource`, `YouTubeDataAPISource` |
| `src/discovery/` | `DiscoveryClient` — search, autocomplete, browse via InnerTube |
| `src/stream/` | Stream URL resolution + cipher decoding |
| `src/downloader/` | yt-dlp wrapper — opus/m4a download with progress callbacks |
| `src/identifier/` | Chromaprint + AcoustID + optional SongRec |
| `src/podcast/` | `PodcastClient` — RSS parsing (rss-parser) with iTunes namespace |
| `src/queue/` | In-memory playback queue (repeat off/one/all, shuffle, history) |
| `src/lyrics/` | `lrclib.ts` + `lyrics-ovh.ts` fetchers + `lrc-utils.ts` |
| `src/cache/` | SQLite cache layer with TTL constants |
| `src/rate-limiter/`, `src/retry/`, `src/session/` | Anti-ban infrastructure |
| `src/events/` | `MusicKitEmitter` — typed events (beforeRequest, cacheHit, retry, etc.) |
| `src/schemas/` | Zod schemas + `safeParse*` helpers for all core models |
| `src/models/` | All TypeScript types (`Song`, `Album`, `Lyrics`, `StreamingData`, etc.) |
| `src/utils/` | `thumbnails`, `stream-utils`, `url-resolver` (YouTube/Spotify URL → ID) |
| `src/errors/` | Typed error classes (`NotFoundError`, `RateLimitError`, etc.) |
| `src/index.ts` | Public barrel — anything not exported here is internal |

The public surface is whatever `src/index.ts` re-exports. Treat unexported files as internal — refactor freely without breaking-change concerns.

## MCP Tools: code-review-graph

This project has a knowledge graph (4629 nodes / 66016 edges as of last build). Prefer `code-review-graph` tools over Grep/Glob/Read for structural exploration:

| Tool | Use when |
|------|----------|
| `semantic_search_nodes` | Finding functions/classes by keyword |
| `query_graph` | Tracing callers, callees, imports, tests |
| `get_impact_radius` | Blast radius of a change |
| `detect_changes` | Risk-scored review of changed files |
| `get_architecture_overview` | High-level structure |

For a known file or specific string, regular Read/Grep is still faster — don't force the graph tools.
