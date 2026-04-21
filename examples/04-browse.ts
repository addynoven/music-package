/**
 * Browse — home feed, artist pages, album pages, playlists, radio, charts.
 *
 * All IDs are opaque — use exactly what came back from search() or other browse calls.
 * getCharts() accepts an optional country code for regional charts.
 */

import { MusicKit } from 'musicstream-sdk'
import type { Section, Artist, Album, Playlist, Song } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Home feed ---
  //
  // Returns curated sections: "New Trending", "New Albums", "Charts", etc.
  // Items in each section are Song | Album | Playlist — discriminate by item.type

  const home: Section[] = await mk.getHome()

  for (const section of home) {
    console.log(`\n== ${section.title} ==`)
    for (const item of section.items) {
      if (item.type === 'song')     console.log(`  Song: ${item.title} — ${item.artist}`)
      if (item.type === 'album')    console.log(`  Album: ${item.title} — ${item.artist}`)
      if (item.type === 'playlist') console.log(`  Playlist: ${item.title}`)
    }
  }

  // --- Artist page ---

  const artists = await mk.search('arijit singh', { filter: 'artists' })
  const artist: Artist = await mk.getArtist(artists[0].channelId)

  console.log(artist.name)         // "Arijit Singh"
  console.log(artist.subscribers)  // "10M" or undefined
  console.log(artist.songs)        // Song[] — top songs
  console.log(artist.albums)       // Album[]
  console.log(artist.singles)      // Album[]

  // Stream any of the artist's songs directly
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

  // Stream any track
  const stream = await mk.getStream(album.tracks[0].videoId)
  console.log(stream.url)

  // --- Playlist page ---

  const playlists = await mk.search('bollywood hits', { filter: 'playlists' })
  const playlist: Playlist = await mk.getPlaylist(playlists[0].playlistId)

  console.log(playlist.title)   // "Bollywood Top 50"
  console.log(playlist.songs)   // Song[] — all tracks

  if (playlist.songs && playlist.songs.length > 0) {
    const firstStream = await mk.getStream(playlist.songs[0].videoId)
    console.log(firstStream.url)
  }

  // --- Radio (seed song → auto-generated playlist) ---

  const songs = await mk.search('tum hi ho', { filter: 'songs' })
  const radio: Song[] = await mk.getRadio(songs[0].videoId)
  console.log(`Radio: ${radio.length} songs`)
  radio.forEach(s => console.log(`  ${s.title} — ${s.artist}`))

  // --- Related songs ---

  const related: Song[] = await mk.getRelated('fJ9rUzIMcZQ')  // YouTube video ID only
  console.log(related.map(s => s.title))

  // --- Charts ---
  //
  // Pass a country code for regional charts. Omit for global.

  const usCharts: Section[] = await mk.getCharts({ country: 'US' })
  // → [
  //     { title: "Top songs",  items: Song[]  },
  //     { title: "Top videos", items: Song[]  },
  //     { title: "Top albums", items: Album[] },
  //   ]

  const globalCharts: Section[] = await mk.getCharts()
}

main()
