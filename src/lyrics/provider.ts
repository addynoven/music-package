import type { Lyrics, LyricsProviderName } from '../models/index.js'

// Re-export so consumers can import from either location.
export type { LyricsProviderName }

export interface LyricsProvider {
  readonly name: LyricsProviderName
  fetch(
    artist: string,
    title: string,
    duration?: number,
    fetchFn?: typeof globalThis.fetch,
    videoId?: string,
  ): Promise<Lyrics | null>
}
