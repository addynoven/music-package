import { describe, it, expect, beforeEach } from 'vitest'
import { LyricsRegistry } from '../../../src/lyrics/registry'
import { ValidationError } from '../../../src/errors'
import type { LyricsProvider, LyricsProviderName } from '../../../src/lyrics/provider'

const stub = (name: LyricsProviderName): LyricsProvider => ({ name, fetch: async () => null })

describe('LyricsRegistry', () => {
  let reg: LyricsRegistry

  beforeEach(() => {
    reg = new LyricsRegistry()
  })

  // ── Construction ────────────────────────────────────────────────────────────

  it('constructs empty when no initial providers given', () => {
    expect(reg.list()).toEqual([])
    expect(reg.names()).toEqual([])
  })

  it('constructs with initial providers in order', () => {
    const a = stub('lrclib')
    const b = stub('kugou')
    const r = new LyricsRegistry([a, b])
    expect(r.list()).toEqual([a, b])
    expect(r.names()).toEqual(['lrclib', 'kugou'])
  })

  it('list() returns a defensive copy — mutating it does not affect the registry', () => {
    reg.register(stub('lrclib'))
    const snapshot = reg.list()
    snapshot.push(stub('kugou'))
    expect(reg.list()).toHaveLength(1)
  })

  // ── register — position: 'last' (default) ───────────────────────────────────

  it('register defaults to last position', () => {
    reg.register(stub('lrclib'))
    reg.register(stub('kugou'))
    expect(reg.names()).toEqual(['lrclib', 'kugou'])
  })

  it('register with position "last" appends', () => {
    reg.register(stub('lrclib'), 'last')
    reg.register(stub('kugou'), 'last')
    expect(reg.names()).toEqual(['lrclib', 'kugou'])
  })

  // ── register — position: 'first' ────────────────────────────────────────────

  it('register with position "first" prepends', () => {
    reg.register(stub('lrclib'))
    reg.register(stub('kugou'), 'first')
    expect(reg.names()).toEqual(['kugou', 'lrclib'])
  })

  it('register "first" on empty registry still works', () => {
    reg.register(stub('better-lyrics'), 'first')
    expect(reg.names()).toEqual(['better-lyrics'])
  })

  // ── register — position: 'before:<name>' ────────────────────────────────────

  it('register "before:<name>" inserts at the correct index', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('kugou'))
    reg.register(stub('lrclib'), 'before:kugou')
    expect(reg.names()).toEqual(['better-lyrics', 'lrclib', 'kugou'])
  })

  it('register "before:<name>" at the front', () => {
    reg.register(stub('kugou'))
    reg.register(stub('lrclib'), 'before:kugou')
    expect(reg.names()).toEqual(['lrclib', 'kugou'])
  })

  it('register "before:<name>" throws ValidationError when target is not registered', () => {
    expect(() => reg.register(stub('simpmusic'), 'before:lrclib')).toThrow(ValidationError)
  })

  // ── register — position: 'after:<name>' ─────────────────────────────────────

  it('register "after:<name>" inserts at the correct index', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('kugou'))
    reg.register(stub('lrclib'), 'after:better-lyrics')
    expect(reg.names()).toEqual(['better-lyrics', 'lrclib', 'kugou'])
  })

  it('register "after:<name>" at the end', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('lrclib'), 'after:better-lyrics')
    expect(reg.names()).toEqual(['better-lyrics', 'lrclib'])
  })

  it('register "after:<name>" throws ValidationError when target is not registered', () => {
    expect(() => reg.register(stub('simpmusic'), 'after:lrclib')).toThrow(ValidationError)
  })

  // ── Re-registration (replace semantics) ─────────────────────────────────────

  it('re-registering a same-name provider removes the old entry first', () => {
    const original = stub('lrclib')
    const replacement = stub('lrclib')
    reg.register(stub('better-lyrics'))
    reg.register(original)
    reg.register(stub('kugou'))
    reg.register(replacement) // default 'last'
    expect(reg.names()).toEqual(['better-lyrics', 'kugou', 'lrclib'])
    expect(reg.get('lrclib')).toBe(replacement)
  })

  it('re-registering keeps no duplicates', () => {
    reg.register(stub('lrclib'))
    reg.register(stub('lrclib'))
    reg.register(stub('lrclib'))
    expect(reg.names()).toEqual(['lrclib'])
  })

  it('re-registering with "first" moves provider to front', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('lrclib'))
    reg.register(stub('kugou'))
    reg.register(stub('lrclib'), 'first')
    expect(reg.names()).toEqual(['lrclib', 'better-lyrics', 'kugou'])
  })

  // ── unregister ───────────────────────────────────────────────────────────────

  it('unregister removes a provider and returns true', () => {
    reg.register(stub('lrclib'))
    expect(reg.unregister('lrclib')).toBe(true)
    expect(reg.names()).toEqual([])
  })

  it('unregister returns false when provider was not registered', () => {
    expect(reg.unregister('lrclib')).toBe(false)
  })

  it('unregister removes the correct provider from the middle', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('lrclib'))
    reg.register(stub('kugou'))
    reg.unregister('lrclib')
    expect(reg.names()).toEqual(['better-lyrics', 'kugou'])
  })

  // ── get ──────────────────────────────────────────────────────────────────────

  it('get returns the correct provider by name', () => {
    const p = stub('lrclib')
    reg.register(p)
    expect(reg.get('lrclib')).toBe(p)
  })

  it('get returns undefined for an unregistered name', () => {
    expect(reg.get('lrclib')).toBeUndefined()
  })

  // ── names() ──────────────────────────────────────────────────────────────────

  it('names() matches list().map(p => p.name)', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('lrclib'))
    reg.register(stub('kugou'))
    expect(reg.names()).toEqual(reg.list().map(p => p.name))
  })

  // ── replace ──────────────────────────────────────────────────────────────────

  it('replace rebuilds the chain from provider instances', () => {
    reg.register(stub('better-lyrics'))
    const a = stub('lrclib')
    const b = stub('kugou')
    reg.replace([a, b], new Map())
    expect(reg.list()).toEqual([a, b])
  })

  it('replace resolves name strings via the builtins map', () => {
    const lrclib = stub('lrclib')
    const kugou = stub('kugou')
    const builtins = new Map<LyricsProviderName, LyricsProvider>([
      ['lrclib', lrclib],
      ['kugou', kugou],
    ])
    reg.replace(['lrclib', 'kugou'], builtins)
    expect(reg.list()).toEqual([lrclib, kugou])
  })

  it('replace handles a mix of name strings and provider instances', () => {
    const lrclib = stub('lrclib')
    const simpmusic = stub('simpmusic')
    const builtins = new Map<LyricsProviderName, LyricsProvider>([['lrclib', lrclib]])
    reg.replace(['lrclib', simpmusic], builtins)
    expect(reg.list()).toEqual([lrclib, simpmusic])
  })

  it('replace with an unknown name string throws ValidationError', () => {
    const builtins = new Map<LyricsProviderName, LyricsProvider>()
    expect(() => reg.replace(['lrclib'], builtins)).toThrow(ValidationError)
  })

  it('replace with unknown name includes the bad name in the error message', () => {
    const builtins = new Map<LyricsProviderName, LyricsProvider>()
    expect(() => reg.replace(['simpmusic'], builtins)).toThrow(/simpmusic/)
  })

  it('replace on a populated registry discards all previous providers', () => {
    reg.register(stub('better-lyrics'))
    reg.register(stub('lyrics-ovh'))
    const lrclib = stub('lrclib')
    const builtins = new Map<LyricsProviderName, LyricsProvider>([['lrclib', lrclib]])
    reg.replace(['lrclib'], builtins)
    expect(reg.names()).toEqual(['lrclib'])
  })
})
