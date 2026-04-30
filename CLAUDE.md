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

1. Pre-signed URL in InnerTube response (no decipher needed)
2. Cached deciphered URL (~6h TTL in SQLite)
3. Fresh decipher from current player JS
4. yt-dlp fallback

### Lyrics

`getLyrics(videoId)` returns `{ plain: string, synced: LyricLine[] | null } | null`.
- Primary: LRCLIB (`lrclib.net/api/get`) — synced LRC timestamps
- Fallback: lyrics.ovh — plain text only, `synced: null`
- YouTube titles/artists are sanitized before lookup (strips "Official Video", VEVO, etc.)
- Cached 10 years — lyrics don't change

`src/lyrics/lrc-utils.ts` exports parse/seek/offset/serialize helpers (re-exported from the SDK root).

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
