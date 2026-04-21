import { MusicKit } from '../dist/index.mjs'

console.log('=== Testing Japanese locale ===\n')

const mk = await MusicKit.create({ language: 'ja', location: 'JP' })

// 1. YouTube Music search in Japanese
console.log('--- YT Music search: "yoasobi" ---')
try {
  const songs = await mk.search('yoasobi', { filter: 'songs' })
  songs.slice(0, 3).forEach(s => console.log(` ${s.title} — ${s.artist}`))
} catch (e) { console.log(' ERROR:', e.message) }

// 2. YouTube Music home feed
console.log('\n--- YT Music getHome (session=JP/ja) ---')
try {
  const home = await mk.getHome()
  home.slice(0, 4).forEach(s => console.log(` [${s.title}] ${s.items.length} items`))
} catch (e) { console.log(' ERROR:', e.message) }

// 3. JioSaavn getHome with 'japanese' language (expect empty — no Japanese content)
console.log('\n--- JioSaavn getHome({ language: "japanese" }) ---')
try {
  const jioHome = await mk.getHome({ language: 'japanese' })
  if (jioHome.length === 0) {
    console.log(' (empty — JioSaavn has no Japanese catalogue)')
  } else {
    jioHome.slice(0, 3).forEach(s => console.log(` [${s.title}] ${s.items.length} items`))
  }
} catch (e) { console.log(' ERROR:', e.message) }

// 4. YT Music charts for JP
console.log('\n--- YT Music getCharts (JP session) ---')
try {
  const charts = await mk.getCharts()
  charts.slice(0, 3).forEach(s => console.log(` [${s.title}] ${s.items.length} items`))
} catch (e) { console.log(' ERROR:', e.message) }

// 5. Direct YouTube search for Japanese song
console.log('\n--- YT Music search: "ado" (popular JP artist) ---')
try {
  const songs = await mk.search('ado', { filter: 'songs' })
  songs.slice(0, 3).forEach(s => console.log(` ${s.title} — ${s.artist}`))
} catch (e) { console.log(' ERROR:', e.message) }

console.log('\nDone.')
