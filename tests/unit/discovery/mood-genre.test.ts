import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiscoveryClient } from '../../../src/discovery'

const mockYt = {
  music: {
    getExplore: vi.fn(),
  },
}

describe('DiscoveryClient — mood/genre browsing', () => {
  let client: DiscoveryClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new DiscoveryClient(mockYt as any)
  })

  describe('getMoodCategories', () => {
    it('returns an array of mood categories', async () => {
      mockYt.music.getExplore.mockResolvedValue({
        sections: [
          {
            header: { title: { text: 'Moods & moments' } },
            contents: [
              { title: { text: 'Chill' }, params: 'param_chill' },
              { title: { text: 'Party' }, params: 'param_party' },
              { title: { text: 'Focus' }, params: 'param_focus' },
            ],
          },
        ],
      })

      const result = await client.getMoodCategories()

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('each category has a title and params string', async () => {
      mockYt.music.getExplore.mockResolvedValue({
        sections: [
          {
            header: { title: { text: 'Moods & moments' } },
            contents: [
              { title: { text: 'Chill' }, params: 'param_chill' },
            ],
          },
        ],
      })

      const result = await client.getMoodCategories()

      expect(result[0]).toHaveProperty('title')
      expect(result[0]).toHaveProperty('params')
      expect(typeof result[0].title).toBe('string')
      expect(typeof result[0].params).toBe('string')
    })

    it('returns empty array when no mood sections found', async () => {
      mockYt.music.getExplore.mockResolvedValue({ sections: [] })
      const result = await client.getMoodCategories()
      expect(result).toEqual([])
    })

    it('returns empty array on error', async () => {
      mockYt.music.getExplore.mockRejectedValue(new Error('network error'))
      const result = await client.getMoodCategories()
      expect(result).toEqual([])
    })
  })

  describe('getMoodPlaylists', () => {
    it('returns sections of playlists for a mood params string', async () => {
      mockYt.music.getExplore.mockResolvedValue({
        sections: [
          {
            title: { text: 'Chill vibes' },
            contents: [
              { id: 'PL1', title: { text: 'Late Night Chill' } },
              { id: 'PL2', title: { text: 'Study Beats' } },
            ],
          },
        ],
      })

      const result = await client.getMoodPlaylists('param_chill')

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('title')
      expect(result[0]).toHaveProperty('items')
    })

    it('returns empty array on error', async () => {
      mockYt.music.getExplore.mockRejectedValue(new Error('network error'))
      const result = await client.getMoodPlaylists('param_chill')
      expect(result).toEqual([])
    })
  })
})
