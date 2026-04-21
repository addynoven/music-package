# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A developer-facing SDK for YouTube Music integration — wraps YouTube's InnerTube API to expose clean search, autocomplete, stream resolution, and download APIs. Targets single-user applications (CLI tools, bots, desktop apps).

**Status:** Active implementation. Source lives in `src/`, tests in `tests/unit/` and `tests/integration/`, design docs in `docs/`.

## Commands

```bash
pnpm install                # Install deps (pnpm@10.33.0)
pnpm build                  # tsup src/index.ts --format cjs,esm --dts --clean
pnpm typecheck              # tsc --noEmit
pnpm test                   # vitest run tests/unit --reporter=verbose
pnpm test:watch             # vitest tests/unit (watch mode)
pnpm test:coverage          # vitest run tests/unit --coverage
pnpm test:integration       # RUN_INTEGRATION=1 vitest run (hits real YouTube API)
pnpm test:all               # vitest run (unit + integration)
pnpm play                   # tsx playground/download-test.ts
```

## Architecture

The SDK is organized in three layers:

```
Public API          autocomplete / search / get_stream / get_home / get_artist / download
Anti-Ban Layer      Session manager · Rate limiter · Request builder · Retry engine · SQLite cache
Foundation Libs     Discovery: ytmusicapi (Py) / node-ytmusic-api (JS)
                    Stream:     yt-dlp (Py)       / @distube/ytdl-core (JS)
```

### Key Architectural Decisions

- **Native implementations, not a bridge.** Python and Node.js each wrap their own ecosystem libraries rather than calling across runtimes. Node.js lags on cipher fixes as a trade-off.
- **Anti-ban is transparent and overridable.** Defaults: 10–30 req/min by endpoint, 100ms minimum request gap, 30-day visitor ID cache, exponential backoff. All configurable.
- **SQLite for caching.** Zero external deps, single file, available everywhere. Visitor IDs, stream URL TTLs (~6h), search results.
- **Stream URL deciphering stays in-process.** Three-operation cipher (swap/splice/reverse) extracted from YouTube's player JS. Pre-compute and cache the cipher ops to minimize RAM (~25–35 KB floor; 2–5 MB peak with full decipher runtime).

### Stream Resolution Priority

1. Pre-signed URL in InnerTube response (no decipher needed)
2. Cached deciphered URL (still within ~6h TTL)
3. Fresh decipher from current player JS cipher
4. Fallback to yt-dlp / Piped instance

### Data Models (Planned)

- `MediaItem` — track metadata (title, artist, album, duration, thumbnails, videoId)
- `StreamingData` — resolved stream URL, format, bitrate, expiry
- `AudioTrack` — playback-ready object combining MediaItem + StreamingData

## Design Documentation

All detailed reasoning lives in `docs/`:

| File | Contents |
|------|----------|
| `music-sdk-design-brainstorm.md` | SDK vision, API design, anti-ban strategy, library comparisons, RAM budget |
| `music-sourcing-pipeline.md` | InnerTube API details, search/browse flow, caching strategy, data models |
| `music-sourcing-portability.md` | Cross-language equivalents, fragility points, mitigation strategies |
| `youtube-url-deciphering-deep-dive.md` | Cipher mechanism, URL expiry, RAM requirements by approach |

Read these before implementing any layer — they contain pre-researched decisions that should not be re-litigated without good reason.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
