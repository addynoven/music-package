import { describe, it, expect } from 'vitest'
import { rankSongs } from '../../../src/discovery/ranker'
import { makeSong } from '../../helpers/mock-factory'

describe('rankSongs()', () => {
  // ─── edge cases ────────────────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    expect(rankSongs([])).toEqual([])
  })

  it('returns a new array — does not mutate input', () => {
    const songs = [
      makeSong({ videoId: 'a', title: 'Live Version', artist: 'X' }),
      makeSong({ videoId: 'b', title: 'Original', artist: 'X' }),
    ]
    const original0 = songs[0]
    rankSongs(songs)
    expect(songs[0]).toBe(original0)
  })

  it('preserves all songs — same count in, same count out', () => {
    const songs = [makeSong(), makeSong({ videoId: 'a' }), makeSong({ videoId: 'b' })]
    expect(rankSongs(songs)).toHaveLength(3)
  })

  // ─── title signal (0.40) ───────────────────────────────────────────────────

  describe('title signal', () => {
    it('ranks a clean title above a "live" version', () => {
      const songs = [
        makeSong({ videoId: 'a', title: 'Zenzenzense (Live)', artist: 'RADWIMPS' }),
        makeSong({ videoId: 'b', title: 'Zenzenzense', artist: 'RADWIMPS' }),
      ]
      expect(rankSongs(songs)[0].videoId).toBe('b')
    })

    it.each(['cover', 'karaoke', 'tribute', 'instrumental', 'acoustic', 'remix', 'demo', 'remaster', 'bamboo', 'anniversary'])(
      'penalizes "%s" in title',
      (keyword) => {
        const songs = [
          makeSong({ videoId: 'noisy', title: `Song (${keyword} version)`, duration: 210 }),
          makeSong({ videoId: 'clean', title: 'Song', duration: 210 }),
        ]
        expect(rankSongs(songs)[0].videoId).toBe('clean')
      },
    )
  })

  // ─── duration signal (0.35) ────────────────────────────────────────────────

  describe('duration signal', () => {
    it('pushes a 30-second preview to the bottom when others are ~4 minutes', () => {
      const songs = [
        makeSong({ videoId: 'preview', title: 'Zenzenzense', artist: 'X', duration: 30 }),
        makeSong({ videoId: 'a', title: 'Zenzenzense', artist: 'RADWIMPS', duration: 240 }),
        makeSong({ videoId: 'b', title: 'Zenzenzense', artist: 'Y', duration: 238 }),
      ]
      const result = rankSongs(songs)
      expect(result[result.length - 1].videoId).toBe('preview')
    })
  })

  // ─── album signal (0.15) ───────────────────────────────────────────────────

  describe('album signal', () => {
    it.each(['Greatest', 'Hits', 'Collection', 'Party', 'Workout', 'Ultimate', 'Essential', 'Summer', 'Mix'])(
      'penalizes "%s" in album name',
      (keyword) => {
        const songs = [
          makeSong({ videoId: 'comp', album: `${keyword} Playlist`, duration: 210 }),
          makeSong({ videoId: 'orig', album: 'Studio Album', duration: 210 }),
        ]
        expect(rankSongs(songs)[0].videoId).toBe('orig')
      },
    )
  })

  // ─── dominant artist signal (0.10) ────────────────────────────────────────

  describe('dominant artist signal', () => {
    it('boosts the artist that dominates clean-title results', () => {
      const songs = [
        makeSong({ videoId: 'a', title: 'Zenzenzense', artist: 'RADWIMPS', duration: 240 }),
        makeSong({ videoId: 'b', title: 'Zenzenzense', artist: 'RADWIMPS', duration: 238 }),
        makeSong({ videoId: 'c', title: 'Zenzenzense', artist: 'Other', duration: 235 }),
      ]
      // RADWIMPS has 2 clean entries — should be ranked higher than Other
      const result = rankSongs(songs)
      expect(result[0].artist).toBe('RADWIMPS')
    })

    it('does NOT treat cover artists as dominant even when they have more entries', () => {
      // MIT Syncopasian has 3 entries but all have noisy titles.
      // RADWIMPS has 1 entry with a clean title.
      // The dominant artist should be RADWIMPS (computed only from clean-title songs).
      const songs = [
        makeSong({ videoId: 'c1', title: 'Zenzenzense (A cappella Cover)', artist: 'MIT Syncopasian', duration: 220 }),
        makeSong({ videoId: 'c2', title: 'Zenzenzense (Live Cover)', artist: 'MIT Syncopasian', duration: 230 }),
        makeSong({ videoId: 'c3', title: 'Zenzenzense (Bamboo Cover)', artist: 'MIT Syncopasian', duration: 215 }),
        makeSong({ videoId: 'orig', title: 'Zenzenzense', artist: 'RADWIMPS', duration: 240 }),
      ]
      expect(rankSongs(songs)[0].videoId).toBe('orig')
    })
  })
})
