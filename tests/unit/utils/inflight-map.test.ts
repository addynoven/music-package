import { describe, it, expect, vi } from 'vitest'
import { InflightMap } from '../../../src/utils/inflight-map'

describe('InflightMap — in-flight dedup utility', () => {
  // ─── basic state ──────────────────────────────────────────────────────────

  it('starts empty', () => {
    const m = new InflightMap<string, string>()
    expect(m.size()).toBe(0)
    expect(m.has('anything')).toBe(false)
  })

  it('has() returns true while a promise is in flight', async () => {
    const m = new InflightMap<string, number>()
    let resolve!: (v: number) => void
    const pending = new Promise<number>((r) => { resolve = r })

    const resultPromise = m.get('key', () => pending)
    expect(m.has('key')).toBe(true)
    expect(m.size()).toBe(1)

    resolve(42)
    await resultPromise
    expect(m.has('key')).toBe(false)
    expect(m.size()).toBe(0)
  })

  // ─── dedup behaviour ──────────────────────────────────────────────────────

  it('calls factory once when the same key is requested twice in parallel', async () => {
    const m = new InflightMap<string, string>()
    const factory = vi.fn().mockResolvedValue('result')

    const [r1, r2] = await Promise.all([
      m.get('key', factory),
      m.get('key', factory),
    ])

    expect(factory).toHaveBeenCalledTimes(1)
    expect(r1).toBe('result')
    expect(r2).toBe('result')
  })

  it('calls factory for each unique key in parallel', async () => {
    const m = new InflightMap<string, string>()
    const factoryA = vi.fn().mockResolvedValue('a')
    const factoryB = vi.fn().mockResolvedValue('b')

    const [ra, rb] = await Promise.all([
      m.get('keyA', factoryA),
      m.get('keyB', factoryB),
    ])

    expect(factoryA).toHaveBeenCalledTimes(1)
    expect(factoryB).toHaveBeenCalledTimes(1)
    expect(ra).toBe('a')
    expect(rb).toBe('b')
  })

  // ─── key cleanup ──────────────────────────────────────────────────────────

  it('removes key from map after factory resolves', async () => {
    const m = new InflightMap<string, number>()
    await m.get('k', () => Promise.resolve(1))
    expect(m.has('k')).toBe(false)
    expect(m.size()).toBe(0)
  })

  it('removes key from map after factory rejects', async () => {
    const m = new InflightMap<string, number>()
    const err = new Error('bang')
    await expect(m.get('k', () => Promise.reject(err))).rejects.toThrow('bang')
    expect(m.has('k')).toBe(false)
    expect(m.size()).toBe(0)
  })

  it('allows a new factory call after a prior rejection', async () => {
    const m = new InflightMap<string, number>()
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce(99)

    await expect(m.get('k', factory)).rejects.toThrow('first fail')
    const result = await m.get('k', factory)
    expect(result).toBe(99)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  // ─── size() ───────────────────────────────────────────────────────────────

  it('size() tracks the number of in-flight keys', async () => {
    const m = new InflightMap<string, string>()
    let resolveA!: (v: string) => void
    let resolveB!: (v: string) => void
    const pa = new Promise<string>((r) => { resolveA = r })
    const pb = new Promise<string>((r) => { resolveB = r })

    const p1 = m.get('a', () => pa)
    const p2 = m.get('b', () => pb)

    expect(m.size()).toBe(2)

    resolveA('x')
    await p1
    expect(m.size()).toBe(1)

    resolveB('y')
    await p2
    expect(m.size()).toBe(0)
  })
})
