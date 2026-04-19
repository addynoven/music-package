/**
 * Production smoke test — downloads "Dancin (Krono Remix)" via the real SDK.
 * Run: pnpm play
 */

import { MusicKit } from '../src/musickit'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'downloads')

async function main() {
  const mk = await MusicKit.create({ logLevel: 'info' })

  // ── 1. Search ─────────────────────────────────────────────────────────────
  console.log('\n[1/4] Searching for "Dancin Krono Remix"...')
  const results = await mk.search('Dancin Krono Remix Luvli', { filter: 'songs' }) as any[]

  if (!results.length) {
    console.error('No results found.')
    process.exit(1)
  }

  const song = results[0]
  console.log(`     Found: "${song.title}" by ${song.artist} [${song.videoId}]`)

  // ── 2. Resolve stream ─────────────────────────────────────────────────────
  console.log('\n[2/4] Resolving stream URL...')
  const stream = await mk.getStream(song.videoId, { quality: 'high' })
  console.log(`     Codec: ${stream.codec} | Bitrate: ${Math.round(stream.bitrate / 1000)} kbps`)
  console.log(`     URL expires at: ${new Date(stream.expiresAt * 1000).toISOString()}`)

  // ── 3. Download ───────────────────────────────────────────────────────────
  console.log('\n[3/4] Downloading...')

  if (!existsSync(OUT_DIR)) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(OUT_DIR, { recursive: true })
  }

  let lastPct = 0
  await mk.download(song.videoId, {
    path: OUT_DIR,
    format: 'opus',
    onProgress: (pct) => {
      if (pct - lastPct >= 10) {
        process.stdout.write(`\r     Progress: ${pct}%`)
        lastPct = pct
      }
    },
  })
  console.log('\r     Progress: 100% ✓')

  // ── 4. Verify file exists ─────────────────────────────────────────────────
  console.log('\n[4/4] Verifying output...')
  const { readdirSync } = await import('node:fs')
  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.opus'))

  if (files.length === 0) {
    console.error('No .opus file found in output directory.')
    process.exit(1)
  }

  const { statSync } = await import('node:fs')
  const file = files[files.length - 1]
  const { size } = statSync(join(OUT_DIR, file))
  console.log(`     File: ${file}`)
  console.log(`     Size: ${(size / 1024).toFixed(1)} KB`)

  if (size < 10_000) {
    console.error('File is suspiciously small — download may have failed.')
    process.exit(1)
  }

  console.log('\n✓ Download complete.\n')
}

main().catch(err => {
  console.error('\n✗ Failed:', err.message)
  process.exit(1)
})
