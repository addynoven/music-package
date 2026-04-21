/**
 * Browse — home feed, artist pages, album pages, playlists, radio, charts.
 *
 * All IDs are opaque — use exactly what came back from search() or other browse calls.
 * getHome() routes to JioSaavn for Indian languages, YouTube Music for everything else.
 */

import { MusicKit } from 'musicstream-sdk'
import type { Section, Artist, Album, Playlist, Song } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Home feed ---
  //
  // No language → JioSaavn generic browse modules
  const home: Section[] = await mk.getHome()

  // Indian language → JioSaavn language-specific trending + new releases + playlists
  const hindiHome: Section[]   = await mk.getHome({ language: 'hindi' })
  const punjabiHome: Section[] = await mk.getHome({ language: 'punjabi' })
  const tamilHome: Section[]   = await mk.getHome({ language: 'tamil' })

  // Non-Indian language → YouTube Music (uses session locale set at create time)
  const mkJapan = await MusicKit.create({ language: 'ja', location: 'JP' })
  const japaneseHome: Section[] = await mkJapan.getHome({ language: 'ja' })

  for (const section of home) {
    console.log(`\n== ${section.title} ==`)
    for (const item of section.items) {
      if (item.type === 'song')     console.log(`  Song: ${item.title} — ${item.artist}`)
      if (item.type === 'album')    console.log(`  Album: ${item.title} — ${item.artist}`)
      if (item.type === 'playlist') console.log(`  Playlist: ${item.title}`)
    }
  }

  // --- Featured playlists (JioSaavn curated, Indian languages only) ---

  const hindiPlaylists = await mk.getFeaturedPlaylists({ language: 'hindi' })
  const tamilPlaylists = await mk.getFeaturedPlaylists({ language: 'tamil' })
  // Returns [] silently for non-Indian languages

  console.log('Hindi playlists:', hindiPlaylists.map(p => p.title))

  // --- Artist page ---

  const artists = await mk.search('arijit singh', { filter: 'artists' })
  const artist: Artist = await mk.getArtist(artists[0].channelId)

  console.log(artist.name)         // "Arijit Singh"
  console.log(artist.subscribers)  // "10M" or undefined
  console.log(artist.songs)        // Song[] — top songs
  console.log(artist.albums)       // Album[]
  console.log(artist.singles)      // Album[]

  if (artist.songs.length > 0) {
    const stream = await mk.getStream(artist.songs[0].videoId)
    console.log(stream.url)
  }

  // --- Album page ---

  const albums = await mk.search('aashiqui 2', { filter: 'albums' })
  const album: Album = await mk.getAlbum(albums[0].browseId)

  console.log(album.title)   // "Aashiqui 2"
  console.log(album.artist)  // "Mohit Chauhan"
  console.log(album.year)    // "2013"
  console.log(album.tracks)  // Song[] — all tracks

  const stream = await mk.getStream(album.tracks[0].videoId)
  console.log(stream.url)

  // --- Playlist page ---

  const playlists = await mk.search('bollywood hits', { filter: 'playlists' })
  const playlist: Playlist = await mk.getPlaylist(playlists[0].playlistId)

  console.log(playlist.title)      // "Bollywood Top 50"
  console.log(playlist.songCount)  // total track count
  console.log(playlist.songs)      // Song[]

  if (playlist.songs && playlist.songs.length > 0) {
    const firstStream = await mk.getStream(playlist.songs[0].videoId)
    console.log(firstStream.url)
  }

  // --- Radio (seed song → auto-generated station) ---

  const songs = await mk.search('tum hi ho', { filter: 'songs' })
  const radio: Song[] = await mk.getRadio(songs[0].videoId)
  console.log(`Radio: ${radio.length} songs`)

  // --- Related songs ---

  const related: Song[] = await mk.getRelated('fJ9rUzIMcZQ')
  console.log(related.map(s => s.title))

  // --- Charts ---

  const globalCharts: Section[] = await mk.getCharts()
}

main()
