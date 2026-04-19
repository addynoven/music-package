/**
 * Browse — home feed, artist pages, album pages, radio, related, charts.
 *
 * All browse calls are cached automatically:
 *   Home    → 8 hours
 *   Artist  → 1 hour
 *   Album   → 1 hour
 */

import { MusicKit } from 'musicstream-sdk'
import type { Section, Artist, Album, Song } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Home feed ---
  //
  // Returns a list of sections, each containing mixed content.
  // Typical sections: "Quick picks", "Trending", "New releases", "Recommended"

  const home: Section[] = await mk.getHome()

  for (const section of home) {
    console.log(`\n== ${section.title} ==`)
    for (const item of section.items) {
      // item is Song | Album | Artist — discriminate by item.type
      if (item.type === 'song') {
        console.log(`  Song: ${item.title} — ${item.artist}`)
      } else if (item.type === 'album') {
        console.log(`  Album: ${item.title} — ${item.artist}`)
      } else if (item.type === 'artist') {
        console.log(`  Artist: ${item.name}`)
      }
    }
  }

  // --- Artist page ---

  const artist: Artist = await mk.getArtist("UCiMhD4jzUqG-IgPzUmmytRQ")

  console.log(artist.name)         // "Queen"
  console.log(artist.subscribers)  // "10M"
  console.log(artist.songs)        // Song[] — top songs
  console.log(artist.albums)       // Album[]
  console.log(artist.singles)      // Album[]

  // --- Album page ---

  const album: Album = await mk.getAlbum("MPREb_4pL8gzRtw1v")

  console.log(album.title)       // "A Night at the Opera"
  console.log(album.artist)      // "Queen"
  console.log(album.year)        // "1975"
  console.log(album.tracks)      // Song[] — all tracks in order

  // --- Radio (auto-generated playlist from a seed song) ---

  const radio: Song[] = await mk.getRadio("fJ9rUzIMcZQ")
  console.log(`Radio has ${radio.length} songs`)
  console.log(radio[0].title)    // first song after the seed

  // --- Related songs ---

  const related: Song[] = await mk.getRelated("fJ9rUzIMcZQ")
  console.log(related.map(s => s.title))

  // --- Charts ---

  const usCharts: Section[] = await mk.getCharts({ country: "US" })
  // → [
  //     { title: "Top songs", items: Song[] },
  //     { title: "Top videos", items: Song[] },
  //     { title: "Top albums", items: Album[] },
  //   ]

  const globalCharts: Section[] = await mk.getCharts() // no country = global
}

main()
