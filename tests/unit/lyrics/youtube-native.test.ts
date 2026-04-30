import { describe, it, expect, vi, beforeEach } from 'vitest'
import { YouTubeNativeLyricsProvider } from '../../../src/lyrics/youtube-native'
import type { Innertube } from 'youtubei.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShelf(text: string) {
  return {
    description: {
      toString: () => text,
    },
  }
}

function makeYt(getLyrics: ReturnType<typeof vi.fn>) {
  return {
    music: { getLyrics },
  } as unknown as Innertube
}

beforeEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('YouTubeNativeLyricsProvider', () => {
  describe('no videoId provided', () => {
    it('returns null without calling yt', async () => {
      const getLyrics = vi.fn()
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up')

      expect(result).toBeNull()
      expect(getLyrics).not.toHaveBeenCalled()
    })

    it('returns null when videoId is explicitly undefined', async () => {
      const getLyrics = vi.fn()
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up', 213, undefined, undefined)

      expect(result).toBeNull()
      expect(getLyrics).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('returns Lyrics with plain populated and synced null', async () => {
      const lyricsText = 'Never gonna give you up\nNever gonna let you down'
      const getLyrics = vi.fn().mockResolvedValueOnce(makeShelf(lyricsText))
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Rick Astley', 'Never Gonna Give You Up', 213, undefined, 'dQw4w9WgXcQ')

      expect(result).not.toBeNull()
      expect(result!.plain).toBe(lyricsText)
      expect(result!.synced).toBeNull()
    })

    it('calls yt.music.getLyrics with the correct videoId', async () => {
      const getLyrics = vi.fn().mockResolvedValueOnce(makeShelf('Some lyrics'))
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      await provider.fetch('Artist', 'Title', undefined, undefined, 'abc123')

      expect(getLyrics).toHaveBeenCalledOnce()
      expect(getLyrics).toHaveBeenCalledWith('abc123')
    })

    it('trims leading/trailing whitespace from the lyrics text', async () => {
      const getLyrics = vi.fn().mockResolvedValueOnce(makeShelf('  some lyrics\n  '))
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid1')

      expect(result!.plain).toBe('some lyrics')
    })
  })

  describe('yt.music.getLyrics throws', () => {
    it('returns null when getInfo throws a network error', async () => {
      const getLyrics = vi.fn().mockRejectedValueOnce(new Error('Network error'))
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'dQw4w9WgXcQ')

      expect(result).toBeNull()
    })

    it('returns null when getLyrics throws any error', async () => {
      const getLyrics = vi.fn().mockRejectedValueOnce(new Error('InnerTube failure'))
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Artist', 'Title', 213, undefined, 'xyz')

      expect(result).toBeNull()
    })
  })

  describe('no Lyrics tab / empty response', () => {
    it('returns null when getLyrics resolves to undefined (no Lyrics tab)', async () => {
      const getLyrics = vi.fn().mockResolvedValueOnce(undefined)
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'dQw4w9WgXcQ')

      expect(result).toBeNull()
    })

    it('returns null when the lyrics text is empty after trim', async () => {
      const getLyrics = vi.fn().mockResolvedValueOnce(makeShelf('   '))
      const provider = new YouTubeNativeLyricsProvider(makeYt(getLyrics))

      const result = await provider.fetch('Artist', 'Title', undefined, undefined, 'vid2')

      expect(result).toBeNull()
    })
  })

  describe('provider metadata', () => {
    it('has the name "youtube-native"', () => {
      const provider = new YouTubeNativeLyricsProvider(makeYt(vi.fn()))
      expect(provider.name).toBe('youtube-native')
    })
  })
})
