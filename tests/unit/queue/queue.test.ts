import { describe, it, expect, beforeEach } from 'vitest'
import { Queue } from '../../../src/queue'
import { makeSong } from '../../helpers/mock-factory'

const s1 = makeSong({ videoId: 'a', title: 'Song A', artist: 'Artist 1' })
const s2 = makeSong({ videoId: 'b', title: 'Song B', artist: 'Artist 2' })
const s3 = makeSong({ videoId: 'c', title: 'Song C', artist: 'Artist 1' })
const s4 = makeSong({ videoId: 'd', title: 'Song D', artist: 'Artist 3' })

describe('Queue — basics', () => {
  let q: Queue

  beforeEach(() => { q = new Queue() })

  it('starts empty', () => {
    expect(q.current).toBeNull()
    expect(q.upcoming).toEqual([])
    expect(q.history).toEqual([])
    expect(q.isEmpty).toBe(true)
    expect(q.size).toBe(0)
  })

  it('add() appends to upcoming', () => {
    q.add(s1)
    q.add(s2)
    expect(q.upcoming).toEqual([s1, s2])
    expect(q.size).toBe(2)
    expect(q.isEmpty).toBe(false)
  })

  it('next() sets current and removes from upcoming', () => {
    q.add(s1)
    q.add(s2)
    const track = q.next()
    expect(track).toEqual(s1)
    expect(q.current).toEqual(s1)
    expect(q.upcoming).toEqual([s2])
  })

  it('next() pushes previous current to history', () => {
    q.add(s1)
    q.add(s2)
    q.next()
    q.next()
    expect(q.history).toEqual([s1])
    expect(q.current).toEqual(s2)
  })

  it('next() returns null when queue is empty', () => {
    expect(q.next()).toBeNull()
  })

  it('previous() restores last history track as current', () => {
    q.add(s1)
    q.add(s2)
    q.next()
    q.next()
    const track = q.previous()
    expect(track).toEqual(s1)
    expect(q.current).toEqual(s1)
  })

  it('previous() pushes current back onto front of upcoming', () => {
    q.add(s1)
    q.add(s2)
    q.next()
    q.next()
    q.previous()
    expect(q.upcoming[0]).toEqual(s2)
  })

  it('previous() returns null when history is empty', () => {
    q.add(s1)
    q.next()
    expect(q.previous()).toBeNull()
  })

  it('playNext() inserts at front of upcoming', () => {
    q.add(s1)
    q.add(s2)
    q.playNext(s3)
    expect(q.upcoming).toEqual([s3, s1, s2])
  })

  it('clear() empties upcoming but keeps current and history', () => {
    q.add(s1)
    q.add(s2)
    q.add(s3)
    q.next()
    q.clear()
    expect(q.upcoming).toEqual([])
    expect(q.current).toEqual(s1)
    expect(q.history).toEqual([])
  })

  it('remove() removes track at given index from upcoming', () => {
    q.add(s1)
    q.add(s2)
    q.add(s3)
    q.remove(1)
    expect(q.upcoming).toEqual([s1, s3])
  })
})

describe('Queue — repeat modes', () => {
  let q: Queue

  beforeEach(() => { q = new Queue() })

  it('repeat off: next() returns null when upcoming is empty', () => {
    q.add(s1)
    q.next()
    expect(q.next()).toBeNull()
  })

  it('repeat one: next() replays current track', () => {
    q.repeat = 'one'
    q.add(s1)
    q.add(s2)
    q.next()
    const again = q.next()
    expect(again).toEqual(s1)
    expect(q.upcoming).toEqual([s2])
  })

  it('repeat all: next() re-enqueues history when queue drains', () => {
    q.repeat = 'all'
    q.add(s1)
    q.add(s2)
    q.next()
    q.next()
    const wrapped = q.next()
    expect(wrapped).toEqual(s1)
    expect(q.history).toEqual([])
  })
})

describe('Queue — shuffle', () => {
  let q: Queue

  beforeEach(() => { q = new Queue() })

  it('shuffle() reorders upcoming tracks', () => {
    for (let i = 0; i < 20; i++) q.add(makeSong({ videoId: String(i) }))
    const before = q.upcoming.map(t => t.videoId)
    q.shuffle()
    const after = q.upcoming.map(t => t.videoId)
    expect(after).toHaveLength(before.length)
    expect(after.sort()).toEqual(before.sort())
  })

  it('shuffle() does not lose or duplicate tracks', () => {
    q.add(s1); q.add(s2); q.add(s3); q.add(s4)
    q.shuffle()
    const ids = q.upcoming.map(t => t.videoId).sort()
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('shuffle() does not affect current or history', () => {
    q.add(s1); q.add(s2); q.add(s3)
    q.next()
    q.shuffle()
    expect(q.current).toEqual(s1)
    expect(q.history).toEqual([])
  })
})
