type EventMap = {
  beforeRequest: [req: { method: string; endpoint: string; headers: Record<string, string>; body: unknown }]
  afterRequest: [req: { method: string; endpoint: string; headers: Record<string, string>; body: unknown }, durationMs: number, status: number]
  cacheHit: [key: string, ttlRemaining: number]
  cacheMiss: [key: string]
  rateLimited: [endpoint: string, waitMs: number]
  visitorIdRefreshed: [oldId: string, newId: string]
  retry: [endpoint: string, attempt: number, reason: string]
  error: [error: Error]
}

type EventName = keyof EventMap
type Handler<E extends EventName> = (...args: EventMap[E]) => void

export class MusicKitEmitter {
  private handlers = new Map<EventName, Set<Function>>()
  private onceMap = new Map<Function, Function>()

  on<E extends EventName>(event: E, handler: Handler<E>): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
  }

  off<E extends EventName>(event: E, handler: Handler<E>): void {
    const wrapper = this.onceMap.get(handler)
    if (wrapper) {
      this.onceMap.delete(handler)
      this.handlers.get(event)?.delete(wrapper)
    } else {
      this.handlers.get(event)?.delete(handler)
    }
  }

  once<E extends EventName>(event: E, handler: Handler<E>): void {
    const wrapper = ((...args: EventMap[E]) => {
      this.off(event, handler)
      handler(...args)
    }) as Handler<E>
    this.onceMap.set(handler, wrapper)
    this.on(event, wrapper)
  }

  emit<E extends EventName>(event: E, ...args: EventMap[E]): void {
    this.handlers.get(event)?.forEach(h => h(...args))
  }
}
