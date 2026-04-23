# SDK Bug Report — Fixes that belong in the SDK, not downstream

## TL;DR

Three issues were patched in the `musicly` server repo that actually belong in `musicstream-sdk`. Every consumer of the SDK will hit them. This report documents each bug, the evidence, and the right place to fix it. The server is being reset to remove all three workarounds so the SDK can own them.

1. **`getStream` returns YouTube URLs that nobody can fetch** — HTTP 403 even with correct headers. ⚠️ biggest one
2. **`download(jioId)` rejects JioSaavn IDs** — callers shouldn't have to hunt for a YouTube equivalent. The SDK should resolve it internally.
3. **Search results are not ranked** — cover artists / tribute bands dominate results over the real artist. Simple signal-based ranking fixes it but belongs in the SDK's `search()` not in downstream code.

---

---

# Issue 1 — `getStream` returns unusable YouTube URLs

## What the SDK does today

In `src/stream/index.ts` (`StreamResolver.resolve`):

```js
const info = await this.yt.music.getInfo(videoId);   // uses YTMUSIC / WEB_REMIX client
const fmt  = audioFmts.sort(...)[0];
const url  = await fmt.decipher(this.yt.session.player);
return { url, codec, bitrate, expiresAt, ... };
```

That URL is handed to the caller. The caller is expected to `fetch(url)` and get audio bytes back. In 2026, that doesn't work.

---

## What actually happens (confirmed with live testing)

Test video ID: `qp0AktOIAag` (YouTube Music track)

The URL returned by `decipher()` contains `c=WEB_REMIX` (YouTube Music web client) and is locked to the session IP. Fetching it behaves as follows:

| Request | YouTube's response |
|---|---|
| No headers | **403** |
| `User-Agent` only | **403** |
| `User-Agent` + `Referer` + `Origin` | **403** |
| All of the above + `Range: bytes=0-1023` | **206 OK** ✅ |
| All of the above + `Range: bytes=0-1048575` (1 MiB) | **206 OK** ✅ |
| All of the above + `Range: bytes=0-2097151` (2 MiB) | **403** |
| All of the above + `Range: bytes=0-10485759` (10 MiB) | **403** |
| All of the above + `Range: bytes=0-` (open-ended) | **403** |
| `Range: bytes=1048576-2097151` (second 1 MiB chunk) | **403** |
| Same URL with `?range=0-X` query param | Same behavior as Range header |

**Two independent restrictions are being applied:**

1. **Range header is mandatory.** Without it the CDN refuses any request.
2. **Only bytes 0 through ~1,048,575 are ever served.** Any offset > 0 is 403. Any length ≥ 2 MiB starting at 0 is 403.

The second restriction is fatal. You cannot stitch chunks together because you cannot fetch the second chunk. A typical song is 3–5 MiB so **no full YouTube track is streamable from the URL the SDK returns.**

---

## Root cause

YouTube's `WEB_REMIX` client (the one used by `yt.music.getInfo`) requires a **PO Token (Proof of Origin)** for unrestricted playback. Without the PO Token, the CDN serves only the first 1 MiB of audio as a preview. This is a server-side anti-bot measure that rolled out for the `web_music` / `WEB_REMIX` clients; it did not exist when streaming URLs were simpler.

Reference: <https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide>

Clients that still work **without** a PO Token (per the yt-dlp wiki):
- `TV`
- `TV_EMBEDDED`
- `WEB_EMBEDDED`
- `ANDROID_VR`

---

## What we tried in the SDK consumer (and why it's the wrong layer)

Inside the server repo (`musicly`), I added a proxy endpoint that fetches the URL with the correct headers and pipes it back. That does not help — the bytes the CDN refuses to send are the same bytes everyone else is asking for. I then added a "chunked refetch" loop, then a JioSaavn fallback, then a debug endpoint. All of it is scaffolding around a broken SDK method.

**The workaround belongs in the SDK**, not in each consumer. Every app, every bot, every integration will hit the same 403 otherwise.

---

## What the SDK already does correctly (on the download path)

`src/downloader/index.ts` has exactly the right fallback pattern — it just doesn't apply it to streaming:

```js
if (err.message?.includes("403") || err.message?.includes("audio fetch failed")) {
    await ytdlpDownload(videoId, dest, format);   // ← fallback path
}
```

Download works because when the deciphered URL returns 403, it shells out to `yt-dlp` which handles all the PO-Token / client-selection / session-cookie dance internally.

Streaming has no equivalent.

---

## Recommended fixes, in order of preference

### 1. Switch the streaming client (lightest change, no new deps)

Call `yt.getInfo(videoId, 'TV_EMBEDDED')` instead of `yt.music.getInfo(videoId)`. Formats from these clients don't require a PO Token.

Caveats to verify:
- `TV_EMBEDDED` / `WEB_EMBEDDED` formats may come through without a direct `url` field — they arrived as pre-formed URLs in our testing but `decipher()` threw. Inspect `fmt.url` directly before calling decipher.
- Quality/bitrate options may be reduced compared to `WEB_REMIX`. Decide if that's acceptable.

Do a spike first: for 10 real-world YouTube IDs, switch the client and confirm the returned URLs actually stream a full song end-to-end. Only ship if they do.

### 2. Add a streaming method that wraps `yt-dlp` (matches the download path)

Expose `MusicKit.streamAudio(videoId) → NodeJS.ReadableStream` that:
- Tries the youtubei.js URL first (fast path, still works for JioSaavn and for YouTube when lucky).
- On 403, spawns `yt-dlp -o - <videoId>` and returns stdout as a readable stream.

Pros: proven, works everywhere `yt-dlp` works, matches what `download()` already does.
Cons: adds a runtime dependency on the `yt-dlp` binary (which the `full` image already has).

This means `getStream` keeps returning the URL object for metadata/back-compat, but consumers playing audio use `streamAudio` instead. Server then exposes a `GET /proxy/:id` that just pipes `streamAudio(id)` — a few lines, no logic.

### 3. Replace the YouTube source with a library that already solved this

Candidates: `@distube/ytdl-core`, `play-dl`, `youtube-dl-exec` (wraps yt-dlp). All of them handle PO Tokens, nsig descrambling, and client rotation internally. The SDK's YouTube source would become a thin wrapper.

Pros: stops reinventing the wheel.
Cons: depends on third-party packages that themselves churn every few months as YouTube changes things — but that's true of youtubei.js too, and at least these packages have bigger maintainer communities fighting that churn.

---

## What the server (this repo) expects after the SDK fix

The correct shape for the showcase server is trivially thin:

```
Bot ─┬─ gRPC Search          → SDK.search         → response
     ├─ gRPC GetStream        → SDK.getStream      → response   (metadata only)
     └─ HTTP GET /proxy/:id   → SDK.streamAudio    → piped bytes
```

No proxy logic, no fallbacks, no chunking, no codec checks, no debug probes. All of that moves to the SDK where it's written once and benefits every caller.

When the SDK fix lands, the server diff should be tiny — probably one new handler in `music.controller.ts` that does `SDK.streamAudio(id).pipe(res)`, nothing more.

---

## Reproducing the bug (10 seconds)

```js
import { MusicKit } from 'musicstream-sdk';
const mk = new MusicKit();
const { url } = await mk.getStream('qp0AktOIAag');
const r = await fetch(url, { headers: {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer':    'https://www.youtube.com/',
  'Origin':     'https://www.youtube.com',
  'Range':      'bytes=0-4194303',
}});
console.log(r.status);   // 403 — should be 206
```

Then change `bytes=0-4194303` to `bytes=0-1048575` and it returns 206, but only gives you the first 1 MiB. That's the bug in miniature.

---

---

# Issue 2 — `download(jioId)` should auto-resolve to a downloadable source

## What the SDK does today

`MusicKit.download(videoId, opts)` only downloads if the ID is a native YouTube videoId. When a caller passes a `jio:XXXXXXXX` ID — which is *exactly what they received from `search()`* — it errors out because the JioSaavn source doesn't implement download.

## Why that's wrong

Callers receive ID strings from `search()` without knowing or caring which source they came from. The SDK's contract should be: **"whatever ID you got from me, you can pass back to me."** Forcing the caller to distinguish `jio:` from YouTube IDs and re-search YouTube manually leaks source internals.

The `musicly` server worked around this by adding auto-resolution logic in its download handler (commit `7839ab5`):

```ts
// SERVER-SIDE workaround — belongs in the SDK
if (videoId.startsWith('jio:')) {
  const meta = await mk.getMetadata(videoId);
  const yt = mk.sources.find(s => s.name === 'youtube-music');
  const results = await yt.search(`${meta.title} ${meta.artist}`, { filter: 'songs' });
  const match = results.find(s => s.videoId && !s.videoId.startsWith('jio:'));
  videoId = match.videoId;
}
await mk.download(videoId, opts);
```

Every SDK consumer will need to write this same block, guaranteed.

## Recommended fix

Inside `MusicKit.download`:

1. If the ID is from a source that doesn't implement download, automatically call `getMetadata()` on that source.
2. Re-search a downloadable source (YouTube Music) using `"{title} {artist}"`.
3. Pick the first non-`jio:` result.
4. Download that.
5. Optionally return `{ originalId, resolvedId }` so the caller can log the redirect.

Move the block above into `src/downloader/index.ts` or wherever the main download entry lives. Server becomes `return mk.download(videoId)` — one line.

---

# Issue 3 — `search()` returns unranked results (cover artists flood real ones)

## What the SDK does today

Both `youtube-music` and `jiosaavn` source `search()` implementations return whatever the upstream API returned, in upstream order. No ranking, no deduplication, no signal about which result is the "real" one.

## Why that's wrong

Upstream order is not quality order. Concrete case we hit:

- Search: **"Zenzenzense RADWIMPS"** (RADWIMPS is the real artist)
- Top 4 results on JioSaavn: 3 by **MIT Syncopasian** (a college a cappella cover group), 1 by RADWIMPS, in that order
- Using `results[0]` plays the cover, not the original

Reason: MIT Syncopasian happened to upload more titles tagged "Zenzenzense" than RADWIMPS did (covers, live covers, a cappella versions). JioSaavn sorts by some internal score, the cover artist wins on volume, the real artist loses.

Same pattern for "Hips Don't Lie" (live versions, karaoke tracks, tribute bands outrank the Shakira original on some queries).

This is not a data problem — it's a ranking problem. The server had to re-rank `search()` output using a multi-signal confidence score. But every SDK consumer will hit the same issue.

## Recommended fix

Add a simple multi-signal ranker inside `search()` (or expose it as `searchRanked()` if you want back-compat). Four signals, weights summing to 1.0:

| Signal | Weight | Notes |
|---|---|---|
| **Title quality** | 0.40 | Penalize titles containing *live, cover, remix, karaoke, tribute, instrumental, acoustic, demo, remaster, bamboo, anniversary*. |
| **Duration clustering** | 0.35 | Compute modal duration (±10s buckets), score by z-score — outliers pushed down. A 30s clip of a 4-minute song is obviously wrong. |
| **Album type** | 0.15 | Penalize compilation keywords: *party, mix, hits, summer, workout, greatest, essential, ultimate, collection*. |
| **Dominant artist** | 0.10 | **Compute dominant artist only from clean-title results** (title score 1.0). Otherwise cover artists with many entries become "dominant" and get the boost themselves — the exact inverse of what we want. |

Sort by total score descending. Optionally expose `{ song, confidence }` tuples rather than bare songs so callers can filter by confidence threshold.

Reference implementation that was living in the server (about 100 lines, no dependencies): see `src/music/search.ranker.ts` in the `musicly` repo's git history at commit `549054d` — **minus** the `ver.` title penalty which was wrong ("movie ver." is a legitimate version, not a cover). The `dominantArtist` fix from that same commit is the core correct piece.

---

# What the server (this repo) looks like after all three SDK fixes

```
Bot ─┬─ gRPC Search          → SDK.search              → response   (ranked)
     ├─ gRPC GetMetadata     → SDK.getMetadata         → response
     ├─ gRPC Download        → SDK.download(anyId)     → response   (auto-resolves jio:)
     └─ HTTP GET /proxy/:id  → SDK.streamAudio(id)     → piped bytes
```

Thin wrapper. No auto-resolve logic. No ranking logic. No proxy fallback logic. Each handler is ~5 lines.

## Sources

- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide) — explains which clients need PO Tokens
- [Invidious issue #3302](https://github.com/iv-org/invidious/issues/3302) — same 403 / Range header behavior, fix pattern
- [LuanRT/YouTube.js docs — InnerTubeClient types](https://ytjs.dev/api/youtubei.js/namespaces/Types/type-aliases/InnerTubeClient) — list of available clients
- [yt-dlp youtube extractor source](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_video.py) — `CHUNK_SIZE = 10 << 20` and the `range=` URL-param approach for DASH formats
