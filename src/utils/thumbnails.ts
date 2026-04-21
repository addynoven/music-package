import type { Thumbnail } from '../models'

/**
 * Returns the thumbnail whose width is closest to targetSize.
 * Falls back to the first thumbnail when all widths are 0.
 * Returns null for an empty array.
 */
export function getBestThumbnail(thumbnails: Thumbnail[], targetSize: number): Thumbnail | null {
  if (thumbnails.length === 0) return null

  const withDimensions = thumbnails.filter(t => t.width > 0)
  if (withDimensions.length === 0) return thumbnails[0]

  return withDimensions.reduce((best, t) =>
    Math.abs(t.width - targetSize) < Math.abs(best.width - targetSize) ? t : best
  )
}
