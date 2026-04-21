import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/sources/jiosaavn/client', () => ({
  DefaultJioSaavnClient: vi.fn(),
}))

import { JioSaavnSource } from '../../../src/sources/jiosaavn'
import { DefaultJioSaavnClient } from '../../../src/sources/jiosaavn/client'

const mockClient = {
  search: vi.fn(),
  searchAll: vi.fn(),
  getSong: vi.fn(),
  getAlbum: vi.fn(),
  getArtist: vi.fn(),
  getPlaylist: vi.fn(),
  getHome: vi.fn(),
  getLyrics: vi.fn(),
}

;(DefaultJioSaavnClient as any).mockImplementation(() => mockClient)

beforeEach(() => vi.clearAllMocks())

describe('JioSaavnSource — getLyrics HTML sanitization', () => {
  it('converts <br> tags to newlines', async () => {
    mockClient.getLyrics.mockResolvedValue({ lyrics: 'Line one<br>Line two<br>Line three' })
    const src = new JioSaavnSource()
    const result = await src.getLyrics('jio:abc')
    expect(result).toBe('Line one\nLine two\nLine three')
  })

  it('converts <br/> self-closing tags to newlines', async () => {
    mockClient.getLyrics.mockResolvedValue({ lyrics: 'Line one<br/>Line two' })
    const src = new JioSaavnSource()
    const result = await src.getLyrics('jio:abc')
    expect(result).toBe('Line one\nLine two')
  })

  it('converts <br /> with space to newlines', async () => {
    mockClient.getLyrics.mockResolvedValue({ lyrics: 'Line one<br />Line two' })
    const src = new JioSaavnSource()
    const result = await src.getLyrics('jio:abc')
    expect(result).toBe('Line one\nLine two')
  })

  it('leaves plain text lyrics unchanged', async () => {
    mockClient.getLyrics.mockResolvedValue({ lyrics: 'Plain lyrics\nAlready newlines' })
    const src = new JioSaavnSource()
    const result = await src.getLyrics('jio:abc')
    expect(result).toBe('Plain lyrics\nAlready newlines')
  })

  it('returns null when lyrics field is missing', async () => {
    mockClient.getLyrics.mockResolvedValue({})
    const src = new JioSaavnSource()
    const result = await src.getLyrics('jio:abc')
    expect(result).toBeNull()
  })
})
