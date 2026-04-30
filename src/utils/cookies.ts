import { readFileSync, existsSync } from 'node:fs'

/**
 * Reads a Netscape-format cookies.txt and returns a serialized
 * "name=value; name=value; …" cookie header string.
 * Returns empty string if the file does not exist or cannot be parsed.
 * Cookie values are never logged.
 */
export function readCookieHeader(path: string): string {
  if (!existsSync(path)) return ''
  try {
    const lines = readFileSync(path, 'utf8').split('\n')
    const pairs: string[] = []
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const fields = line.split('\t')
      // Netscape format: domain, flag, path, secure, expiry, name, value (7 fields)
      if (fields.length < 7) continue
      const name = fields[5]
      const value = fields[6]
      if (name) pairs.push(`${name}=${value}`)
    }
    return pairs.join('; ')
  } catch {
    return ''
  }
}
