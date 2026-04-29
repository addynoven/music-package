import { describe, it, expect } from 'vitest'
import { resolveInput } from '../../../src/utils/url-resolver'

describe('resolveInput', () => {
  // ─── pass-through: already canonical ───────────────────────────────────────

  it('returns plain text query unchanged', () => {
    expect(resolveInput('bohemian rhapsody')).toBe('bohemian rhapsody')
  })

  it('returns plain YouTube video ID unchanged', () => {
    expect(resolveInput('fJ9rUzIMcZQ')).toBe('fJ9rUzIMcZQ')
  })

  // ─── YouTube URLs ──────────────────────────────────────────────────────────

  it('resolves youtube.com/watch?v= to video ID', () => {
    expect(resolveInput('https://www.youtube.com/watch?v=fJ9rUzIMcZQ'))
      .toBe('fJ9rUzIMcZQ')
  })

  it('resolves youtu.be short URL to video ID', () => {
    expect(resolveInput('https://youtu.be/fJ9rUzIMcZQ'))
      .toBe('fJ9rUzIMcZQ')
  })

  it('resolves youtube.com/watch with extra query params', () => {
    expect(resolveInput('https://www.youtube.com/watch?v=fJ9rUzIMcZQ&t=42s&list=PLxxx'))
      .toBe('fJ9rUzIMcZQ')
  })

  // ─── YouTube Music URLs ────────────────────────────────────────────────────

  it('resolves music.youtube.com/watch?v= to video ID', () => {
    expect(resolveInput('https://music.youtube.com/watch?v=fJ9rUzIMcZQ'))
      .toBe('fJ9rUzIMcZQ')
  })

  it('resolves music.youtube.com/watch with extra params', () => {
    expect(resolveInput('https://music.youtube.com/watch?v=fJ9rUzIMcZQ&feature=share'))
      .toBe('fJ9rUzIMcZQ')
  })

  it('resolves YouTube Music browse URL to browse ID', () => {
    expect(resolveInput('https://music.youtube.com/browse/MPREb_WNGQWp5czjD'))
      .toBe('MPREb_WNGQWp5czjD')
  })

  it('resolves YouTube Music playlist URL to playlist ID', () => {
    expect(resolveInput('https://music.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSK'))
      .toBe('PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSK')
  })

  it('extracts query from YouTube Music search URL', () => {
    expect(resolveInput('https://music.youtube.com/search?q=queen'))
      .toBe('queen')
  })

  it('decodes encoded query from YouTube Music search URL', () => {
    expect(resolveInput('https://music.youtube.com/search?q=bohemian+rhapsody'))
      .toBe('bohemian rhapsody')
  })

  it('decodes URI-encoded query from YouTube Music search URL', () => {
    expect(resolveInput('https://music.youtube.com/search?q=tum%20hi%20ho'))
      .toBe('tum hi ho')
  })

  // ─── edge cases ────────────────────────────────────────────────────────────

  it('returns unrecognised URL unchanged', () => {
    const url = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'
    expect(resolveInput(url)).toBe(url)
  })

  it('returns jiosaavn.com URLs unchanged (no longer resolved)', () => {
    const url = 'https://www.jiosaavn.com/song/tum-hi-ho/OQMaey5hbVc'
    expect(resolveInput(url)).toBe(url)
  })

  it('returns empty string unchanged', () => {
    expect(resolveInput('')).toBe('')
  })

  it('returns music.youtube.com URL with unrecognised path unchanged', () => {
    const url = 'https://music.youtube.com/home'
    expect(resolveInput(url)).toBe(url)
  })

  it('returns youtu.be URL with no video path unchanged', () => {
    const url = 'https://youtu.be/'
    expect(resolveInput(url)).toBe(url)
  })
})
