import { beforeAll, afterAll, vi } from 'vitest'

// Prevent any real network calls from leaking into unit tests.
// If a test hits the network without explicitly enabling it, it fails loudly.
beforeAll(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error(
      'Real network call intercepted in unit test. Use vi.mock() or pass a fixture instead.'
    )
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})
