/**
 * Search & Autocomplete — all search options and filter types.
 */

import { MusicKit, SearchFilter } from 'musickit'
import type { Song, Album, Artist, Playlist, SearchResults } from 'musickit'

const mk = new MusicKit()

async function main() {
  // --- Autocomplete ---

  const suggestions: string[] = await mk.autocomplete("bohemian")
  // → ["bohemian rhapsody", "bohemian rhapsody lyrics", "bohemian like you"]

  // --- Search: mixed results ---

  const all: SearchResults = await mk.search("queen")
  // all.songs    → Song[]
  // all.albums   → Album[]
  // all.artists  → Artist[]
  // all.playlists → Playlist[]

  // --- Search: filtered by type ---

  const songs: Song[] = await mk.search("bohemian rhapsody", { filter: "songs" })
  const albums: Album[] = await mk.search("queen", { filter: "albums" })
  const artists: Artist[] = await mk.search("rick astley", { filter: "artists" })
  const playlists: Playlist[] = await mk.search("80s hits", { filter: "playlists" })

  // --- Search: using the enum (for autocomplete in editors) ---

  const byEnum: Song[] = await mk.search("queen", { filter: SearchFilter.Songs })

  // --- Inspect a Song result ---

  const song = songs[0]
  console.log(song.videoId)    // "fJ9rUzIMcZQ"
  console.log(song.title)      // "Bohemian Rhapsody"
  console.log(song.artist)     // "Queen"
  console.log(song.album)      // "A Night at the Opera"
  console.log(song.duration)   // 354  (seconds)
  console.log(song.thumbnails) // [{ url: "https://...", width: 226, height: 226 }, ...]

  // --- Inspect an Album result ---

  const album = albums[0]
  console.log(album.browseId)  // "MPREb_4pL8gzRtw1v"
  console.log(album.title)     // "A Night at the Opera"
  console.log(album.artist)    // "Queen"
  console.log(album.year)      // "1975"

  // --- Inspect an Artist result ---

  const artist = artists[0]
  console.log(artist.channelId)   // "UCiMhD4jzUqG-IgPzUmmytRQ"
  console.log(artist.name)        // "Rick Astley"
  console.log(artist.subscribers) // "4.2M"
}

main()
