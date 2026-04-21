import { describe, it, expect } from 'vitest'
import { getBestThumbnail } from '../../../src/utils/thumbnails'
import type { Thumbnail } from '../../../src/models'

function th(width: number, height: number): Thumbnail {
  return { url: `https://example.com/${width}x${height}.jpg`, width, height }
}

const thumbnails = [th(50, 50), th(150, 150), th(500, 500)]

describe('getBestThumbnail', () => {
  it('returns the thumbnail closest to the target size', () => {
    expect(getBestThumbnail(thumbnails, 160)).toEqual(th(150, 150))
  })

  it('returns exact match when available', () => {
    expect(getBestThumbnail(thumbnails, 150)).toEqual(th(150, 150))
  })

  it('returns smallest when target is smaller than all thumbnails', () => {
    expect(getBestThumbnail(thumbnails, 10)).toEqual(th(50, 50))
  })

  it('returns largest when target is bigger than all thumbnails', () => {
    expect(getBestThumbnail(thumbnails, 1000)).toEqual(th(500, 500))
  })

  it('picks by width when thumbnails have different aspect ratios', () => {
    const mixed = [th(50, 50), th(300, 200), th(500, 500)]
    expect(getBestThumbnail(mixed, 280)).toEqual(th(300, 200))
  })

  it('returns null for empty array', () => {
    expect(getBestThumbnail([], 150)).toBeNull()
  })

  it('returns the only thumbnail regardless of size', () => {
    expect(getBestThumbnail([th(500, 500)], 50)).toEqual(th(500, 500))
  })

  it('handles thumbnails with width 0 (JioSaavn legacy) by falling back to first', () => {
    const zeroWidth = [
      { url: 'https://example.com/small.jpg', width: 0, height: 0 },
      { url: 'https://example.com/large.jpg', width: 0, height: 0 },
    ]
    expect(getBestThumbnail(zeroWidth, 150)).toEqual(zeroWidth[0])
  })
})
