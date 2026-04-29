# Podcast, Audio RSS & Spoken Word Streaming — NPM Landscape

Research conducted April 2026. Weekly download figures are directionally accurate; cross-reference npm registry, npmtrends, and Snyk Advisor for live numbers. This document focuses on packages and patterns relevant to building audio streaming software that wants to touch the podcast/spoken-word ecosystem.

---

## Why This Matters for an Audio SDK

Podcasting and music streaming are increasingly overlapping. Spotify, YouTube Music, and Amazon Music all host podcasts alongside music. If `musicstream-sdk` ever expands to spoken-word content, or wants to ingest/normalize podcast metadata, every package in this doc is a candidate for direct use or pattern theft. The RSS-based podcast ecosystem is particularly rich because it is open and standardized in ways that music licensing has prevented for music.

---

## The Namespace Situation — Understand This First

Podcast RSS feeds are an onion. Core RSS 2.0 is the base. On top of that:

- **iTunes namespace** (`xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"`) — Apple's additions from ~2005. Still the dominant namespace. Every serious feed has this. Key tags: `itunes:author`, `itunes:category`, `itunes:duration`, `itunes:image`, `itunes:explicit`, `itunes:episode`, `itunes:season`, `itunes:type` (episodic | serial).
- **Podcasting 2.0 / podcast namespace** (`xmlns:podcast="https://podcastindex.org/namespace/1.0"`) — The modern open extension, driven by Podcast Index. Adds transcripts, chapters files, soundbites, value (v4v/streaming sats), persons, location, guid, medium. This is where the interesting new data lives.
- **Media RSS** (`xmlns:media`) — Yahoo's extension. Provides `media:content` with type, duration, bitrate. Legacy but widely deployed.
- **Podlove namespaces** — German public media ecosystem. Adds simple chapters (`psc:chapters`) and more. Less common outside German-language podcasting.

Any parser you pick needs to handle multiple namespaces simultaneously. Most don't do this cleanly out of the box.

---

## Category 1 — RSS / Feed Parsers

### `rss-parser`
- **Weekly downloads:** ~695K (dominant in this category)
- **What it is:** The most-downloaded general RSS/Atom parser on npm. Promises-based, works in Node and browser.
- **Podcast relevance:** Handles iTunes namespace fields via `customFields` config. You explicitly opt in to each field you want — no magic inference.
- **Pattern worth stealing:** The `customFields` approach is a clean API design for namespace opt-in:
  ```js
  new Parser({
    customFields: {
      feed: ['itunes:author', 'itunes:image'],
      item: [['itunes:duration', 'duration'], ['itunes:episode', 'episode']]
    }
  })
  ```
  The two-element array `[fromField, toField]` rename pattern is ergonomic.
- **Limitations:** Does not natively understand Podcasting 2.0 namespace. No built-in chapter parsing. You're on your own for `podcast:` namespace tags.
- **npm:** https://www.npmjs.com/package/rss-parser

---

### `feedsmith`
- **Weekly downloads:** Low (new package, trending upward — featured in Node Weekly May 2025)
- **What it is:** Fast, all-in-one JavaScript feed parser AND generator for RSS, Atom, RDF/RSS 1.0, and JSON Feed. Also parses OPML.
- **Why it's interesting:** Built TypeScript-first with complete type definitions for every feed format and namespace. Normalizes namespace prefixes so `<dc:creator>` and `<custom:creator>` both come out as `dc.creator`. Preserves original feed structure rather than flattening everything. Benchmarks show it significantly outperforms rss-parser and feedparser.
- **Key differentiator:** Can both parse and generate. One dependency covers the whole feed roundtrip. OPML support is built in, which is essential if you ever want to handle podcast app subscription exports.
- **Pattern worth stealing:** Normalizing all namespace aliases to canonical names at parse time — prevents the `itunes:author` vs `author` vs `dc:creator` disambiguation hell you see in real-world feeds.
- **npm:** https://www.npmjs.com/package/feedsmith
- **GitHub:** https://github.com/macieklamberski/feedsmith

---

### `feedparser`
- **Weekly downloads:** ~27K
- **What it is:** The original Node.js streaming RSS/Atom parser. Stream-based API (node streams), not promise-based.
- **Podcast relevance:** Has been around since Node.js was young, battle-tested against weird feeds. But the streaming API is more verbose than modern alternatives.
- **When to use:** If you're consuming extremely large feeds or building a true streaming pipeline where you can't buffer the whole feed in memory.
- **npm:** https://www.npmjs.com/package/feedparser

---

### `podcast-partytime`
- **Weekly downloads:** Low, but authoritative
- **What it is:** Extracted directly from the Podcast Index codebase. Purpose-built for Podcasting 2.0. Parses the `podcast:` namespace completely — chapters, transcripts, soundbites, value, persons, podping, GUID.
- **Why it matters:** This is the reference implementation. If you care about Podcasting 2.0 tags, this is the ground truth parser. It also outputs a `pc20support` field that tells you which Podcasting 2.0 phases the feed implements.
- **Current version:** 4.9.1
- **npm:** https://www.npmjs.com/package/podcast-partytime
- **GitHub:** https://github.com/RyanHirsch/partytime

---

### `@podverse/podcast-partytime`
- **What it is:** Podverse's fork of podcast-partytime with additional features. Podverse is a fully open-source podcast app (iOS, Android, web) — their parser is battle-tested against millions of real feeds.
- **npm:** https://www.npmjs.com/package/@podverse/podcast-partytime

---

### `podparse`
- **Weekly downloads:** Low, but intentionally lightweight
- **What it is:** A fork/rewrite of `podcast-feed-parser` with a different philosophy: no `isomorphic-fetch` dependency, replaces `xml2js` with the smaller `@rgrove/parse-xml`, less configurable but easier to use, strips empty values from output.
- **Real-world testing:** Tested daily against hundreds of thousands of real podcast feeds as part of PodLP (a KaiOS podcast app). That's meaningful validation.
- **Supported namespaces:** iTunes, Google Podcasts, Atom, Media RSS, Yahoo Media, Spotify, Podlove, Iono.fm, GeoRSS, Omny — unusually broad coverage.
- **Pattern worth stealing:** Testing against real-world feeds at scale (not just synthetic examples). Real feeds are malformed in creative ways that unit tests won't catch.
- **npm:** https://www.npmjs.com/package/podparse

---

### `podcast-feed-parser`
- **What it is:** The Tombarr original. Highly configurable — you pass an options object to specify which fields to include/exclude and which to "clean" (normalize). Works in Node and browser.
- **npm:** https://www.npmjs.com/package/podcast-feed-parser

---

## Category 2 — Feed Generation

### `podcast` (node-podcast)
- **Weekly downloads:** ~120K
- **What it is:** Fast, simple podcast RSS feed generator. Creates valid RSS 2.0 + iTunes namespace feeds. Supports enclosures (the audio file attachment), custom namespaces via `customNamespaces` and custom elements via `customElements` (node-xml syntax).
- **Podcasting 2.0 path:** No native support, but `customNamespaces` + `customElements` lets you manually inject `podcast:` namespace tags. Verbose but workable.
- **npm:** https://www.npmjs.com/package/podcast

---

### `feed`
- **Weekly downloads:** ~400K+
- **What it is:** RSS 2.0, Atom 1.0, and JSON Feed 1.0 generator. More general-purpose than `podcast` but handles all three modern feed formats. TypeScript types included.
- **When to use:** If you need multi-format output (serve both RSS and JSON Feed from the same data), this is cleaner than `podcast`.
- **npm:** https://www.npmjs.com/package/feed

---

### `rss`
- **Weekly downloads:** ~120K
- **What it is:** Lightweight RSS 2.0 generator. The package itself recommends caching the output — build the feed once, cache it, invalidate on update. Simple and fast.
- **npm:** https://www.npmjs.com/package/rss

---

## Category 3 — Audio Metadata & Chapter Parsing

### `music-metadata`
- **Weekly downloads:** ~500K+
- **What it is:** The authoritative audio metadata parser for Node.js. Reads ID3v1, ID3v1.1, ID3v2.2/2.3/2.4 (including ID3v2 Chapters 1.0), APE, Vorbis Comments, iTunes/MP4 tags. Stream and file-based. Works in Node 18+ and browser via bundler.
- **Podcast chapter support:** ID3v2.4 CHAP frames are fully supported. MP4/M4A chapter atoms supported when `includeChapters: true` is set. This covers the two most common audio chapter formats in podcast distribution.
- **Why it matters for audio streaming:** If you're serving podcast audio and want to expose chapter data from the audio file itself (not just from the RSS feed's chapter JSON), this is the only serious option.
- **Version note:** Version 8+ is pure ESM. Be aware of this if you're in a CJS context.
- **npm:** https://www.npmjs.com/package/music-metadata
- **GitHub:** https://github.com/Borewit/music-metadata

---

### `node-id3`
- **What it is:** Pure JavaScript ID3 tag reader and writer. The key thing for podcasting: it supports writing ID3v2.4 `CHAP` (chapter) frames and `CTOC` (table of contents) frames. You can programmatically create chapter-marked MP3 files.
- **Pattern worth stealing:** The chapter write API:
  ```js
  tags.chapter = [{
    elementID: 'chp1',
    startTimeMs: 0,
    endTimeMs: 120000,
    tags: { title: 'Introduction' }
  }]
  ```
  This mirrors the Podcasting 2.0 chapters JSON format closely enough that mapping between them is trivial.
- **npm:** https://www.npmjs.com/package/node-id3
- **GitHub:** https://github.com/Zazama/node-id3

---

### `podcast-chapter-parser-psc`
- **What it is:** Parses Podlove Simple Chapters (`psc:chapters`) XML format into JSON. Podlove Simple Chapters is an XML extension for RSS feeds used heavily in German public radio and podcast ecosystems. Each chapter has `start` (HH:MM:SS.mmm), `title`, and optional `href` and `image`.
- **When you need it:** Any feed that uses `xmlns:psc="http://podlove.org/simple-chapters"` — if you're building a universal podcast client.
- **npm:** https://www.npmjs.com/package/podcast-chapter-parser-psc
- **GitHub:** https://github.com/eteubert/podcast-chapter-parser-psc

---

### `waveform-data` (BBC)
- **What it is:** JavaScript API for storing and manipulating audio waveform data in the format produced by the `audiowaveform` C++ tool. Supports resampling, offsetting, and segmenting.
- **Usage pattern:** Pre-compute waveform data server-side with `audiowaveform`, store the `.dat` or `.json` binary alongside the audio, serve it to the client. Client uses `waveform-data` to render. Zero compute at playback time.
- **npm:** https://www.npmjs.com/package/waveform-data

---

### `peaks.js` (BBC)
- **What it is:** Full interactive waveform UI component built on `waveform-data` + Konva. Zooming, scrolling, point/segment markers. Born from BBC R&D for audio editing.
- **Why it matters for spoken word:** The chapter/segment marker system maps directly to podcast chapters. You can render an episode waveform with chapter breakpoints as visual markers — a common UX in podcast apps like Overcast and Podverse.
- **Peer deps:** `konva`, `waveform-data`
- **npm:** https://www.npmjs.com/package/peaks.js
- **GitHub:** https://github.com/bbc/peaks.js

---

## Category 4 — Platform & Discovery APIs

### `rss-parser` + Podcast Index — the open graph
Podcast Index (podcastindex.org) is the open, non-commercial alternative to Apple's/Spotify's walled gardens. It indexes ~4.3M podcasts and provides a free API. This is the foundation of Podcasting 2.0.

### `podcast-index-api`
- **What it is:** JavaScript/Node.js client for the Podcast Index API. Methods: `searchByTerm()`, `searchByTitle()`, `searchEpisodesByPerson()`, `podcastByFeedUrl()`, `episodesByFeedId()`, `recentFeeds()`, `recentEpisodes()`.
- **Auth:** Requires free API key from api.podcastindex.org/signup. HMAC-SHA1 time-based auth (key + secret + unix timestamp, hashed).
- **Status:** Last published 4 years ago (version 1.1.10). The API itself is actively maintained; the npm wrapper is stale. Worth wrapping directly from the OpenAPI spec rather than depending on this.
- **API docs:** https://podcastindex-org.github.io/docs-api/
- **npm:** https://www.npmjs.com/package/podcast-index-api

---

### `podcast-api` (Listen Notes)
- **What it is:** Official JavaScript client for the Listen Notes Podcast API. Supports Node.js, Cloudflare Workers, and browser.
- **What Listen Notes offers:** Full-text search across all podcasts and episodes, genre-filtered search, curated lists, episode title-only search (new endpoint 2024), playlist fetch, typeahead/suggestions. ~4M+ podcasts indexed.
- **Pricing:** Freemium. Free tier has rate limits; paid for production.
- **Why it matters:** Listen Notes has better search quality than Podcast Index for discovery use cases (consumer-facing search). Podcast Index is better for open data and Podcasting 2.0 metadata.
- **npm:** https://www.npmjs.com/package/podcast-api
- **GitHub:** https://github.com/ListenNotes/podcast-api-js

---

### Podchaser API (GraphQL, no official npm package)
- **What it is:** The richest podcast metadata API available. GraphQL. Returns: ratings and reviews, creator/guest credits (11M+), curated playlists, charts, audience demographics, listen tracking, bookmarking.
- **Key differentiator:** Goes beyond RSS metadata. Has crowdsourced data — who appeared on which episode, user ratings, etc.
- **Pricing:** Free tier exists (essential data + engagement features).
- **No npm package:** Call their GraphQL endpoint directly. `graphql-request` or any generic GraphQL client works.
- **API docs:** https://api-docs.podchaser.com/

---

### Spotify Podcast API
- **Relevant endpoints:**
  - `GET /shows/{id}` — show metadata (name, description, publisher, language, total episodes)
  - `GET /shows/{id}/episodes` — paginated episode list
  - `GET /episodes/{id}` — single episode (description, duration_ms, release_date, audio_preview_url, external_urls)
- **Limitations (2024-2026):** Spotify significantly restricted API access in late 2024. The `audio_preview_url` (30-second clip) is now gated. Full audio access is Open Access / partner-only. Consumer app access has been heavily throttled.
- **Auth:** OAuth 2.0 client credentials flow for catalog access, authorization code flow for user data.
- **Pattern worth noting:** `duration_ms` is always in milliseconds — consistent, no parsing needed.

---

## Category 5 — Feed Aggregation & Polling

### `rss-feed-emitter`
- **What it is:** Event-emitter wrapper around feed polling. Add feeds, set refresh intervals, receive events for each new item. Handles deduplication.
- **Pattern:**
  ```js
  emitter.add({ url: feedUrl, refresh: 60000 })
  emitter.on('new-item', (item) => { /* process */ })
  ```
- **When to use:** Building a podcast aggregator or notification system that monitors feeds for new episodes. Much simpler than rolling your own polling loop.
- **npm:** https://www.npmjs.com/package/rss-feed-emitter

---

### OPML — `feedsmith` or `opmlparser`
- **What is OPML:** XML format for hierarchical podcast subscription lists. Every major podcast app exports/imports OPML. It's the portability format for the podcast ecosystem.
- **`feedsmith`** handles OPML parsing natively alongside feed formats — one library covers both.
- **`opmlparser`** is the dedicated npm package if you only need OPML.
- **`opml`** npm package: simpler, pass OPML text, get back a JS object. Also reads includes (external OPML references).
- **Pattern worth stealing:** Support OPML import/export if you ever expose a podcast subscription feature. Users expect it.

---

## Category 6 — Transcript & Subtitle Formats

Podcasting 2.0 defines `<podcast:transcript>` as a link to an external transcript file. Supported formats: SRT, WebVTT, JSON (their own spec), and plain text.

### `srt-webvtt`
- Converts SRT subtitle files (or Blob objects) to valid WebVTT Object URLs. Useful if your player uses `<track>` elements (HTMLMediaElement native subtitles) — the spec requires WebVTT.
- **npm:** https://www.npmjs.com/package/srt-webvtt

### Deepgram / AssemblyAI node SDKs
Not general npm packages, but both provide Node.js SDKs for AI transcription with WebVTT/SRT export. If you need to generate transcripts from audio at ingest time, these are the production choices.

### Pattern worth knowing
The `podcast:transcript` tag in a feed can link to a JSON transcript format defined by Podcast Index — timestamps at the word level, with speaker identification. This is richer than SRT/WebVTT for search indexing and audio navigation. The format is documented at https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/examples/transcripts/transcripts.md.

---

## Category 7 — Audio Playback (for context)

These aren't podcast-specific but are the dominant playback libraries in the spoken-word player space.

### `howler`
- **~700K–1.5M weekly downloads**
- The dominant browser audio playback library. Used by most podcast web players. Handles format fallbacks, Web Audio API + HTML5 Audio, audio sprites, spatial audio.
- Chapter navigation is trivial with Howler: seek to `chapter.startTime` on the Howl instance.
- **npm:** https://www.npmjs.com/package/howler

### `shaka-player`
- **Google's adaptive streaming player.** DASH + HLS via MSE. The only serious open-source option for adaptive bitrate podcast streaming (if a host serves HLS segments rather than a flat MP3).
- Relevant as podcasting moves toward higher-quality streaming with multiple bitrate ladders.
- **npm:** https://www.npmjs.com/package/shaka-player

### `shikwasa`
- **What it is:** A web audio player explicitly built for podcasts. One of the few players that has native chapter display. Integrates with `jsmediatags` to extract chapter data directly from the audio file. Shows title, artist, duration, and chapter markers in a compact UI.
- **npm:** https://www.npmjs.com/package/shikwasa

---

## Patterns Worth Stealing

### 1. Chapters JSON (Podcasting 2.0)
The `podcast:chapters` tag links to an external JSON file rather than embedding chapters in the RSS XML. That JSON spec is simple and worth implementing natively:
```json
{
  "version": "1.2.0",
  "chapters": [
    { "startTime": 0, "title": "Intro", "img": "https://...", "url": "https://..." },
    { "startTime": 120, "title": "Main topic", "toc": true }
  ]
}
```
`startTime` is in seconds (float). `toc: false` hides the chapter from table-of-contents display (silent marker). `img` and `url` are optional rich context per chapter. This is cleaner than embedding chapters in ID3 tags or RSS XML — the chapter file can be updated without re-publishing the audio.

### 2. Polling architecture for feed freshness
Production podcast aggregators don't naively poll every feed on a fixed interval. Podcast Index's open-source aggregator and the patterns in `rss-feed-emitter` both demonstrate:
- Track `Last-Modified` and `ETag` headers — conditional GET requests (`If-None-Match`, `If-Modified-Since`) to avoid re-parsing unchanged feeds.
- Exponential backoff per feed based on its historical update frequency (a weekly show shouldn't be checked hourly).
- Separate queues for "needs immediate check" (new subscription) vs "background refresh."

### 3. GUID as the stable episode identity
RSS `<guid>` is unreliable (some hosts change it, some omit it). Podcasting 2.0 adds `<podcast:guid>` at the feed level — a stable UUID derived from the feed URL, collision-resistant across platforms. Episode identity is harder: the enclosure URL is often the most stable identifier in practice. `podcast-partytime` normalizes this.

### 4. Namespace multi-parsing in a single pass
Real podcast feeds layer iTunes, Media RSS, and sometimes Podcasting 2.0 all at once. `podparse` demonstrates the pattern: define a priority order for each logical field (e.g., `duration` comes from `itunes:duration` first, then `media:content[duration]`, then computed from the audio file). The first non-null value wins.

### 5. `medium` tag for content routing
Podcasting 2.0's `<podcast:medium>` tag declares what kind of content the feed contains: `podcast`, `music`, `video`, `film`, `audiobook`, `newsletter`, `blog`. If you're building a multi-content aggregator, this is the routing signal. An SDK serving both music and podcasts could use this tag to classify inbound feeds automatically.

---

## Dependency Map for a Podcast-Capable Audio SDK

```
Feed ingestion        feedsmith OR rss-parser + podcast-partytime
OPML handling         feedsmith (built-in) OR opmlparser
Feed generation       podcast OR feed
Audio metadata        music-metadata (read) + node-id3 (write)
Chapters (audio)      music-metadata (ID3/MP4 extraction)
Chapters (feed)       podcast-partytime → podcast:chapters JSON URL → fetch + parse
Chapter display       peaks.js + waveform-data (BBC stack)
Search / discovery    podcast-index-api (open) OR podcast-api (Listen Notes, commercial)
Platform metadata     Podchaser GraphQL API (richest) OR Spotify Web API (restricted)
Feed aggregation      rss-feed-emitter
Transcript handling   custom: fetch podcast:transcript URL, parse SRT/WebVTT/JSON
Playback              howler (simple), shaka-player (adaptive HLS/DASH)
```

---

## Quick Verdict

**If you're adding a podcast module to this SDK tomorrow:**

1. Use `podcast-partytime` or `feedsmith` for parsing — they understand the full namespace stack, not just iTunes fields.
2. Use `music-metadata` for audio file introspection — it's already the right answer for music, and it handles podcast-specific ID3 chapter frames.
3. Talk directly to Podcast Index API (free, open, no npm wrapper needed — the existing one is stale). Cache aggressively with ETag/Last-Modified.
4. Store the Podcasting 2.0 chapters JSON URL as a first-class field on your episode model. Don't flatten chapters into the episode record — the chapter file is separately cacheable and updatable.
5. OPML import is a table-stakes feature for podcast apps. `feedsmith` covers it with zero extra dependency.
