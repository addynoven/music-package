/**
 * Search Quality Audit
 *
 * Runs 25+ diverse queries against YouTube Music and JioSaavn, then prints
 * a side-by-side quality report so you can visually judge result accuracy.
 *
 * Usage:
 *   pnpm tsx playground/search-quality-audit.ts
 *   pnpm tsx playground/search-quality-audit.ts --source=youtube
 *   pnpm tsx playground/search-quality-audit.ts --source=jiosaavn
 */

import { MusicKit } from '../src/musickit'
import type { Song, SourceName } from '../src/models'

// ─── Config ──────────────────────────────────────────────────────────────────

const SOURCE_ARG = (process.argv.find(a => a.startsWith('--source='))?.split('=')[1] ?? 'both') as 'youtube' | 'jiosaavn' | 'both'
const TOP_N = 3  // how many results to show per query

// ─── Test cases ──────────────────────────────────────────────────────────────

type Case = {
  label: string
  query: string
  expect?: string  // rough hint — what the #1 result should contain
}

const CASES: Case[] = [
  // ── Exact song + artist ────────────────────────────────────────────────────
  { label: 'Exact: global pop hit',         query: 'Blinding Lights The Weeknd',          expect: 'Blinding Lights' },
  { label: 'Exact: classic rock anthem',    query: 'Bohemian Rhapsody Queen',              expect: 'Bohemian Rhapsody' },
  { label: 'Exact: recent pop',             query: 'Shape of You Ed Sheeran',              expect: 'Shape of You' },
  { label: 'Exact: Latin crossover',        query: 'Despacito Luis Fonsi',                 expect: 'Despacito' },
  { label: 'Exact: hip-hop classic',        query: 'Lose Yourself Eminem',                 expect: 'Lose Yourself' },
  { label: 'Exact: modern trap hit',        query: "God's Plan Drake",                     expect: "God's Plan" },
  { label: 'Exact: indie anthem',           query: 'Bad Guy Billie Eilish',                expect: 'bad guy' },
  { label: 'Exact: 2022 global smash',      query: 'As It Was Harry Styles',               expect: 'As It Was' },
  { label: 'Exact: hip-hop introspective',  query: 'HUMBLE Kendrick Lamar',               expect: 'HUMBLE' },
  { label: 'Exact: collab hit',             query: 'Stay Kid Laroi Justin Bieber',         expect: 'Stay' },

  // ── Bollywood / South Asian ────────────────────────────────────────────────
  { label: 'Bollywood: iconic ballad',      query: 'Tum Hi Ho Arijit Singh',               expect: 'Tum Hi Ho' },
  { label: 'Bollywood: cult classic',       query: 'Kal Ho Na Ho Sonu Nigam',              expect: 'Kal Ho Na Ho' },
  { label: 'Bollywood: dance number',       query: 'Dilbar Dilbar Neha Kakkar',            expect: 'Dilbar' },
  { label: 'Bollywood: AR Rahman',          query: 'Chaiyya Chaiyya AR Rahman',            expect: 'Chaiyya' },
  { label: 'Bollywood: romantic 2023',      query: 'Kesariya Arijit Singh Brahmastra',     expect: 'Kesariya' },

  // ── Classic rock / oldies ──────────────────────────────────────────────────
  { label: 'Classic: Led Zeppelin epic',    query: 'Stairway to Heaven Led Zeppelin',      expect: 'Stairway to Heaven' },
  { label: 'Classic: Eagles',               query: 'Hotel California Eagles',              expect: 'Hotel California' },
  { label: 'Classic: Nirvana grunge',       query: 'Smells Like Teen Spirit Nirvana',      expect: 'Smells Like Teen Spirit' },
  { label: 'Classic: Michael Jackson',      query: 'Thriller Michael Jackson',             expect: 'Thriller' },

  // ── Anime / niche ──────────────────────────────────────────────────────────
  { label: 'Anime OST (many covers)',       query: 'Zenzenzense RADWIMPS',                 expect: 'Zenzenzense' },
  { label: 'Anime: Demon Slayer',           query: 'Gurenge LiSA Demon Slayer',            expect: 'Gurenge' },

  // ── Ambiguous / disambiguation ─────────────────────────────────────────────
  { label: 'Disambiguation: Linkin Park',   query: 'Numb Linkin Park',                     expect: 'Numb' },
  { label: 'Disambiguation: Coldplay',      query: 'The Scientist Coldplay',               expect: 'The Scientist' },
  { label: 'Disambiguation: OneRepublic',   query: 'Counting Stars OneRepublic',           expect: 'Counting Stars' },

  // ── Genre / mood (broad) ───────────────────────────────────────────────────
  { label: 'Genre: lo-fi study mood',       query: 'lo-fi hip hop study beats',            expect: undefined },
  { label: 'Genre: 90s pop nostalgia',      query: '90s pop hits playlist',                expect: undefined },
]

// ─── Formatting helpers ───────────────────────────────────────────────────────

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const CYAN   = '\x1b[36m'
const BLUE   = '\x1b[34m'

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function qualityBadge(songs: Song[], expected?: string): string {
  if (!expected || songs.length === 0) return `${DIM}—${RESET}`
  const top = songs[0]
  const haystack = `${top.title} ${top.artist}`.toLowerCase()
  const needle = expected.toLowerCase()
  if (haystack.includes(needle)) return `${GREEN}✓ hit${RESET}`
  // check if it's in top 3
  const inTop3 = songs.slice(0, 3).some(s =>
    `${s.title} ${s.artist}`.toLowerCase().includes(needle)
  )
  if (inTop3) return `${YELLOW}~ top3${RESET}`
  return `${RED}✗ miss${RESET}`
}

function printResults(label: string, query: string, songs: Song[], expected?: string, source?: string): void {
  const badge = qualityBadge(songs, expected)
  const srcTag = source ? `${DIM}[${source}]${RESET} ` : ''
  console.log(`\n${BOLD}${srcTag}${label}${RESET}  ${badge}`)
  console.log(`${DIM}  query: "${query}"${RESET}`)
  if (songs.length === 0) {
    console.log(`  ${RED}No results${RESET}`)
    return
  }
  songs.slice(0, TOP_N).forEach((s, i) => {
    const marker = i === 0 ? `${CYAN}▶${RESET}` : ` ${DIM}${i + 1}${RESET}`
    const id = s.videoId.startsWith('jio:')
      ? `${BLUE}${truncate(s.videoId, 20)}${RESET}`
      : `${DIM}${truncate(s.videoId, 11)}${RESET}`
    console.log(
      `  ${marker} ${truncate(s.title, 40).padEnd(40)} ${DIM}${truncate(s.artist, 22).padEnd(22)}${RESET}  ${fmtDuration(s.duration)}  ${id}`
    )
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runSource(mk: MusicKit, source: SourceName, cases: Case[]): Promise<{ hits: number; near: number; miss: number; errors: number }> {
  let hits = 0, near = 0, miss = 0, errors = 0

  for (const c of cases) {
    try {
      const results = await mk.search(c.query, { filter: 'songs', source }) as Song[]
      printResults(c.label, c.query, results, c.expect, source)

      if (c.expect) {
        const badge = qualityBadge(results, c.expect)
        if (badge.includes('✓')) hits++
        else if (badge.includes('~')) near++
        else if (badge.includes('✗')) miss++
      }
    } catch (err: any) {
      errors++
      console.log(`\n${RED}ERROR${RESET} [${source}] ${c.label}: ${err.message}`)
    }
    // small gap to avoid hammering APIs
    await new Promise(r => setTimeout(r, 300))
  }

  return { hits, near, miss, errors }
}

async function main() {
  console.log(`\n${BOLD}╔══════════════════════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}║        MusicKit — Search Quality Audit               ║${RESET}`)
  console.log(`${BOLD}╚══════════════════════════════════════════════════════╝${RESET}`)
  console.log(`${DIM}  Source: ${SOURCE_ARG}  |  Cases: ${CASES.length}  |  Top-N: ${TOP_N}${RESET}\n`)

  const mk = await MusicKit.create({ cache: { enabled: false } })

  const sources: SourceName[] = SOURCE_ARG === 'both' ? ['youtube', 'jiosaavn'] : [SOURCE_ARG]
  const scoreboard: Record<string, { hits: number; near: number; miss: number; errors: number }> = {}

  for (const src of sources) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`${BOLD}  Source: ${src.toUpperCase()}${RESET}`)
    console.log(`${'─'.repeat(60)}`)
    scoreboard[src] = await runSource(mk, src, CASES)
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n\n${BOLD}╔══════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}║              SCOREBOARD              ║${RESET}`)
  console.log(`${BOLD}╚══════════════════════════════════════╝${RESET}`)

  const measurable = CASES.filter(c => c.expect).length
  for (const [src, s] of Object.entries(scoreboard)) {
    const total = s.hits + s.near + s.miss
    const pct = total > 0 ? Math.round((s.hits / total) * 100) : 0
    console.log(`\n  ${BOLD}${src}${RESET}`)
    console.log(`    ${GREEN}✓ top-1 hits  ${s.hits}/${measurable}  (${pct}%)${RESET}`)
    console.log(`    ${YELLOW}~ top-3 only  ${s.near}${RESET}`)
    console.log(`    ${RED}✗ miss        ${s.miss}${RESET}`)
    if (s.errors > 0) console.log(`    ${RED}⚠ errors      ${s.errors}${RESET}`)
  }
  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
