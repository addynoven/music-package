/**
 * Search — find songs, albums, artists, and playlists.
 *
 * With a filter, search() returns a typed array.
 * Without a filter, it returns all four categories at once (SearchResults).
 *
 * IDs in results are opaque tokens — pass them back to
 * getStream / getAlbum / getArtist / getPlaylist as-is.
 */

import { MusicKit, SearchFilter } from 'musicstream-sdk'
import type { Song, Album, Artist, Playlist, SearchResults } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Filtered search — typed return ---

  const songs: Song[]         = await mk.search('tum hi ho',  { filter: 'songs' })
  const albums: Album[]       = await mk.search('aashiqui 2', { filter: 'albums' })
  const artists: Artist[]     = await mk.search('arijit',     { filter: 'artists' })
  const playlists: Playlist[] = await mk.search('bollywood',  { filter: 'playlists' })

  // SearchFilter const enum — equivalent to string literals
  const same: Song[] = await mk.search('lata', { filter: SearchFilter.Songs })

  // --- Song fields ---

  const song = songs[0]
  console.log(song.videoId)    // opaque ID — pass to getStream()
  console.log(song.title)      // "Tum Hi Ho"
  console.log(song.artist)     // "Arijit Singh"
  console.log(song.album)      // "Aashiqui 2" (optional)
  console.log(song.duration)   // 252 (seconds)
  console.log(song.thumbnails) // [{ url, width, height }, ...]

  // --- Album fields ---

  const album = albums[0]
  console.log(album.browseId)  // opaque ID — pass to getAlbum()
  console.log(album.title)     // "Aashiqui 2"
  console.log(album.artist)    // "Mohit Chauhan"
  console.log(album.year)      // "2013" (optional)
  console.log(album.tracks)    // [] from search — populated by getAlbum()

  // --- Artist fields ---

  const artist = artists[0]
  console.log(artist.channelId)    // opaque ID — pass to getArtist()
  console.log(artist.name)         // "Arijit Singh"
  console.log(artist.subscribers)  // "10M" or undefined
  console.log(artist.songs)        // [] from search — populated by getArtist()

  // --- Playlist fields ---

  const playlist = playlists[0]
  console.log(playlist.playlistId) // opaque ID — pass to getPlaylist()
  console.log(playlist.title)      // "Bollywood Top 50"
  console.log(playlist.songs)      // [] from search — populated by getPlaylist()

  // --- Unfiltered search — all four categories at once ---

  const results: SearchResults = await mk.search('queen')
  console.log(results.songs.length)
  console.log(results.albums.length)
  console.log(results.artists.length)
  console.log(results.playlists.length)

  // --- Typical pattern: search → stream ---

  const [topSong] = await mk.search('bohemian rhapsody', { filter: 'songs' })
  const stream = await mk.getStream(topSong.videoId)
  console.log(stream.url)  // ready to play
}

main()
