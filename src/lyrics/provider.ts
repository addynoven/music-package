import type { Lyrics } from '../models/index.js'

export type LyricsProviderName = 'better-lyrics' | 'lrclib' | 'lyrics-ovh' | 'kugou'

export interface LyricsProvider {
  readonly name: LyricsProviderName
  fetch(
    artist: string,
    title: string,
    duration?: number,
    fetchFn?: typeof globalThis.fetch
  ): Promise<Lyrics | null>
}
