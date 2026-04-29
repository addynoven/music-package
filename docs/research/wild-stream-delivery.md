# Wild Stream Delivery — Research Notes

Deep dive into the plumbing: HLS, DASH, ABR, CDN signing, stream proxying, range requests, and audio transcoding pipelines. Focused on what's actually used in production media servers and what's relevant for a Node.js SDK streaming YouTube and JioSaavn audio to Discord bots and other clients.

---

## 1. HLS Stream Handling

### What HLS Is (the plumbing view)

HLS breaks audio/video into short segments (typically 2–6 seconds), each a `.ts` chunk. A playlist file (`.m3u8`) lists those chunks in order. A master playlist lists multiple variant playlists, one per quality tier. Players download the master, pick a variant, then continuously poll the media playlist and download segments as they appear.

For audio-only streams (which is what we care about), the structure is the same — segments just contain AAC audio instead of muxed A/V.

### npm packages

**`hls-parser`** — the workhorse  
- Synchronous parse/serialize of both master and media playlists  
- Fully conforms to HLS spec rev.23, Apple LL-HLS spec 2020, and HLS.js LL spec  
- Returns structured JS objects: `MasterPlaylist`, `MediaPlaylist`, `Segment`, `Variant`, etc.  
- Also *generates* playlists — useful if you're proxying and need to rewrite URLs  
- Actively maintained as of 2025  
- Use this when you need to inspect or manipulate a playlist at a structural level

```ts
import { parse, stringify } from 'hls-parser';

const playlist = parse(m3u8Text);
// playlist.isMasterPlaylist → true/false
// playlist.variants[0].uri → URL of first quality tier
// playlist.segments → array of Segment objects with .uri, .duration, .mediaSequenceNumber
const rewritten = stringify(playlist);
```

**`hls-stream`** (npm: `hls-stream`)  
- Downloads and parses HLS playlists and segments live — gives you a stream of `Segment` objects  
- Lets you choose a specific variant/rendition before downloading  
- Good if you need to consume an HLS stream as a Node.js Readable without writing all the polling logic yourself

**`parse-hls`**  
- TypeScript-first, zero dependencies  
- Smaller scope than `hls-parser` — just parsing, no generation  
- Better if you only need to read manifests and want minimal footprint

**`node-hls-tools`** (GitHub: kanongil/node-hls-tools)  
- CLI tools: `hlsdump`, `hlsmon`, `hlsrecord`  
- Useful for debugging/recording HLS streams, not really an SDK dependency  
- Good for one-off inspection of what a CDN is actually serving

**`hls.js`** — NOT usable in Node.js  
- Requires `MediaSource` API, browser-only  
- Mentioned here only because it comes up constantly in searches — do not attempt to use it server-side

### HLS Manifest Rewriting Proxies

When you proxy an HLS stream (e.g., forwarding JioSaavn or a YouTube HLS livestream through your own server), the segment URLs in the playlist will point to the origin CDN. Clients hitting your proxy will try to follow those URLs directly, bypassing you. You need to rewrite them.

**`@eyevinn/hls-proxy`** (npm)  
- Fastify-based proxy server with handler hooks for manifest manipulation  
- Three handler types:
  - `masterManifestHandler(req, baseUrl, m3uObject)` → return modified master manifest string
  - `mediaManifestHandler(req, m3uObject)` → return modified media manifest string
  - `segmentRedirectHandler(req)` → return the real segment URL for a 302 redirect
- Production use cases: multi-CDN switching, server-side ad insertion, token injection into segment URLs

**`hls-restream-proxy`** (GitHub: pcruz1905)  
- Injects headers into upstream requests, rewrites m3u8 so segments flow through the proxy  
- Auto-refreshes tokens on expiry — worth studying the token renewal pattern even if you roll your own

**`warren-bank/node-HLS-Proxy`**  
- Simpler, standalone Node.js server  
- Supports prefetching and caching of segments  
- Segment URLs conditionally redirected through the proxy  
- Good reference implementation for understanding the full proxy loop

### Pattern: URL Rewriting in a Manifest Proxy

```ts
// Parse the manifest, rewrite each segment URL to route through your proxy
const playlist = parse(manifestText);
if (!playlist.isMasterPlaylist) {
  for (const segment of playlist.segments) {
    segment.uri = `https://yourproxy.example.com/segment?url=${encodeURIComponent(segment.uri)}&token=${signToken(segment.uri)}`;
  }
}
return stringify(playlist);
```

The proxy endpoint then decodes the URL, fetches the segment from origin with any required headers (auth tokens, cookies, Referer), and pipes the response back. This is the core of any CDN-agnostic audio stream proxy.

---

## 2. DASH Manifest Parsing

DASH uses `.mpd` XML files instead of `.m3u8`. The MPD describes Periods → AdaptationSets → Representations (quality levels). For audio, each Representation has a different bitrate with segment template URLs.

### npm packages

**`mpd-parser`** (VideoJS, npm: `mpd-parser`)  
- The most production-proven DASH parser in the JS ecosystem  
- Outputs a plain JS object compatible with VideoJS's internal stream format  
- Works in Node.js: `const mpdParser = require('mpd-parser')`  
- Last updated October 2024  
- Used in VideoJS, which is deployed at serious scale  

```ts
import { parse } from 'mpd-parser';

const manifest = parse(mpdXmlString, {
  manifestUri: 'https://example.com/stream.mpd',
});
// manifest.playlists → array of quality levels
// manifest.playlists[0].segments → array with .resolvedUri
```

**`@liveinstantly/dash-mpd-parser`**  
- Converts MPD XML → JSON using `xml-js`  
- Lighter, simpler output format  
- Good for cases where you just need the raw structure, not VideoJS-compatible output

**`dashjs`** (npm: `dashjs`)  
- Full DASH player implementation — browser-only, requires MSE  
- Do not use server-side; listed here as a reference for how ABR decisions are made in production (BOLA, DYNAMIC algorithms are documented in its source)

### The WASM Parser (RxPlayer / Canal+)

For large live MPDs refreshed frequently, pure-JS parsing gets expensive. Canal+'s RxPlayer exposes an optional WASM-based MPD parser. Not an npm package you'd pull in casually, but the pattern is worth knowing: offload XML parsing to a WASM worker, keep the main event loop free. Worth considering if parsing large MPDs at high frequency becomes a bottleneck.

---

## 3. Adaptive Bitrate Logic

ABR is the logic that decides which quality tier to request next. The three families:

### Throughput-Based
Measure the download speed of the last N segments. Estimate available bandwidth as the harmonic mean of recent speeds (harmonic mean is less sensitive to outliers than arithmetic mean). If estimated bandwidth > bitrate of next tier up → switch up. If it drops below current tier → switch down.

```
estimatedBandwidth = n / sum(1/speed_i for i in last_n_samples)
```

### Buffer-Based (BOLA — used in dash.js)
Ignore bandwidth measurement. Use only the current buffer level to decide. If buffer is deep → request high quality. If buffer is draining → request lower quality. More stable under variable network because it doesn't react to download speed spikes.

### Hybrid (DYNAMIC — default in dash.js)
Combine both signals. Use throughput when buffer is low (network is the constraint), switch to buffer-based when buffer is healthy (avoid quality thrashing from measurement noise).

### What This Means for Our SDK

We're not building a browser player, so full ABR logic isn't required. But the patterns matter for:

1. **Choosing initial quality** — pick a bitrate tier that matches a reasonable baseline (128kbps for Discord is fine, 320kbps for HiFi clients)
2. **Detecting stall/rebuffering** — if segment fetches are taking longer than the segment duration, you're about to underrun
3. **Graceful degradation** — if a high-quality stream URL fails or times out, fall back to a lower-quality URL rather than erroring the whole request

For JioSaavn specifically, the response includes multiple encrypted URLs at different quality levels (96kbps, 160kbps, 320kbps). That's a manual quality ladder, not true ABR, but the fallback logic is the same pattern.

---

## 4. CDN URL Signing

CDN signed URLs are time-limited, cryptographically authenticated URLs. The CDN validates the signature before serving the content. If the URL is tampered with or expired, the CDN rejects it with 403.

### AWS CloudFront (most common)

**`@aws-sdk/cloudfront-signer`** (AWS SDK v3, official)

```ts
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const signedUrl = getSignedUrl({
  url: 'https://d1234.cloudfront.net/audio/track.mp3',
  keyPairId: process.env.CF_KEY_PAIR_ID,
  privateKey: process.env.CF_PRIVATE_KEY, // RSA private key string
  dateLessThan: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6h expiry
});
```

For HLS, you can also issue a **signed cookie** instead of a signed URL. The cookie covers all URLs under a path prefix, meaning the m3u8 and every `.ts` segment under it are covered by one cookie. Better than signing every segment URL individually.

```ts
import { getSignedCookies } from '@aws-sdk/cloudfront-signer';

const cookies = getSignedCookies({
  url: 'https://d1234.cloudfront.net/audio/*',
  keyPairId: process.env.CF_KEY_PAIR_ID,
  privateKey: process.env.CF_PRIVATE_KEY,
  dateLessThan: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
});
// Set these as response cookies: CloudFront-Policy, CloudFront-Signature, CloudFront-Key-Pair-Id
```

**`aws-cloudfront-sign`** (community, npm)  
- Lighter alternative to the full SDK package  
- Also supports signed RTMP URLs (legacy streaming distributions)

### Google Cloud CDN

Uses Ed25519 or RSA signatures. The `@google-cloud/storage` package handles signed URLs for GCS. For Media CDN (the newer product), signed requests use HMAC-SHA256.

### The Token Rotation Problem

Signed URLs have an expiry. For a track that streams for 4–5 minutes, a 6-hour expiry is fine. But for a long playlist session where users queue up tracks, you need to proactively refresh URLs before they expire.

Pattern for YouTube (InnerTube-derived URLs):
- YouTube's streaming URLs are valid for roughly 6 hours
- They are IP-locked (the URL only works from the IP that requested it)
- Solution: generate a fresh URL at playback time, never cache raw YouTube stream URLs across sessions

Pattern for your own CDN:
- Keep token validity short (10–30 minutes for audio segments)
- Pre-sign at request time, not at track-index time
- For HLS, use signed cookies with a per-session scope so segments are covered without re-signing each one

Key rotation (separate from URL expiry): rotate the signing keypair every 30–60 days. CloudFront supports multiple active keypairs during rotation to avoid breaking in-flight sessions.

---

## 5. Stream Proxying

### The Core Pattern

Fetch audio from origin → pipe through your server → deliver to client. Key constraints:
- Do not buffer the full track in memory
- Respect the client disconnecting early (clean up upstream connection)
- Handle range requests if the client expects to seek

```ts
import { pipeline } from 'stream/promises';
import { request } from 'undici';

async function proxyAudio(originUrl: string, res: ServerResponse, headers: Record<string, string>) {
  const { statusCode, headers: originHeaders, body } = await request(originUrl, {
    headers: { ...headers },
  });

  res.writeHead(statusCode, {
    'Content-Type': originHeaders['content-type'] ?? 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Transfer-Encoding': 'chunked',
  });

  await pipeline(body, res);
}
```

Never use `pipe()` in production — it does not propagate errors or clean up streams on failure. Always use `stream/promises pipeline` or the callback form of `stream.pipeline`. If either side (origin or client) drops, `pipeline` destroys both ends automatically, preventing the memory leak that `pipe()` is notorious for.

### HTTP Client Choice

**`undici`** — best performance for streaming  
- Benchmark: 18,245 req/s (vs got at 6,511, node-fetch at 5,945)  
- `responseType: 'stream'` gives raw Node.js Readable  
- Built into Node.js 18+ as the `fetch()` backend  
- Use `Readable.fromWeb(response.body)` to convert Web Streams to Node.js streams if needed  
- ProxyAgent for SOCKS/HTTP proxy support in one line

**`got`** — second choice, cleaner API  
- Built-in streaming mode, integrates well with Node.js streams  
- Retry logic, timeout handling built in  
- More convenient than undici for non-performance-critical paths

**`axios`** — avoid for streaming  
- `responseType: 'stream'` works but axios was designed for request/response, not streaming  
- Worse error propagation in stream mode  
- Use undici or got instead

### Proxy Diagnostics: The `MaxListenersExceededWarning`

If you see `MaxListenersExceededWarning: Possible EventEmitter memory leak detected` in production on a proxy server, you have a confirmed leak. Usually caused by `pipe()` without cleanup or attaching error listeners in a loop without removing them. Fix: migrate to `stream.pipeline`.

### Handling Premature Client Disconnect

```ts
req.on('close', () => {
  if (!req.complete) {
    // Client dropped — abort the upstream fetch
    abortController.abort();
  }
});
```

Pass the `AbortController` signal to undici's request. This closes the upstream TCP connection instead of letting it drain the full response into a dead socket.

---

## 6. Range Request Handling

Range requests allow clients to fetch a specific byte range of a file. Required for audio seeking in browsers and for Discord's voice connection which expects seekable audio in some contexts.

### HTTP spec

- Client sends: `Range: bytes=start-end`
- Server responds: `206 Partial Content` with `Content-Range: bytes start-end/total`
- If range is unsatisfied (e.g., start > total): `416 Range Not Satisfiable`
- Server must also advertise: `Accept-Ranges: bytes`

### Implementation

```ts
function handleRangeRequest(req: IncomingMessage, res: ServerResponse, buffer: Buffer) {
  const rangeHeader = req.headers['range'];

  if (!rangeHeader) {
    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
    });
    res.end(buffer);
    return;
  }

  const [, rangeStr] = rangeHeader.split('=');
  const [startStr, endStr] = rangeStr.split('-');
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : buffer.length - 1;

  if (start > end || start >= buffer.length) {
    res.writeHead(416, { 'Content-Range': `bytes */${buffer.length}` });
    res.end();
    return;
  }

  const chunk = buffer.slice(start, end + 1);
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
    'Content-Length': chunk.length,
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
  });
  res.end(chunk);
}
```

### For Streaming (Unknown Total Length)

When proxying a live or unknown-length stream, you can't set `Content-Range` total. Options:
- Serve without range support (`Accept-Ranges: none`) — clients can't seek
- Buffer the full audio first, then serve with ranges — only feasible for short tracks
- Use chunked transfer encoding and accept that seeking won't work — fine for Discord bots

**`send-seekable`** (npm)  
- Express middleware that adds `res.sendSeekable(buffer | stream)` for serving buffers/streams with range request support  
- Handles the full RFC 7233 Range header parsing  
- Good for buffered audio delivery from memory

**`express-partial-content`** (npm)  
- Similar to `send-seekable`, more explicit API  
- Based on the well-referenced CodeProject article on HTTP 206 in Node.js

For Discord bots specifically: `@discordjs/voice` drives the playback pace through Opus packet timing. It does not issue range requests to the audio source. Range handling is more relevant if you're also serving audio to browser clients or REST endpoints.

---

## 7. Audio Transcoding Pipelines

### The Full Discord Pipeline

Discord voice requires audio encoded as Opus, 48kHz, stereo, 20ms frames. Anything that isn't already in that format must go through a transcoder.

```
Source (mp3/aac/ogg/HLS segment)
  → FFmpeg (transcode to s16le PCM, 48kHz stereo)
    → Opus Encoder (@discordjs/opus)
      → RTP Packet (sequence number, timestamp, SSRC)
        → Encrypted (XChaCha20-Poly1305 or AES-256-GCM)
          → UDP to Discord voice server
```

This is what `prism-media` and `@discordjs/voice` implement internally.

### prism-media

- Modular pipeline: OggDemuxer, WebmDemuxer, VolumeTransformer, Opus encoder/decoder
- Optional dependencies — choose one Opus backend:
  - `@discordjs/opus` — native bindings, fastest
  - `opusscript` — pure JS fallback, slower, no native compile required
- FFmpeg integration: spawn ffmpeg, pipe stdin/stdout, wrap in a Node.js Transform stream
- The shortcut path: if input is already Ogg/Opus or WebM/Opus, demux directly — skip FFmpeg entirely, no transcoding cost

**Fast path (no FFmpeg)**:
```
OggOpus file → OggDemuxer → Opus packets (ready to send)
```

**Slow path (FFmpeg)**:
```
MP3/AAC/anything → FFmpeg child_process → s16le PCM → Opus Encoder
```

### FFmpeg via child_process

Fluent-ffmpeg is deprecated as of 2025. Roll your own `child_process.spawn`:

```ts
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';

function createFFmpegTranscoder(inputStream: Readable): Readable {
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',          // read from stdin
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-f', 's16le',            // signed 16-bit little-endian PCM
    '-ar', '48000',           // 48kHz (Discord requirement)
    '-ac', '2',               // stereo
    'pipe:1',                 // write to stdout
  ]);

  // Pipe input stream → ffmpeg stdin
  pipeline(inputStream, ffmpeg.stdin).catch(() => ffmpeg.kill());

  // Handle ffmpeg errors
  ffmpeg.stderr.on('data', (data) => {
    console.error('[ffmpeg]', data.toString());
  });

  ffmpeg.on('close', (code) => {
    if (code !== 0) ffmpeg.stdout.destroy(new Error(`ffmpeg exited with code ${code}`));
  });

  return ffmpeg.stdout;
}
```

Critical: always call `ffmpeg.stdin.end()` or `ffmpeg.stdin.destroy()` when the input stream ends or errors. FFmpeg won't flush output until stdin is closed.

### Opus Encoding Directly

If you already have raw PCM from FFmpeg:

```ts
import { OpusEncoder } from '@discordjs/opus';

const encoder = new OpusEncoder(48000, 2); // 48kHz, stereo
const frameSize = 960; // 20ms at 48kHz

// Process PCM in 960-sample (3840-byte) frames
for (let offset = 0; offset + 3840 <= pcmBuffer.length; offset += 3840) {
  const frame = pcmBuffer.slice(offset, offset + 3840);
  const opusPacket = encoder.encode(frame);
  // send opusPacket to Discord
}
```

### Format-Specific Shortcuts

| Input format | Best approach |
|---|---|
| Ogg/Opus | `prism-media` OggDemuxer — zero transcoding |
| WebM/Opus | `prism-media` WebmDemuxer — zero transcoding |
| MP3 | FFmpeg → PCM → Opus encoder |
| AAC (from HLS .ts segments) | FFmpeg → PCM → Opus encoder |
| AAC (raw from JioSaavn) | FFmpeg → PCM → Opus encoder |
| YouTube Opus (itag 251) | OGG container → demux → direct Opus packets |
| YouTube AAC (itag 140) | FFmpeg → PCM → Opus encoder |

Always prefer the demux path when the source is already Opus. It removes the most CPU-intensive step.

### Discord E2EE (DAVE Protocol, September 2024+)

Discord began migrating voice/video to end-to-end encryption in September 2024 via the DAVE protocol. Encryption modes:
- `aead_xchacha20_poly1305_rtpsize` — always supported (required baseline)
- `aead_aes256_gcm_rtpsize` — optional, hardware-dependent

`@discordjs/voice` handles this internally. You don't encrypt Opus packets yourself — the voice library does. But you do need at least one encryption library installed (`sodium-native`, `libsodium-wrappers`, or `tweetnacl`).

---

## 8. YouTube Stream Extraction

### Current Landscape (2025)

The original `ytdl-core` (fent/node-ytdl-core) stopped active development in 2023.  
`@distube/ytdl-core` was the community fork — **archived August 16, 2025, now read-only**.  
The DisTube maintainers themselves now recommend `youtubei.js`.

**`youtubei.js`** (npm: `youtubei.js`) — current recommendation  
- Full JavaScript client for YouTube's InnerTube private API  
- Maintained by LuanRT, latest release v17.0.1 (March 2026)  
- Used by ~14,700 projects  
- Works in Node.js, Deno, browsers

```ts
import { Innertube } from 'youtubei.js';

const yt = await Innertube.create();
const info = await yt.getInfo('VIDEO_ID');

// Get audio-only formats, sorted by bitrate descending
const audioFormats = info.streaming_data?.adaptive_formats
  .filter(f => f.mime_type.startsWith('audio/'))
  .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

const bestAudio = audioFormats?.[0];
// bestAudio.mime_type → 'audio/webm; codecs="opus"' (itag 251) or 'audio/mp4' (itag 140)
// bestAudio.url → the actual stream URL
```

**itag reference** (what you'll actually see):
| itag | Container | Codec | Bitrate | Notes |
|---|---|---|---|---|
| 251 | WebM | Opus | ~160kbps VBR | Best for Discord — demux directly |
| 250 | WebM | Opus | ~70kbps VBR | Fallback |
| 249 | WebM | Opus | ~50kbps VBR | Low quality |
| 140 | MP4 | AAC | 128kbps | Needs FFmpeg to reach Discord |
| 139 | MP4 | AAC | 48kbps | Low quality |

For Discord, prefer itag 251 (WebM/Opus). The audio is already in Opus — you can demux and send directly without FFmpeg transcoding.

YouTube URLs are valid ~6 hours and are IP-locked. Never cache them. Generate at playback time.

**`ytdlp-nodejs`** — yt-dlp wrapper  
- Shells out to the yt-dlp binary  
- Supports thousands of sites beyond YouTube  
- TypeScript-typed, fluent API  
- Slower than native JS InnerTube clients (process spawn overhead) but more robust against YouTube anti-bot measures  
- Trade-off: binary dependency vs. pure JS

---

## 9. JioSaavn Stream Extraction

JioSaavn responses include encrypted media URLs. The encryption is a simple DES cipher (not DRM — it's obfuscation). The decryption is well-documented in open projects.

**Public API** (saavn.dev, unofficial but stable)  
- Returns song metadata including `download_url` array at multiple qualities: `12kbps`, `48kbps`, `96kbps`, `160kbps`, `320kbps`  
- The decrypted URL at 320kbps is a direct CDN link (Akamai-hosted)  
- No HLS for regular on-demand tracks — it's a plain HTTP MP3/AAC at a CDN URL

**Encryption pattern** (for direct API use):
```ts
import { createDecipheriv } from 'crypto';

function decryptJioSaavnUrl(encryptedUrl: string): string {
  const key = Buffer.from('38346591');    // known DES key
  const cipher = createDecipheriv('des-ecb', key, '');
  cipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    cipher.update(Buffer.from(encryptedUrl, 'base64')),
    cipher.final(),
  ]);
  return decrypted.toString('utf8').replace(/[^\x20-\x7E]/g, '');
}
```

Quality upgrade: JioSaavn URLs have a `_96.mp4` or `_320.mp4` suffix pattern — you can swap the quality string in the URL after decryption to get the highest available quality, though this is fragile and can break.

**yt-dlp** also supports JioSaavn extraction natively (commit 0c21c53) — the `ytdlp-nodejs` wrapper makes this accessible from Node.js.

---

## 10. Segment Caching Strategy

For an SDK that proxies streams, segment caching determines how much load you put on upstream CDNs and how well you handle repeat requests.

### What to Cache and for How Long

| Resource | Cache strategy | Why |
|---|---|---|
| HLS/DASH segments | Long TTL (hours), immutable | Content-addressed; once served, never changes |
| Media playlists (live) | Short TTL (5–10s) or no cache | Updated every segment interval |
| Media playlists (VOD) | Long TTL | Never changes after initial creation |
| Master playlists | Medium TTL (minutes) | Can change if CDN routes change |
| Signed URLs | Never cache | Expire; IP-locked (YouTube) |
| Track metadata | Long TTL with stale-while-revalidate | Rarely changes |

### In-Process Caching (LRU)

For an SDK that serves multiple concurrent bot sessions, cache recently-fetched manifests in memory:

```ts
import { LRUCache } from 'lru-cache';

const manifestCache = new LRUCache<string, string>({
  max: 100,           // max 100 manifests in memory
  ttl: 10_000,        // 10 second TTL for live manifests
});
```

For segments themselves: don't cache them in Node.js memory (they're binary, large, and numerous). Put a Redis or CDN in front if you need segment caching at scale.

---

## 11. Key Patterns Summary

**Stream proxying correctly**:  
Always `stream/promises pipeline`, never `.pipe()`. Handle `req.close` to abort upstream. Use undici for performance.

**HLS manipulation**:  
`hls-parser` for structural access + `@eyevinn/hls-proxy` pattern for proxying with URL rewriting.

**DASH parsing**:  
`mpd-parser` (VideoJS) if you need production-proven compatibility. `@liveinstantly/dash-mpd-parser` for lightweight JSON output.

**Audio to Discord**:  
Prefer WebM/Opus source (YouTube itag 251) → demux with prism-media → send directly. Avoid FFmpeg when possible. When unavoidable (AAC, MP3), use `child_process.spawn` with proper stdin cleanup.

**YouTube extraction**:  
`youtubei.js` is the current gold standard. `ytdl-core` and its forks are dead or dying. yt-dlp via `ytdlp-nodejs` as fallback for anti-bot resistance.

**JioSaavn**:  
DES-ECB decryption of URL → direct CDN MP3 at up to 320kbps. No HLS, no DRM. Simple to implement.

**CDN signing**:  
`@aws-sdk/cloudfront-signer` for CloudFront. Use signed cookies for HLS (covers all segments under a path). Keep expiry short (10–30 min for segments, 6h for session cookies).

**Range requests**:  
Required for browser playback. Not needed for Discord. `send-seekable` handles the RFC if you need it fast. Implement manually for full control.

**Backpressure**:  
Set `highWaterMark` to match your use case (Discord sends 3840-byte frames every 20ms — a 32KB buffer is plenty). Watch for `MaxListenersExceededWarning` as the signal for a pipe-based leak.
