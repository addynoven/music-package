import type { SessionManager } from '../session'

interface MakeFetchOptions {
  proxy?: string
  session?: SessionManager
}

/**
 * Returns a fetch function that:
 * - Routes through a ProxyAgent when `proxy` is set (using Node's built-in undici).
 * - Merges SessionManager headers (User-Agent, X-Goog-Visitor-Id, etc.) when `session` is set.
 * - Falls back to globalThis.fetch when neither option is provided.
 */
export function makeFetch({ proxy, session }: MakeFetchOptions): typeof globalThis.fetch {
  if (!proxy && !session) return globalThis.fetch

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let sessionHeaders: Record<string, string> = {}

    if (session) {
      sessionHeaders = await session.buildHeaders()
    }

    // Caller-supplied headers win over session headers
    const callerHeaders = normalizeHeaders(init?.headers)
    const merged: Record<string, string> = { ...sessionHeaders, ...callerHeaders }

    const mergedInit: RequestInit = { ...(init ?? {}), headers: merged }

    if (proxy) {
      // undici is bundled in Node 22+ as part of the global fetch implementation.
      // Import it dynamically so it doesn't appear as a compile-time hard dep.
      const undici = await import('undici' as string).catch(() => null) as
        | { ProxyAgent: new (url: string) => object; fetch: typeof globalThis.fetch }
        | null
      if (undici) {
        const dispatcher = new undici.ProxyAgent(proxy)
        return undici.fetch(input, { ...mergedInit, dispatcher } as any)
      }
      // Proxy requested but undici not available — fall through without proxy
    }

    return globalThis.fetch(input, mergedInit)
  }
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (!headers) return {}
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers as [string, string][])
  }
  if (typeof (headers as any).forEach === 'function') {
    const out: Record<string, string> = {}
    ;(headers as any).forEach((v: string, k: string) => { out[k] = v })
    return out
  }
  return headers as Record<string, string>
}
