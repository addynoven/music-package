import type { StreamingData } from '../models'

const EXPIRY_BUFFER_SECONDS = 300 // treat stream as expired 5 min before actual expiry

/**
 * Returns true if the stream URL has expired or will expire within 5 minutes.
 */
export function isStreamExpired(stream: StreamingData): boolean {
  return Math.floor(Date.now() / 1000) > stream.expiresAt - EXPIRY_BUFFER_SECONDS
}
