/**
 * Shared env loader for playground scripts.
 *
 * Run scripts with Node's native --env-file flag:
 *   pnpm exec tsx --env-file=.env playground/<script>.ts
 *
 * Then call configFromEnv() instead of duplicating env wiring per script.
 */

import type { MusicKitConfig } from '../src/models'

export interface PlaygroundConfig extends MusicKitConfig {}

export function configFromEnv(overrides: PlaygroundConfig = {}): PlaygroundConfig {
  const cfg: PlaygroundConfig = {
    cache: { enabled: false }, // playground default — always exercise live code paths
    ...overrides,
  }

  if (process.env.YT_API_KEY) cfg.youtubeApiKey = process.env.YT_API_KEY
  if (process.env.COOKIES_PATH) cfg.cookiesPath = process.env.COOKIES_PATH
  if (process.env.YT_LANGUAGE) cfg.language = process.env.YT_LANGUAGE
  if (process.env.YT_LOCATION) cfg.location = process.env.YT_LOCATION
  if (process.env.LOG_LEVEL) cfg.logLevel = process.env.LOG_LEVEL as any
  if (process.env.PROXY) cfg.proxy = process.env.PROXY
  if (process.env.USER_AGENT) cfg.userAgent = process.env.USER_AGENT
  if (process.env.VISITOR_ID) cfg.visitorId = process.env.VISITOR_ID
  if (process.env.ACOUSTID_API_KEY) {
    cfg.identify = {
      acoustidApiKey: process.env.ACOUSTID_API_KEY,
      ...(process.env.SONGREC_BIN ? { songrecBin: process.env.SONGREC_BIN } : {}),
    }
  }

  return cfg
}

export function summarizeEnv(): string {
  const flags: string[] = []
  flags.push(process.env.YT_API_KEY ? 'YT_API_KEY ✓' : 'YT_API_KEY ✗ (using InnerTube)')
  flags.push(process.env.COOKIES_PATH ? 'COOKIES_PATH ✓' : 'COOKIES_PATH ✗')
  flags.push(process.env.ACOUSTID_API_KEY ? 'ACOUSTID ✓' : 'ACOUSTID ✗')
  if (process.env.YT_LANGUAGE || process.env.YT_LOCATION) {
    flags.push(`locale=${process.env.YT_LANGUAGE ?? '?'}/${process.env.YT_LOCATION ?? '?'}`)
  }
  return flags.join('  ')
}
