import { ValidationError } from '../errors/index.js'
import type { LyricsProvider, LyricsProviderName } from './provider.js'

/**
 * Where to insert a provider when registering at runtime.
 *   'first'           — insert at the start of the chain (highest priority)
 *   'last' (default)  — append at the end
 *   'before:<name>'   — insert immediately before the given provider name
 *   'after:<name>'    — insert immediately after the given provider name
 */
export type RegistryPosition =
  | 'first'
  | 'last'
  | `before:${LyricsProviderName}`
  | `after:${LyricsProviderName}`

export class LyricsRegistry {
  private providers: LyricsProvider[]

  constructor(initial: LyricsProvider[] = []) {
    this.providers = [...initial]
  }

  /** Returns the providers in their current order. */
  list(): LyricsProvider[] {
    return [...this.providers]
  }

  /** Returns the names of registered providers in order. */
  names(): LyricsProviderName[] {
    return this.providers.map(p => p.name)
  }

  /** Returns the named provider or undefined. */
  get(name: LyricsProviderName): LyricsProvider | undefined {
    return this.providers.find(p => p.name === name)
  }

  /**
   * Adds a provider at the given position. If a provider with the same name is
   * already registered, it is removed first (re-register replaces).
   * Throws if position references an unknown provider name.
   */
  register(provider: LyricsProvider, position: RegistryPosition = 'last'): void {
    // Remove existing entry with same name first (replace semantics).
    this.providers = this.providers.filter(p => p.name !== provider.name)

    if (position === 'first') {
      this.providers.unshift(provider)
      return
    }

    if (position === 'last') {
      this.providers.push(provider)
      return
    }

    if (position.startsWith('before:')) {
      const targetName = position.slice('before:'.length) as LyricsProviderName
      const idx = this.providers.findIndex(p => p.name === targetName)
      if (idx === -1) {
        throw new ValidationError(
          `Cannot insert before '${targetName}': provider is not registered`,
          'position',
        )
      }
      this.providers.splice(idx, 0, provider)
      return
    }

    if (position.startsWith('after:')) {
      const targetName = position.slice('after:'.length) as LyricsProviderName
      const idx = this.providers.findIndex(p => p.name === targetName)
      if (idx === -1) {
        throw new ValidationError(
          `Cannot insert after '${targetName}': provider is not registered`,
          'position',
        )
      }
      this.providers.splice(idx + 1, 0, provider)
      return
    }
  }

  /** Removes a provider by name. Returns true if it was registered. */
  unregister(name: LyricsProviderName): boolean {
    const before = this.providers.length
    this.providers = this.providers.filter(p => p.name !== name)
    return this.providers.length < before
  }

  /**
   * Replaces the entire chain. Useful for config-driven setup.
   * Each entry can be:
   *  - A LyricsProvider instance, OR
   *  - A LyricsProviderName referencing a built-in (looked up via the
   *    `builtins` map passed in)
   * Unknown name strings throw a ValidationError.
   */
  replace(
    spec: ReadonlyArray<LyricsProvider | LyricsProviderName>,
    builtins: ReadonlyMap<LyricsProviderName, LyricsProvider>,
  ): void {
    const resolved: LyricsProvider[] = []

    for (const entry of spec) {
      if (typeof entry === 'string') {
        const builtin = builtins.get(entry)
        if (!builtin) {
          throw new ValidationError(
            `Unknown lyrics provider name: '${entry}'`,
            'spec',
          )
        }
        resolved.push(builtin)
      } else {
        resolved.push(entry)
      }
    }

    this.providers = resolved
  }
}
