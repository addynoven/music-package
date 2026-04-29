# SoundCloud & Bandcamp: Developer Research (2024–2025)

Everything relevant from a developer building a multi-source music streaming SDK. What works, what's dead, what the packages are, how stream URL resolution actually works under the hood.

---

## SoundCloud

### The Core Problem: API Access is a Mess

SoundCloud has a public API (v1 / v2) but new registrations have been effectively frozen since **July 2022**. They cited "high volume of requests" and an inability to prevent abuse. In June 2023 they revoked access for all apps that had been inactive for 3+ months, framing it as a "temporary reset." The GitHub issue tracker for `soundcloud/api` has multiple open threads asking when registrations reopen — none have received official answers.

**Current status (2025):** You can apply for access by interacting with their AI agent on the help portal and submitting an app description. The process is manual/reviewed. There is no guarantee of approval, no SLA, and existing developers report the process is opaque.

**Bottom line for SDK builders:** You cannot reliably obtain official API credentials programmatically. The practical reality is that most community tooling bypasses this entirely using the unofficial v2 API with a scraped `client_id`.

---

### Official API: What Actually Exists

**Base URL:** `https://api.soundcloud.com` (v1, public/official)  
**Unofficial v2 Base URL:** `https://api-v2.soundcloud.com` (internal, used by SoundCloud's own web app)

SoundCloud themselves acknowledge that the v2 API is their internal API but have stated informally (via Twitter) that third-party use won't result in a ban — though it's undocumented and can break at any time.

**Key v1 endpoints:**
- `GET /tracks/{id}` — track metadata
- `GET /tracks/{id}/streams` — streaming URLs (requires valid credentials)
- `GET /playlists/{id}` — playlist info
- `GET /users/{id}` — user profile
- `GET /resolve?url={permalink}` — resolve a permalink URL to a resource ID
- `GET /oembed?url={url}` — oEmbed metadata (no auth required, still working)

**Key v2 endpoints (unofficial):**
- `GET /tracks/{id}/streams` — stream URL resolution (returns `hls_aac_160_url`, deprecated `http_mp3_128_url` etc.)
- `GET /search?q={query}` — unified search
- `GET /tracks/{id}/related` — related tracks

---

### Stream URL Format: Major Breaking Change Coming

SoundCloud is removing the old streaming formats. Key dates:

| Field | Deadline | Status |
|---|---|---|
| `http_mp3_128_url` | November 15, 2025 | **Removed** |
| `hls_mp3_128_url` | November 15, 2025 | **Removed** |
| `hls_opus_64_url` | November 15, 2025 | **Removed** |
| `preview_mp3_128_url` | — | Stays |
| `hls_aac_160_url` | — | **New preferred format** |
| `hls_aac_96_url` | — | New fallback |

The new stream URLs follow the format:
```
https://playback.media-streaming.soundcloud.cloud/{trackid}/aac_{bitrate}/{uuid}/playlist.m3u8
```

These are HLS streams. To play them you need an M3U8 player (HLS.js, native HTML5 on Safari, etc.). The old `http_mp3_128_url` was a direct progressive MP3 — much simpler to stream. This transition makes programmatic playback in non-browser environments harder.

**Any package or tool that still resolves `http_mp3_128_url` is already broken or will be after Nov 15, 2025.**

---

### Client ID Extraction (The Practical Reality)

Since official API registrations are effectively closed, community tools extract a `client_id` from SoundCloud's own web app JavaScript bundles. The approach:

1. Fetch `https://soundcloud.com`
2. Find all script `<src>` URLs matching the pattern `https://a-v2.sndcdn.com/assets/*.js`
3. Download each bundle and regex-search for `client_id["\s]*[:=]["\s]*([a-zA-Z0-9]{32})`
4. Use the extracted `client_id` as a query parameter on v2 API calls

This is the method used by `soundcloud.ts`, `soundcloud-scraper`, `node-soundcloud-downloader`, and essentially every non-trivial community package. It's fragile — SoundCloud rotates the client_id periodically when they update their web app — but it works until it doesn't.

**OAuth tokens** can be extracted via browser network inspection. Required for private tracks or SoundCloud Go+ premium audio. The unofficial v2 API also supports `oauth_token` as a query parameter or `Authorization: OAuth {token}` header.

---

### oEmbed: Still Works, No Auth Required

```
GET https://soundcloud.com/oembed?format=json&url={track_permalink_url}
```

Returns JSON with `title`, `author_name`, `thumbnail_url`, and crucially the `html` embed code. No API key needed. Useful for metadata-only lookups on public tracks.

---

### Widget / Embed API

The iframe embed player is open, no auth needed:

```html
<iframe
  src="https://w.soundcloud.com/player/?url=https://api.soundcloud.com/tracks/{id}&auto_play=false&color=%23ff5500"
  width="100%" height="166">
</iframe>
```

The **Widget JS API** (`https://w.soundcloud.com/player/api.js`) lets you control playback programmatically from the parent page via `postMessage`. Available methods: `play()`, `pause()`, `seekTo(ms)`, `setVolume()`, `bind(event, fn)`. Events: `PLAY`, `PAUSE`, `FINISH`, `SEEK`, `PLAY_PROGRESS`.

This is the cleanest integration option for browser-based players that don't need direct audio stream access. The official `Widget-JS-API` repo on GitHub is maintained by SoundCloud.

**Key limitation:** You're embedding SoundCloud's player, not getting a raw audio stream. Not usable for custom audio pipelines, visualization, or cross-fading.

---

### npm Packages — What's Current

#### `soundcloud.ts` — **Best maintained, use this**
- **Repo:** `Moebits/soundcloud.ts` (formerly Tenpi)
- **Last updated:** December 2025
- **Features:** Track/user/playlist search and retrieval, batch downloads, track download (original file or stream fallback), secret token support for private tracks, v2 endpoint variants (`getV2`, `searchV2`), web scraping fallback (`getAlt`, `searchAlt`)
- **Client ID:** Manual extraction via browser network inspection. Docs acknowledge registrations are closed.
- **Stream:** Downloads stream or original file. Does not explicitly document AAC HLS transition — verify before production use.
- **Status:** Active. The soundcloud-scraper project was archived in June 2023 specifically pointing developers here.

#### `soundcloud-scraper` — **Archived June 2023, do not use**
- **Repo:** `twlite/soundcloud-scraper` (formerly DevSnowflake)
- **Version:** 5.0.3 (June 2022)
- **Auto keygen:** Had `SoundCloud.keygen()` to auto-extract client_id from web app JS. Clever approach.
- **Status:** Read-only archive. Superseded by `soundcloud.ts`.

#### `soundcloud-downloader` / `node-soundcloud-downloader` — **Stale, 2021**
- **Repo:** `zackradisic/node-soundcloud-downloader`
- **API:** v2 wrapper in TypeScript
- **Stream:** Returns Node.js ReadableStream
- **Last release:** March 2021
- **Status:** 8 open issues, 16 open PRs — effectively abandoned. Multiple forks exist (`vprado-dev`, `snwfdhmp`, `vncsprd`) but none appear actively maintained.

#### `@distube/soundcloud` — **Archived June 2024**
- **Repo:** `distubejs/soundcloud`
- **Last version:** 1.3.5 (May 2024), archived June 2024
- **Purpose:** Discord music bot plugin (DisTube framework)
- **Status:** Dead. Do not build on this.

#### `soundcloud-audio` — **Browser-focused**
- Wrapper around HTML5 Audio + SoundCloud API. Useful for in-browser players.
- Requires official API access.

#### `soundcloud-key-fetch` — **Utility**
- Fetches a SoundCloud API key (client_id) without owning a registered app.
- Automates the JS bundle scraping approach.

#### `soundcloud-v2-api` — **Dead (6 years)**
- Version 0.1.4, 6 years stale. Ignore.

#### `soundcloud.ts` (also available as `soundcloud-v2-api` fork by barenddt) — **Dead**
- Promise-based v2 controller, last updated years ago. Not the same as the actively maintained `soundcloud.ts`.

---

### yt-dlp Approach (Reference Implementation)

yt-dlp has the most battle-tested SoundCloud extractor. It:
1. Auto-extracts `client_id` from the web app JS bundles
2. Resolves track metadata via API v2
3. Fetches available transcodings (HLS AAC, HLS MP3, Opus, progressive MP3)
4. Downloads the M3U8 manifest for HLS streams and reassembles segments
5. Supports OAuth token via `--add-header "Authorization: OAuth {token}"` for Go+ content

If building your own resolver, yt-dlp's extractor source at `youtube_dl/extractor/soundcloud.py` (in the youtube-dl repo) is the best reference for the full flow. yt-dlp's version is maintained and kept updated with format changes.

---

### Terms of Service Risks

Key restrictions from the official API ToS:
- Only acceptable commercial use: apps whose primary purpose is user content creation, or delivering content to the uploader's own ad-enabled presence
- **Not allowed:** in-app purchases for SoundCloud content, apps with advertising around user content
- SoundCloud can revoke API access at will
- Scraping for AI training is explicitly prohibited (2025 ToS update)
- Unofficial API use (scraped client_id) violates ToS technically — practical enforcement is unclear

---

## Bandcamp

### The State of Affairs

Bandcamp has **no usable public API for general content access.** The official developer API (OAuth 2.0) is invite-only and covers **sales data only** — sales reports, merchandise, order management, fan data. It is designed for artists and labels to manage their own Bandcamp storefronts, not for building music discovery or streaming apps.

**Bandcamp timeline context:**
- **March 2022:** Epic Games acquires Bandcamp
- **September 2023:** Epic sells Bandcamp to Songtradr
- **October 2023:** Songtradr lays off 50% of Bandcamp staff, including most of the tech and editorial team
- **2024–2025:** Platform appears to be in maintenance mode. Site changes have been minimal. bandcamp-fetch v3.1.0 released with "fixes following Bandcamp site changes" — indicating the scraping approach still requires patching periodically.
- **January 2026:** Bandcamp bans AI-generated music

The mass layoffs are directly relevant to SDK builders: fewer engineers means Bandcamp's site structure may change unpredictably (or not at all for years). Scraping-based approaches are inherently fragile here.

---

### Official API: Sales Data Only

**Endpoint:** `https://bandcamp.com/api/`  
**Auth:** OAuth 2.0, client credentials, invite-only registration  
**Docs:** https://bandcamp.com/developer

What it covers:
- `POST /api/sales/1/sales_report` — sales data
- `POST /api/account/1/my_bands` — artist/label account info
- `POST /api/band/1/info` — band metadata
- Order management, merchandise, shipping

What it does NOT cover: track discovery, search, stream URLs, fan-facing data. Completely useless for a streaming SDK.

---

### Unofficial Data Access: Page Scraping

All practical Bandcamp data extraction for streaming purposes relies on scraping HTML pages. The good news: Bandcamp embeds rich structured data directly in its HTML.

**Key data source: `TralbumData` JavaScript object**

Every Bandcamp album and track page embeds a JavaScript object called `TralbumData` (sometimes serialized in a `<script data-tralbum="...">` tag or as an inline script assignment). This contains:

```json
{
  "current": { "title": "...", "id": 12345, ... },
  "tracks": [
    {
      "id": 9876,
      "title": "Track Name",
      "duration": 243.5,
      "file": {
        "mp3-128": "https://t4.bcbits.com/stream/..."
      },
      "streaming": 1,
      "track_num": 1
    }
  ],
  "artist": "Artist Name",
  "item_type": "album"
}
```

The `file["mp3-128"]` field contains the stream URL. This is the free preview stream (128kbps MP3).

**Stream URL format:**
```
https://t4.bcbits.com/stream/{signature}/mp3-128/{track_id}?p=0&ts={timestamp}&t={token}&token={expiry_token}
```

These URLs are time-limited — they expire. The token/timestamp parameters control expiry. You cannot cache them indefinitely. Libraries like `bandcamp-fetch` provide a `stream.refresh(url)` method to handle re-fetching expired URLs.

**High-quality streams (purchased tracks):**
Authenticated users (via session cookie) can access higher-quality MP3 streams for purchased content. The `bandcamp-fetch` library supports this via `bcfetch.setCookie('identity_cookie_value')`, which unlocks `track.streamUrlHQ`.

---

### npm Packages — Current State

#### `bandcamp-fetch` — **Best maintained, actively updated**
- **Repo:** `patrickkfkan/bandcamp-fetch`
- **Version:** 3.1.0 (released ~late 2024, "fixes following Bandcamp site changes")
- **Type:** TypeScript, ESM + CJS hybrid, fully typed
- **Install:** `pnpm add bandcamp-fetch`
- **Features:**
  - Album/track info from URL
  - Artist and label info
  - Discovery feeds, tag-based browsing
  - Bandcamp Daily articles and shows
  - Fan collections, wishlists, social data (requires cookie)
  - Search across tracks, albums, artists, fans, labels
  - Rate limiting and caching built in
  - `stream.test(url)` — validates whether a stream URL is still live
  - `stream.refresh(url)` — re-fetches an expired stream URL
  - High-quality stream via cookie: `track.streamUrlHQ`
- **Cookie auth:** Set once with `bcfetch.setCookie(cookieValue)`, supports multiple instances for multi-user
- **Status:** Actively maintained. Regular updates to handle Bandcamp site changes. This is the definitive Node.js Bandcamp library.

#### `@encode42/bandcamp-fetch` — **Fork, lagging behind**
- Version 1.2.8, last published ~9 months ago
- A fork of `bandcamp-fetch` by a different maintainer
- Fewer stars, less active than the original
- No strong reason to use over `patrickkfkan/bandcamp-fetch`

#### `bandcamp-scraper` (masterT) — **Metadata only, no streams**
- **Repo:** `masterT/bandcamp-scraper`
- **Version:** 1.5.0, last published ~3 years ago
- **Features:** Search, artist info, album info, track info — metadata only, no stream URL extraction
- **Maintenance:** Has daily GitHub Actions tests to detect breakage
- **Status:** Functional but stale. 214 stars, 16 open issues. If you only need metadata and search, it works. For streams, use `bandcamp-fetch`.

#### `node-bandcamp` (jakemmarsh) — **Dead**
- Unofficial Node.js API wrapper, very old. Ignore.

#### `@nutriot/bandcamp-api` — **Official API wrapper only**
- **Version:** 0.5.5 (September 2024)
- **Purpose:** Wraps the official Bandcamp developer API — sales data, order management, etc.
- **Status:** Active, TypeScript, available on both npm and JSR
- Only useful if you have official API access (artists/labels managing their storefront)

---

### Embed Player: Always Available

Bandcamp's embed player requires no API key or authentication:

```html
<iframe
  src="https://bandcamp.com/EmbeddedPlayer/album={album_id}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=true/transparent=true/"
  seamless>
</iframe>
```

Or for a single track:
```
https://bandcamp.com/EmbeddedPlayer/track={track_id}/size=small/...
```

**Parameters:** `size` (small/large), `bgcol`, `linkcol`, `tracklist` (true/false), `artwork` (small/large/none), `transparent` (true/false), `theme` (light/dark)

The album/track IDs come from the `TralbumData` embedded in the page. You still need to scrape to get the IDs, but once you have them the embed works forever without credentials.

**Limitation:** Same as SoundCloud embeds — you get Bandcamp's player UI, not a raw audio stream. No custom pipeline.

---

### Bandcamp's TralbumData: Extraction Pattern

```javascript
// After fetching the HTML of a Bandcamp album/track page:
const match = html.match(/data-tralbum="([^"]+)"/);
// OR
const match = html.match(/TralbumData\s*=\s*({.+?});/s);
const data = JSON.parse(match[1].replace(/&quot;/g, '"'));

// Stream URLs are at:
data.tracks[i].file["mp3-128"]
```

This is exactly what all the scraping libraries do. The `bandcamp-fetch` library handles all of this plus the token refresh logic, rate limiting, and cookie sessions — no reason to implement it from scratch.

---

## Comparison: What to Use for What

| Goal | SoundCloud | Bandcamp |
|---|---|---|
| Metadata from URL | `soundcloud.ts` or oEmbed | `bandcamp-fetch` |
| Stream URL for playback | `soundcloud.ts` (needs client_id) | `bandcamp-fetch` (TralbumData) |
| High-quality/purchased streams | OAuth token (SoundCloud Go+) | Cookie auth (`bandcamp-fetch`) |
| Search | `soundcloud.ts` | `bandcamp-fetch` |
| Embed player (no auth) | Widget iframe | `bandcamp.com/EmbeddedPlayer` |
| Artist/label data | `soundcloud.ts` | `bandcamp-fetch` |
| Sales/orders data | N/A | `@nutriot/bandcamp-api` (official, invite-only) |

---

## What's Dead or Dying

- `soundcloud-scraper` — archived June 2023
- `@distube/soundcloud` — archived June 2024
- `node-soundcloud-downloader` / `soundcloud-downloader` — abandoned 2021
- `soundcloud-v2-api` — 6 years stale
- `bandcamp-scraper` (masterT) — stale 3 years, no stream extraction
- `node-bandcamp` — dead

---

## Key Risks for SDK Integration

**SoundCloud:**
1. `http_mp3_128_url` (progressive MP3) is gone after November 15, 2025. Any package that resolves this is broken post-deadline.
2. The scraped `client_id` rotates unpredictably. Need auto-refresh logic.
3. Official API access requires manual approval with no guaranteed timeline.
4. HLS-only streams after Nov 2025 means you need HLS segment stitching on Node.js (or use a library like `hls.js` browser-side).

**Bandcamp:**
1. Stream URLs are time-limited, tokens expire. Need `stream.refresh()` logic.
2. All data access is via HTML scraping. Site structure changes can break everything. The `bandcamp-fetch` maintainer actively patches these, but there's no guarantee.
3. Songtradr's 50% staff reduction means the Bandcamp site may have more undocumented changes and bugs.
4. Free tier only provides 128kbps MP3 preview streams. Full quality requires purchased content + cookie auth.
5. No API stability guarantees of any kind.

---

## Practical Integration Notes

**For a streaming SDK, the realistic approach is:**

**SoundCloud:**
- Use `soundcloud.ts` for resolution
- Implement `client_id` auto-rotation by re-scraping SoundCloud's JS bundles when requests start 401ing
- Target `hls_aac_160_url` exclusively — don't touch the deprecated fields
- Use HLS.js or a Node.js HLS parser for stream delivery
- Widget embed is the fallback for browser-only scenarios

**Bandcamp:**
- Use `bandcamp-fetch` (patrickkfkan) — it handles caching, rate limiting, stream refresh, and cookie sessions
- Implement expired URL detection and refresh in your playback pipeline
- Cookie auth is the only way to get purchased-quality streams; design for it as optional
- Embed player works for simple cases where raw stream access isn't needed

**Neither platform provides a stable, reliable developer API suitable for high-volume or production streaming SDK use without significant engineering around failure modes.**
