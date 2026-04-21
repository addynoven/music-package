/**
 * Autocomplete — query suggestions as the user types.
 *
 * Returns up to ~10 string suggestions for a partial query.
 * Ideal for search-as-you-type inputs or CLI tab completion.
 *
 * Rate limit: 30 req/min (default) — safe for fast typists with 300ms debounce.
 */

import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // --- Basic usage ---

  const suggestions = await mk.autocomplete('tum hi')
  console.log(suggestions)
  // → ['tum hi ho', 'tum hi ho arijit singh', 'tum hi ho karaoke', ...]

  // --- Simulated keystroke-by-keystroke ---

  const keystrokes = ['q', 'qu', 'que', 'quee', 'queen']

  for (const partial of keystrokes) {
    const results = await mk.autocomplete(partial)
    console.log(`"${partial}" → ${results.slice(0, 3).join(' | ')}`)
  }

  // --- Autocomplete → search ---

  const [firstSuggestion] = await mk.autocomplete('arijit')
  if (firstSuggestion) {
    const songs = await mk.search(firstSuggestion, { filter: 'songs' })
    console.log(`Searched "${firstSuggestion}": ${songs.length} results`)
    console.log(`Top result: ${songs[0].title} — ${songs[0].artist}`)
  }
}

// --- Server endpoint (Express / Hono / Fastify) ---
//
// app.get('/autocomplete', async (req, res) => {
//   const q = String(req.query.q ?? '').trim()
//   if (q.length < 2) return res.json([])
//   const suggestions = await mk.autocomplete(q)
//   res.json(suggestions)
// })
//
// GET /autocomplete?q=tum+hi
// → ["tum hi ho", "tum hi ho arijit singh", ...]

// --- Debounced UI (React) ---
//
// useEffect(() => {
//   if (query.length < 2) return
//   const timeout = setTimeout(async () => {
//     const results = await mk.autocomplete(query)
//     setSuggestions(results)
//   }, 300)
//   return () => clearTimeout(timeout)
// }, [query])

main()
