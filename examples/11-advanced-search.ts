/**
 * Advanced Search — unfiltered results, typed narrowing, pagination patterns.
 *
 * Two return shapes depending on filter:
 *   No filter           → SearchResults  { songs, albums, artists, playlists }
 *   filter: 'songs'     → Song[]
 *   filter: 'albums'    → Album[]
 *   filter: 'artists'   → Artist[]
 *   filter: 'playlists' → Playlist[]
 */

import { MusicKit, SearchFilter } from 'musicstream-sdk'
import type { SearchResults, Song, Album, Artist, Playlist } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // ─────────────────────────────────────────────
  // Unfiltered search — all four categories at once
  // ─────────────────────────────────────────────

  const results: SearchResults = await mk.search('arijit singh')

  console.log(`Songs:     ${results.songs.length}`)
  console.log(`Albums:    ${results.albums.length}`)
  console.log(`Artists:   ${results.artists.length}`)
  console.log(`Playlists: ${results.playlists.length}`)

  results.songs.forEach(s => console.log(`  Song: ${s.title} — ${s.artist}`))
  results.albums.forEach(a => console.log(`  Album: ${a.title}`))
  results.artists.forEach(a => console.log(`  Artist: ${a.name}`))
  results.playlists.forEach(p => console.log(`  Playlist: ${p.title}`))

  // ─────────────────────────────────────────────
  // Filtered search — typed return, zero narrowing needed
  // ─────────────────────────────────────────────

  const songs: Song[]         = await mk.search('tum hi ho',   { filter: 'songs' })
  const albums: Album[]       = await mk.search('aashiqui 2',  { filter: 'albums' })
  const artists: Artist[]     = await mk.search('arijit',      { filter: 'artists' })
  const playlists: Playlist[] = await mk.search('bollywood',   { filter: 'playlists' })

  // SearchFilter const enum — identical to string literals
  await mk.search('lata', { filter: SearchFilter.Songs })

  // ─────────────────────────────────────────────
  // Using IDs from results
  // ─────────────────────────────────────────────
  //
  // IDs are opaque — pass them directly to the corresponding browse method.

  const [song] = songs
  const stream = await mk.getStream(song.videoId)           // Song.videoId → getStream()
  console.log(stream.url)

  const [album] = albums
  const fullAlbum = await mk.getAlbum(album.browseId)       // Album.browseId → getAlbum()
  console.log(fullAlbum.tracks.length)

  const [artist] = artists
  const fullArtist = await mk.getArtist(artist.channelId)   // Artist.channelId → getArtist()
  console.log(fullArtist.songs.length)

  const [playlist] = playlists
  const fullPlaylist = await mk.getPlaylist(playlist.playlistId) // Playlist.playlistId → getPlaylist()
  console.log(fullPlaylist.songs?.length)

  // ─────────────────────────────────────────────
  // Searching with a YouTube URL
  // ─────────────────────────────────────────────
  //
  // Passing a YouTube Music URL returns results with YouTube video IDs.
  // Required for download(), getTrack(), and getRelated().

  const ytSongs = await mk.search('https://music.youtube.com/search?q=queen', { filter: 'songs' })
  // → Song[] with plain YouTube video IDs (e.g. "fJ9rUzIMcZQ")

  await mk.download(ytSongs[0].videoId, { path: './music/' })
  await mk.getTrack(ytSongs[0].videoId)
  await mk.getRelated(ytSongs[0].videoId)

  // ─────────────────────────────────────────────
  // "Load more" pattern
  // ─────────────────────────────────────────────
  //
  // Each call returns a fixed batch (~10–20 results).
  // Use autocomplete() to show alternative queries rather than paginating.

  const suggestions = await mk.autocomplete('bollywood')
  const allResults = await Promise.all(
    suggestions.slice(0, 3).map(q => mk.search(q, { filter: 'songs' }))
  )
  const merged = allResults.flat()
  const unique = [...new Map(merged.map(s => [s.videoId, s])).values()]
  console.log(`${unique.length} unique songs across ${suggestions.slice(0, 3).length} queries`)
}

main()
