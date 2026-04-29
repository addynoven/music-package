import { describe, it, expect } from 'vitest'
import { version } from '../../src'
import pkg from '../../package.json'

describe('version export', () => {
  it('is a non-empty string', () => {
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })

  it('matches package.json version', () => {
    expect(version).toBe(pkg.version)
  })

  it('follows semver format (x.y.z)', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
