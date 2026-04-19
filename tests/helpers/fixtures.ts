/**
 * Fixture loader — reads pre-recorded JSON responses from tests/fixtures/responses/.
 * Used in integration tests. Unit tests use mock-factory.ts instead.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURES_DIR = join(__dirname, '../fixtures/responses')

function load<T>(name: string): T {
  const filePath = join(FIXTURES_DIR, `${name}.json`)
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

export const fixtures = {
  search: () => load('search-results'),
  autocomplete: () => load('autocomplete'),
  stream: () => load('stream-data'),
  home: () => load('home-feed'),
  artist: () => load('artist-page'),
  album: () => load('album-page'),
  radio: () => load('radio'),
  charts: () => load('charts'),
} as const
