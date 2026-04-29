import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSpotifyUrl } from '../../../src/utils/url-resolver'

const TRACK_URL = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'

function makeHtmlResponse(title: string): Response {
  return new Response(`<html><head><title>${title}</title></head></html>`, { status: 200 })
}

describe('resolveSpotifyUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null for a plain search query', async () => {
    expect(await resolveSpotifyUrl('bohemian rhapsody')).toBeNull()
  })

  it('returns null for a YouTube URL', async () => {
    expect(await resolveSpotifyUrl('https://youtube.com/watch?v=abc')).toBeNull()
  })

  it('returns null for a Spotify album URL (not a track)', async () => {
    expect(await resolveSpotifyUrl('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC')).toBeNull()
  })

  it('returns null for a Spotify artist URL', async () => {
    expect(await resolveSpotifyUrl('https://open.spotify.com/artist/4uLU6hMCjMI75M1A2tKUQC')).toBeNull()
  })

  it('extracts artist and title from a standard Spotify track page title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeHtmlResponse('Blinding Lights - song and lyrics by The Weeknd | Spotify')
    )
    expect(await resolveSpotifyUrl(TRACK_URL)).toBe('Blinding Lights The Weeknd')
  })

  it('handles lowercase "song and lyrics by" in title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeHtmlResponse('Story of My Life - song and lyrics by One Direction | Spotify')
    )
    expect(await resolveSpotifyUrl(TRACK_URL)).toBe('Story of My Life One Direction')
  })

  it('returns null when fetch returns non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }))
    expect(await resolveSpotifyUrl(TRACK_URL)).toBeNull()
  })

  it('returns null when HTML has no title element', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html><body>no title here</body></html>', { status: 200 })
    )
    expect(await resolveSpotifyUrl(TRACK_URL)).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))
    expect(await resolveSpotifyUrl(TRACK_URL)).toBeNull()
  })
})
