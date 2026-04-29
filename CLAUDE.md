# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`musicstream-sdk` — a Node.js SDK (v1.0.0, published on npm) that provides unified search, streaming, browse, lyrics, and download across **YouTube Music** and **JioSaavn**. Targets single-user applications (CLI tools, bots, desktop apps). Requires Node ≥ 22.

## Commands

```bash
pnpm install                # Install deps (pnpm@10.33.0)
pnpm build                  # tsup — outputs dist/index.{js,mjs,d.ts}
pnpm typecheck              # tsc --noEmit
pnpm test                   # vitest run tests/unit --reporter=verbose
pnpm test:watch             # vitest tests/unit (watch mode)
pnpm test:coverage          # vitest run tests/unit --coverage
pnpm test:integration       # non-live integration tests (mock infrastructure)
pnpm test:all               # unit + integration (no live network)
RUN_LIVE=1 pnpm test:integration   # live API tests — hits real YouTube/JioSaavn
```

To run a single test file:
```bash
pnpm exec vitest run tests/unit/musickit/lyrics.test.ts
```

## Publishing

Publish is automated via GitHub Actions. Push a `v*` tag to trigger:
```bash
git tag v1.x.x && git push origin v1.x.x
```
The workflow sets the version from the tag, builds, and runs `npm publish`. `dist/` is committed to the repo and also rebuilt fresh in CI.

## Architecture

Three-layer design:

```
Public API     MusicKit class — search / getStream / getTrack / getMetadata / getLyrics
               getHome / getArtist / getAlbum / getPlaylist / getRadio / getRelated
               getSuggestions / getFeaturedPlaylists / getCharts / autocomplete / download

Anti-Ban       Rate limiter · Session manager · SQLite cache (node:sqlite) · Retry engine

Sources        YouTubeMusicSource (InnerTube via youtubei.js)
               YouTubeDataAPISource (YouTube Data API v3, optional — set youtubeApiKey)
               JioSaavnSource (JioSaavn public API — jio: prefixed IDs)
```

### Source routing

`MusicKit` config accepts `sourceOrder: 'best' | SourceName[]`.
- Default (`'best'` or omitted) → `['youtube', 'jiosaavn']` — YouTube first
- JioSaavn-first for regional apps → `sourceOrder: ['jiosaavn', 'youtube']`
- Per-call override → `mk.search(q, { source: 'jiosaavn' })`

`jio:` prefixed IDs always route to JioSaavn regardless of `sourceOrder`. Plain YouTube IDs always route to YouTube.

### Stream resolution (YouTube)

1. Pre-signed URL in InnerTube response (no decipher needed)
2. Cached deciphered URL (~6h TTL in SQLite)
3. Fresh decipher from current player JS
4. yt-dlp fallback

### Lyrics

`getLyrics(videoId)` returns `{ plain: string, synced: LyricLine[] | null } | null`.
- Primary: LRCLIB (`lrclib.net/api/get`) — supports synced timestamps (LRC format)
- Fallback: lyrics.ovh — plain text only, `synced: null`
- Both are public, no auth, no rate limits
- Results cached permanently (10-year TTL) — lyrics never change
- YouTube titles/artists are sanitized before lookup (strips "Official Video", VEVO, etc.)

### Caching (SQLite)

Uses `node:sqlite` (Node 22+ built-in, zero native compilation).

| Data | TTL |
|------|-----|
| Stream URLs | ~6h |
| Search results | 5 min |
| Home feed | 8h |
| Artist pages | 1h |
| Lyrics | 10 years |
| Visitor ID | 30 days |

### `tsup.config.ts`

esbuild normalizes `node:sqlite` → `sqlite` during bundling (no bare `sqlite` module exists). The config has a post-build `onSuccess` hook that patches both output files back to `"node:sqlite"`.

## Key Source Dirs

| Path | Role |
|------|------|
| `src/musickit/` | Main SDK class — public API, source routing, cache/rate-limit orchestration |
| `src/sources/` | `YouTubeMusicSource`, `YouTubeDataAPISource`, `JioSaavnSource` — implement `AudioSource` |
| `src/discovery/` | `DiscoveryClient` — search, autocomplete, browse via InnerTube (youtubei.js) |
| `src/lyrics/` | `lrclib.ts` + `lyrics-ovh.ts` — fetchers called by `getLyrics` |
| `src/stream/` | Stream URL resolution and cipher decoding |
| `src/cache/` | SQLite caching layer with TTL constants |
| `src/models/` | All TypeScript types (`Song`, `Album`, `Artist`, `Lyrics`, `StreamingData`, etc.) |

## MCP Tools: code-review-graph

This project has a knowledge graph. Use `code-review-graph` tools **before** Grep/Glob/Read for exploration — faster and gives structural context.

| Tool | Use when |
|------|----------|
| `semantic_search_nodes` | Finding functions/classes by keyword |
| `query_graph` | Tracing callers, callees, imports, tests |
| `get_impact_radius` | Blast radius of a change |
| `detect_changes` | Risk-scored review of changed files |
| `get_architecture_overview` | High-level structure |
