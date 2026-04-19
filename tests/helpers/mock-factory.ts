/**
 * Factories for building test doubles.
 * All fields have realistic defaults — override only what your test needs.
 */

import type { Song, Album, Artist, Thumbnail, StreamingData, AudioTrack, Section, Playlist } from '../../src/models'

export function makeThumbnail(overrides: Partial<Thumbnail> = {}): Thumbnail {
  return {
    url: 'https://lh3.googleusercontent.com/test-thumbnail',
    width: 226,
    height: 226,
    ...overrides,
  }
}

export function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    type: 'song',
    videoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    album: 'Whenever You Need Somebody',
    duration: 213,
    thumbnails: [makeThumbnail()],
    ...overrides,
  }
}

export function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    type: 'album',
    browseId: 'MPREb_4pL8gzRtw1v',
    title: 'A Night at the Opera',
    artist: 'Queen',
    year: '1975',
    thumbnails: [makeThumbnail()],
    tracks: [],
    ...overrides,
  }
}

export function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    type: 'artist',
    channelId: 'UCiMhD4jzUqG-IgPzUmmytRQ',
    name: 'Queen',
    subscribers: '10M',
    thumbnails: [makeThumbnail({ width: 900, height: 900 })],
    songs: [],
    albums: [],
    singles: [],
    ...overrides,
  }
}

export function makeStreamingData(overrides: Partial<StreamingData> = {}): StreamingData {
  const sixHoursFromNow = Math.floor(Date.now() / 1000) + 21600
  return {
    url: `https://rr5---sn-test.googlevideo.com/videoplayback?expire=${sixHoursFromNow}&itag=251&source=youtube`,
    codec: 'opus',
    bitrate: 160000,
    expiresAt: sixHoursFromNow,
    loudnessDb: -7.2,
    sizeBytes: 3456789,
    ...overrides,
  }
}

export function makeExpiredStreamingData(): StreamingData {
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
  return makeStreamingData({
    url: `https://rr5---sn-test.googlevideo.com/videoplayback?expire=${oneHourAgo}&itag=251`,
    expiresAt: oneHourAgo,
  })
}

export function makeAudioTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    ...makeSong(),
    stream: makeStreamingData(),
    ...overrides,
  }
}

export function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    title: 'Quick picks',
    items: [makeSong(), makeSong({ videoId: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen' })],
    ...overrides,
  }
}

export function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    type: 'playlist',
    playlistId: 'PLtest123',
    title: 'Best of the 80s',
    thumbnails: [makeThumbnail()],
    songCount: 42,
    ...overrides,
  }
}
