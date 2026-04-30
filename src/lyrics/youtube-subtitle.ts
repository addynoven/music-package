import type { Innertube } from 'youtubei.js'
import type { Lyrics, LyricLine } from '../models/index.js'
// NOTE: LyricsProviderName does not yet include 'youtube-subtitle'.
// Wave 2 must add it to the union in src/lyrics/provider.ts.
// We cast via `as unknown as LyricsProviderName` to keep the class compilable
// without modifying existing files in this wave.
import type { LyricsProvider, LyricsProviderName } from './provider.js'

/**
 * Regex to filter out non-lyric segments from YouTube auto-captions.
 * Matches lines that consist entirely of sound-effect labels like [Music],
 * [Applause], [Laughter], ♪, or — (em-dash used as a filler in auto-captions).
 */
const NOISE_RE = /^\s*[\[(]?\s*(music|applause|laughter|♪|—|–)\s*[\])]?\s*$/i

/**
 * Converts a raw YouTube TranscriptSegment text (via youtubei.js Text.toString())
 * to a trimmed string, returning null if the segment is noise or empty.
 */
function toCleanText(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (NOISE_RE.test(trimmed)) return null
  return trimmed
}

/**
 * YouTube transcript/subtitle provider — last-resort fallback.
 *
 * Uses `yt.music.getInfo(videoId).getTranscript()` to retrieve auto-captions
 * or manually-uploaded captions for a YouTube video. For music videos the
 * transcript is essentially a synced lyrics track. Auto-captions are imperfect
 * (mishears, no punctuation) but offer universal coverage when every other
 * provider fails.
 *
 * Requires a `videoId` — without one the provider immediately returns null.
 *
 * Wave 2 integration checklist (DO NOT DO THIS IN WAVE 1 — edit existing files):
 *  1. Add 'youtube-subtitle' to LyricsProviderName union in src/lyrics/provider.ts
 *  2. Export YouTubeSubtitleLyricsProvider from src/index.ts
 *  3. Instantiate in MusicKit.ensureClients() with the yt Innertube instance
 *  4. Push to getLyrics provider chain last, passing the resolved videoId
 */
export class YouTubeSubtitleLyricsProvider implements LyricsProvider {
  // Cast needed because 'youtube-subtitle' is not yet in the LyricsProviderName
  // union — Wave 2 will add it. The `as unknown as` double-cast is intentional
  // and documented.
  readonly name = 'youtube-subtitle' as unknown as LyricsProviderName

  constructor(private readonly yt: Innertube) {}

  async fetch(
    _artist: string,
    _title: string,
    _duration?: number,
    _fetchFn?: typeof globalThis.fetch,
    videoId?: string,
  ): Promise<Lyrics | null> {
    if (!videoId) return null

    try {
      // youtubei.js navigation path:
      //   info                          → MediaInfo
      //   .getTranscript()              → TranscriptInfo
      //   .transcript                   → Transcript (YTNode)
      //   .content                      → TranscriptSearchPanel | null
      //   .body                         → TranscriptSegmentList | null
      //   .initial_segments             → ObservedArray<TranscriptSegment | TranscriptSectionHeader>
      //
      // TranscriptSegment fields (all from d.ts):
      //   .start_ms  : string  — milliseconds from video start (as a numeric string)
      //   .end_ms    : string  — end milliseconds
      //   .snippet   : Text    — call .toString() for the plain text
      //
      // TranscriptSectionHeader has the same shape but a different .type static.
      // We filter by .type === 'TranscriptSegment' to skip section headers.
      const info = await this.yt.music.getInfo(videoId)
      const transcriptInfo = await info.getTranscript()

      // Navigate to segments — every step can be null
      const segments = transcriptInfo?.transcript?.content?.body?.initial_segments

      if (!segments || segments.length === 0) return null

      const lines: LyricLine[] = []
      for (const seg of segments) {
        // Filter out TranscriptSectionHeader nodes — they have a different type.
        // YTNode exposes a static `type` string; instance check via `.type` property
        // is the idiomatic youtubei.js approach (avoids importing the concrete class).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((seg as any).type !== 'TranscriptSegment') continue

        // `snippet` is a youtubei.js `Text` instance — .toString() gives plain text.
        // We cast to `any` here because the ObservedArray union type doesn't narrow
        // after the `type` string guard above.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawText: string = (seg as any).snippet?.toString?.() ?? ''
        const text = toCleanText(rawText)
        if (!text) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const startMs = parseInt((seg as any).start_ms ?? '0', 10)
        const time = isNaN(startMs) ? 0 : startMs / 1000

        lines.push({ time, text })
        // `words` is intentionally undefined — transcript segments are line-level only.
      }

      if (lines.length === 0) return null

      const plain = lines.map(l => l.text).join('\n')
      return { plain, synced: lines }
    } catch {
      return null
    }
  }
}
