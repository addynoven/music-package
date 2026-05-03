/**
 * Generic in-flight deduplication utility.
 *
 * When the same key is requested multiple times while a factory promise is
 * still pending, all callers share the same promise — the factory is called
 * exactly once. The key is removed from the map when the promise settles
 * (resolve or reject), so a subsequent call will start a fresh factory run.
 */
export class InflightMap<K, V> {
  private inflight = new Map<K, Promise<V>>()

  get(key: K, factory: () => Promise<V>): Promise<V> {
    const existing = this.inflight.get(key)
    if (existing) return existing
    const promise = factory().finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  size(): number {
    return this.inflight.size
  }

  has(key: K): boolean {
    return this.inflight.has(key)
  }
}
