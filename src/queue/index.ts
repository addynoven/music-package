import type { Song } from '../models'

export type RepeatMode = 'off' | 'one' | 'all'

export class Queue<T extends Song = Song> {
  private _current: T | null = null
  private _upcoming: T[] = []
  private _history: T[] = []

  repeat: RepeatMode = 'off'

  get current(): T | null { return this._current }
  get upcoming(): T[] { return [...this._upcoming] }
  get history(): T[] { return [...this._history] }
  get size(): number { return this._upcoming.length }
  get isEmpty(): boolean { return this._upcoming.length === 0 && this._current === null }

  add(track: T): void {
    this._upcoming.push(track)
  }

  playNext(track: T): void {
    this._upcoming.unshift(track)
  }

  next(): T | null {
    if (this.repeat === 'one' && this._current) {
      return this._current
    }

    if (this._upcoming.length === 0) {
      if (this.repeat === 'all' && (this._history.length > 0 || this._current)) {
        if (this._current) this._history.push(this._current)
        this._upcoming = [...this._history]
        this._history = []
        this._current = null
      } else {
        return null
      }
    }

    if (this._current) this._history.push(this._current)
    this._current = this._upcoming.shift()!
    return this._current
  }

  previous(): T | null {
    if (this._history.length === 0) return null
    if (this._current) this._upcoming.unshift(this._current)
    this._current = this._history.pop()!
    return this._current
  }

  clear(): void {
    this._upcoming = []
  }

  remove(index: number): void {
    this._upcoming.splice(index, 1)
  }

  shuffle(): void {
    for (let i = this._upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this._upcoming[i], this._upcoming[j]] = [this._upcoming[j], this._upcoming[i]]
    }
  }
}
