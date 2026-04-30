import type { Innertube } from 'youtubei.js'
import type { Lyrics } from '../models/index.js'
import type { LyricsProvider, LyricsProviderName } from './provider.js'

/**
 * Fetches lyrics from YouTube Music's first-party lyrics tab via InnerTube.
 *
 * API path used:
 *   yt.music.getLyrics(videoId)
 *   → MusicDescriptionShelf | undefined   (node_modules/youtubei.js/dist/src/core/clients/Music.d.ts:31)
 *   → shelf.description.toString()        (MusicDescriptionShelf.description is a Text instance)
 *
 * Returns plain text only — YTM native lyrics have no timestamps.
 *
 * Wave 2 must do:
 *   - Add 'youtube-native' to LyricsProviderName union in src/lyrics/provider.ts
 *   - Export YouTubeNativeLyricsProvider from src/index.ts
 *   - Instantiate with the Innertube instance in MusicKit.ensureClients()
 *   - Add to getLyrics provider chain (passing the resolved videoId as the 5th arg)
 */
export class YouTubeNativeLyricsProvider implements LyricsProvider {
  readonly name: LyricsProviderName = 'youtube-native'

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
      // yt.music.getLyrics(videoId) internally calls getInfo then navigates the
      // lyricsEndpoint — same pattern as Echo's YouTube.next() + YouTube.lyrics()
      // but wrapped neatly in the youtubei.js Music client.
      const shelf = await this.yt.music.getLyrics(videoId)

      if (!shelf) return null

      // MusicDescriptionShelf.description is a Text instance; toString() gives plain text.
      const plain = shelf.description.toString().trim()
      if (!plain) return null

      return { plain, synced: null }
    } catch {
      return null
    }
  }
}
