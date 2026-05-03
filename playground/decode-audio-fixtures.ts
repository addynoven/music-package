/**
 * decode-audio-fixtures.ts — one-time script to generate PCM fixture files.
 *
 * Downloads 30s clips of 3 spec videoIds via yt-dlp, decodes them to mono
 * Float32 PCM at 44 100 Hz (f32le), and writes the raw bytes to
 * tests/fixtures/audio/<videoId>.f32le.pcm.
 *
 * These files are consumed by createFixtureAudioFetcher() in
 * tests/helpers/audio-fixtures.ts, enabling the integration test to run in
 * <5s without any network calls.
 *
 * Run once: cd sdk && pnpm exec tsx playground/decode-audio-fixtures.ts
 *
 * Decision: pre-decoded PCM rather than opus files because:
 *   1. No extra decode step in the test itself (fast <5s target).
 *   2. No opus decoder dependency needed in the test process.
 *   3. The PCM files are directly consumable as Uint8Array by EssentiaAnalysisProvider.analyze().
 *
 * File size: 30s × 44100 × 4 bytes ≈ 5.3 MB per song (acceptable for test fixtures).
 */

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURES_DIR = join(__dirname, '../tests/fixtures/audio')
const SAMPLE_RATE = 44_100
const CLIP_DURATION_SEC = 30

const SPEC_IDS = [
  { videoId: '-tJYN-eG1zk', label: 'Queen — We Will Rock You' },
  { videoId: 'dQw4w9WgXcQ', label: 'Rick Astley — Never Gonna Give You Up' },
  { videoId: 'kXYiU_JCYtU', label: 'Linkin Park — Numb' },
]

async function downloadAndDecode(videoId: string, label: string): Promise<Buffer> {
  console.log(`\n[${videoId}] ${label}`)
  console.log(`  Fetching ${CLIP_DURATION_SEC}s clip via yt-dlp + ffmpeg...`)

  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--no-playlist',
      '-f', 'bestaudio',
      '-o', '-',
      '--quiet',
      `https://music.youtube.com/watch?v=${videoId}`,
    ])

    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-ac', '1',                        // mono
      '-ar', String(SAMPLE_RATE),        // 44 100 Hz
      '-t', String(CLIP_DURATION_SEC),   // first 30 seconds only
      '-f', 'f32le',                     // Float32 little-endian
      'pipe:1',
    ])

    ytdlp.stderr.resume()
    ffmpeg.stderr.resume()

    ytdlp.stdout.pipe(ffmpeg.stdin)

    ytdlp.on('close', () => { ffmpeg.stdin.end() })
    ytdlp.on('error', (e: Error) => reject(new Error(`yt-dlp: ${e.message}`)))
    ffmpeg.on('error', (e: Error) => reject(new Error(`ffmpeg: ${e.message}`)))
    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}`))
    })

    const chunks: Buffer[] = []
    ffmpeg.stdout.on('data', (c: Buffer) => chunks.push(c))
    ffmpeg.stdout.on('end', () => {
      const buf = Buffer.concat(chunks)
      const nSamples = buf.byteLength / 4
      const durationSec = nSamples / SAMPLE_RATE
      console.log(`  Decoded: ${nSamples.toLocaleString()} samples, ${durationSec.toFixed(1)}s, ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`)
      resolve(buf)
    })
  })
}

async function main() {
  console.log('decode-audio-fixtures — generating PCM fixture files')
  console.log(`Output directory: ${FIXTURES_DIR}\n`)

  mkdirSync(FIXTURES_DIR, { recursive: true })

  for (const { videoId, label } of SPEC_IDS) {
    try {
      const buf = await downloadAndDecode(videoId, label)
      const outPath = join(FIXTURES_DIR, `${videoId}.f32le.pcm`)
      writeFileSync(outPath, buf)
      console.log(`  Saved: ${outPath}`)
    } catch (err) {
      console.error(`  ERROR for ${videoId}: ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  }

  console.log('\nAll fixtures generated. Run the integration test with:')
  console.log('  RUN_INTEGRATION=1 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/essentia-provider.test.ts')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
