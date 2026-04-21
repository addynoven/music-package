/**
 * Custom Source Plugin — add a new music platform to MusicKit.
 *
 * MusicKit routes requests through a pipeline of AudioSource plugins.
 * You can register your own to support additional platforms.
 *
 * AudioSource interface:
 *
 *   Required:
 *     name        string             — unique identifier for this source
 *     canHandle   (query) → boolean  — return true if this source owns the query
 *     search      (query, opts?) → Promise<SearchResults | Song[]>
 *     getStream   (id, quality) → Promise<StreamingData>
 *     getMetadata (id) → Promise<Song>
 *
 *   Optional (browse):
 *     getAlbum    (id) → Promise<Album>
 *     getArtist   (id) → Promise<Artist>
 *     getPlaylist (id) → Promise<Playlist>
 *     getRadio    (id) → Promise<Song[]>
 *     getHome     (language?) → Promise<Section[]>
 */

import { MusicKit } from 'musicstream-sdk'
import type {
  AudioSource,
  Song,
  Album,
  Artist,
  Playlist,
  Section,
  StreamingData,
  SearchResults,
  SearchFilter,
} from 'musicstream-sdk'

// ─────────────────────────────────────────────
// Minimal source — required methods only
// ─────────────────────────────────────────────

class SoundCloudSource implements AudioSource {
  readonly name = 'soundcloud'

  canHandle(query: string): boolean {
    // Claim SoundCloud URLs and IDs prefixed with "sc:"
    return query.includes('soundcloud.com') || query.startsWith('sc:')
  }

  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[]> {
    // Call SoundCloud's search API here
    const songs: Song[] = [
      {
        type: 'song',
        videoId: `sc:track-id`,    // prefix your IDs so canHandle() recognizes them later
        title: 'Example Track',
        artist: 'Example Artist',
        duration: 240,
        thumbnails: [{ url: 'https://...', width: 100, height: 100 }],
      },
    ]
    return songs
  }

  async getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData> {
    const trackId = id.replace('sc:', '')
    return {
      url: `https://api.soundcloud.com/tracks/${trackId}/stream`,
      codec: 'mp3',
      bitrate: quality === 'high' ? 320_000 : 128_000,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }
  }

  async getMetadata(id: string): Promise<Song> {
    return {
      type: 'song',
      videoId: id,
      title: 'Example Track',
      artist: 'Example Artist',
      duration: 240,
      thumbnails: [],
    }
  }
}

// ─────────────────────────────────────────────
// Full source — all optional browse methods
// ─────────────────────────────────────────────

class BandcampSource implements AudioSource {
  readonly name = 'bandcamp'

  canHandle(query: string): boolean {
    return query.includes('bandcamp.com') || query.startsWith('bc:')
  }

  async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults | Song[]> {
    return []
  }

  async getStream(id: string, quality: 'high' | 'low'): Promise<StreamingData> {
    return {
      url: `https://bandcamp.com/stream/${id.replace('bc:', '')}`,
      codec: 'mp3',
      bitrate: 320_000,
      expiresAt: Math.floor(Date.now() / 1000) + 7200,
    }
  }

  async getMetadata(id: string): Promise<Song> {
    return { type: 'song', videoId: id, title: '', artist: '', duration: 0, thumbnails: [] }
  }

  async getAlbum(id: string): Promise<Album> {
    return { type: 'album', browseId: id, title: '', artist: '', thumbnails: [], tracks: [] }
  }

  async getArtist(id: string): Promise<Artist> {
    return { type: 'artist', channelId: id, name: '', thumbnails: [], songs: [], albums: [], singles: [] }
  }

  async getPlaylist(id: string): Promise<Playlist> {
    return { type: 'playlist', playlistId: id, title: '', thumbnails: [], songs: [] }
  }

  async getRadio(id: string): Promise<Song[]> {
    return []
  }

  async getHome(language?: string): Promise<Section[]> {
    return [{ title: 'Bandcamp Weekly', items: [] }]
  }
}

// ─────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────

const mk = new MusicKit()

// Custom sources are tried first, in registration order.
mk.registerSource(new SoundCloudSource())
mk.registerSource(new BandcampSource())

// Inspect the pipeline:
console.log(mk.sources.map(s => s.name))
// → ['soundcloud', 'bandcamp', ...built-ins]

// ─────────────────────────────────────────────
// Using the custom sources
// ─────────────────────────────────────────────

async function main() {
  // SoundCloud URL → routed to SoundCloudSource
  const results = await mk.search('https://soundcloud.com/artist/track')

  // SoundCloud stream — "sc:" prefix routes back to SoundCloudSource
  const stream = await mk.getStream('sc:track-id')
  console.log(stream.url)

  // Queries not claimed by custom sources fall through to the built-in pipeline
  const songs = await mk.search('bohemian rhapsody', { filter: 'songs' })
  console.log(songs[0].title)
}

// ─────────────────────────────────────────────
// ID prefix convention
// ─────────────────────────────────────────────
//
// Always return a prefixed ID from your search() method:
//   "sc:"  → SoundCloudSource
//   "bc:"  → BandcampSource
//   plain  → built-in catch-all
//
// The prefix ensures canHandle() correctly re-routes the ID when it's
// passed back to getStream / getAlbum / getArtist / getPlaylist.

main()
