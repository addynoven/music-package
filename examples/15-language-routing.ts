/**
 * Language routing — how getHome() picks its source based on language.
 *
 * Indian languages (hindi, tamil, punjabi, …) → JioSaavn language-specific endpoints
 * Everything else (ja, ko, es, fr, …)         → YouTube Music session locale
 *
 * This means you can use one SDK for both Indian music discovery and
 * global music discovery without any manual source selection.
 */

import { MusicKit, JIOSAAVN_LANGUAGES } from 'musicstream-sdk'
import type { Section } from 'musicstream-sdk'

// --- Check the language list at runtime ---

console.log(JIOSAAVN_LANGUAGES.has('hindi'))   // true  → routes to JioSaavn
console.log(JIOSAAVN_LANGUAGES.has('tamil'))   // true  → routes to JioSaavn
console.log(JIOSAAVN_LANGUAGES.has('ja'))      // false → routes to YouTube Music
console.log(JIOSAAVN_LANGUAGES.has('ko'))      // false → routes to YouTube Music

// --- Indian language home feeds (JioSaavn) ---
//
// Uses content.getTrending (songs/albums/playlists) + content.getAlbums + content.getFeaturedPlaylists.
// Sections: "Trending Songs", "Trending Albums", "New Releases", "Trending Playlists", "Featured Playlists"

async function indianLanguages() {
  const mk = new MusicKit()

  const hindiHome:   Section[] = await mk.getHome({ language: 'hindi' })
  const tamilHome:   Section[] = await mk.getHome({ language: 'tamil' })
  const punjabiHome: Section[] = await mk.getHome({ language: 'punjabi' })
  const teluguHome:  Section[] = await mk.getHome({ language: 'telugu' })
  const kannadaHome: Section[] = await mk.getHome({ language: 'kannada' })

  for (const section of hindiHome) {
    console.log(`[hindi] ${section.title}: ${section.items.length} items`)
  }

  // Featured playlists per language (JioSaavn curated)
  const hindiPlaylists  = await mk.getFeaturedPlaylists({ language: 'hindi' })
  const tamilPlaylists  = await mk.getFeaturedPlaylists({ language: 'tamil' })
  const marathiPlaylists = await mk.getFeaturedPlaylists({ language: 'marathi' })

  console.log('Hindi playlists:',  hindiPlaylists.map(p => p.title))
  console.log('Tamil playlists:',  tamilPlaylists.map(p => p.title))
  console.log('Marathi playlists:', marathiPlaylists.map(p => p.title))
}

// --- Non-Indian language home feeds (YouTube Music) ---
//
// Create an instance with the desired locale. The hl/gl are baked into the Innertube
// session — you get localised content for ALL calls on this instance.

async function globalLanguages() {
  const mkJP = await MusicKit.create({ language: 'ja', location: 'JP' })
  const mkKR = await MusicKit.create({ language: 'ko', location: 'KR' })
  const mkES = await MusicKit.create({ language: 'es', location: 'ES' })

  // language: 'ja' is not in JIOSAAVN_LANGUAGES → routes to YouTube Music
  const japaneseHome: Section[] = await mkJP.getHome({ language: 'ja' })
  const koreanHome:   Section[] = await mkKR.getHome({ language: 'ko' })
  const spanishHome:  Section[] = await mkES.getHome({ language: 'es' })

  for (const section of japaneseHome.slice(0, 3)) {
    console.log(`[ja] ${section.title}: ${section.items.length} items`)
  }
}

// --- Default (no language) → JioSaavn generic browse ---
//
// Uses content.getBrowseModules — returns whatever JioSaavn considers the default feed.

async function defaultFeed() {
  const mk = new MusicKit()
  const home: Section[] = await mk.getHome()
  console.log('Default sections:', home.map(s => s.title))
}

// --- Summary of routing rules ---
//
// getHome({ language: 'hindi' })   → JioSaavn  (getTrending + getAlbums + getFeaturedPlaylists)
// getHome({ language: 'tamil' })   → JioSaavn
// getHome({ language: 'ja' })      → YouTube Music  (session hl=ja)
// getHome({ language: 'ko' })      → YouTube Music  (session hl=ko)
// getHome()                        → JioSaavn  (getBrowseModules, no language)
//
// getFeaturedPlaylists({ language: 'hindi' })  → JioSaavn curated playlists
// getFeaturedPlaylists({ language: 'ja' })     → [] (JioSaavn has no Japanese catalogue)

indianLanguages()
globalLanguages()
defaultFeed()
