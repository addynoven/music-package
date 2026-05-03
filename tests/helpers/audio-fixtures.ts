/**
 * Audio fixture helpers for integration tests.
 *
 * PCM fixture files live at tests/fixtures/audio/<videoId>.f32le.pcm.
 * They are generated once by running:
 *   pnpm exec tsx playground/decode-audio-fixtures.ts
 *
 * Format: mono Float32 little-endian at 44 100 Hz (f32le).
 * Duration: first 30 seconds of each track.
 *
 * These IDs correspond to the 3 spec songs from the essentia analysis tests:
 *   -tJYN-eG1zk  Queen — We Will Rock You
 *   dQw4w9WgXcQ  Rick Astley — Never Gonna Give You Up
 *   kXYiU_JCYtU  Linkin Park — Numb
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AudioFetcher } from '../../src/analysis/decode'

const AUDIO_FIXTURES_DIR = join(__dirname, '../fixtures/audio')

// ─── Known fixture video IDs ──────────────────────────────────────────────────

const FIXTURE_IDS = [
  '-tJYN-eG1zk',
  'dQw4w9WgXcQ',
  'kXYiU_JCYtU',
] as const

export type FixtureVideoId = typeof FIXTURE_IDS[number]

// ─── audioFixtures — low-level accessor ──────────────────────────────────────

/**
 * Loads a pre-decoded f32le PCM fixture file from disk.
 * Throws if the file doesn't exist — run decode-audio-fixtures.ts first.
 */
function loadFixturePCM(videoId: string): Uint8Array {
  const path = join(AUDIO_FIXTURES_DIR, `${videoId}.f32le.pcm`)
  if (!existsSync(path)) {
    throw new Error(
      `Audio fixture missing for videoId="${videoId}". ` +
      `Generate it by running: pnpm exec tsx playground/decode-audio-fixtures.ts\n` +
      `Expected file: ${path}`,
    )
  }
  return new Uint8Array(readFileSync(path).buffer)
}

export const audioFixtures = {
  /**
   * Returns the raw f32le PCM bytes for a known fixture videoId.
   * Throws a descriptive error if the fixture file is absent.
   */
  forVideoId(videoId: string): Uint8Array {
    return loadFixturePCM(videoId)
  },

  /**
   * Returns true if all 3 spec fixture files exist on disk.
   * Use this in test beforeAll to gate early with a helpful message.
   */
  allExist(): boolean {
    return FIXTURE_IDS.every(id => existsSync(join(AUDIO_FIXTURES_DIR, `${id}.f32le.pcm`)))
  },

  /**
   * Lists which fixture files are missing. Empty array = all present.
   */
  missing(): string[] {
    return FIXTURE_IDS.filter(
      id => !existsSync(join(AUDIO_FIXTURES_DIR, `${id}.f32le.pcm`)),
    )
  },
} as const

// ─── createFixtureAudioFetcher — AudioFetcher backed by PCM files ─────────────

/**
 * Creates an AudioFetcher implementation that reads pre-decoded PCM files
 * from tests/fixtures/audio/ instead of downloading from the network.
 *
 * Decoding approach: PCM files are already stored as mono f32le at 44 100 Hz,
 * so this fetcher just reads the bytes and wraps them into a Float32Array.
 * No ffmpeg or opus decoder is required at test time.
 *
 * Each fixture is ~5.3 MB (30s × 44100 × 4 bytes). Loading from disk takes
 * ~10–30ms per file, making the 3-song test suite run in <5s total.
 *
 * @throws if any fixture file is missing — run decode-audio-fixtures.ts first.
 */
export function createFixtureAudioFetcher(): AudioFetcher {
  return {
    async fetchPCM(videoId: string) {
      const bytes = audioFixtures.forVideoId(videoId)

      // The fixture bytes ARE the f32le PCM samples — wrap them directly.
      // byteLength / 4 = number of Float32 samples (4 bytes per f32).
      const nSamples = bytes.byteLength / 4
      const samples = new Float32Array(nSamples)
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      for (let i = 0; i < nSamples; i++) {
        samples[i] = dv.getFloat32(i * 4, /* littleEndian= */ true)
      }

      return {
        samples,
        sampleRate: 44_100,
        channels: 1,
      }
    },
  }
}
