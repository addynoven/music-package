export type StreamClient = 'YTMUSIC' | 'ANDROID_VR' | 'TVHTML5' | 'WEB_REMIX'

export const STREAM_CLIENT_FALLBACK_ORDER: readonly StreamClient[] = [
  'YTMUSIC',
  'ANDROID_VR',
  'TVHTML5',
] as const

export interface TryClientsResult<T> {
  result: T
  clientUsed: StreamClient
  errors: { client: StreamClient; error: Error }[]
}

export async function tryClients<T>(
  clients: readonly StreamClient[],
  fn: (client: StreamClient) => Promise<T | null>,
  options?: { onAttempt?: (client: StreamClient) => void },
): Promise<TryClientsResult<T> | null> {
  const errors: { client: StreamClient; error: Error }[] = []

  for (const client of clients) {
    options?.onAttempt?.(client)

    let result: T | null
    try {
      result = await fn(client)
    } catch (err) {
      errors.push({ client, error: err instanceof Error ? err : new Error(String(err)) })
      continue
    }

    if (result === null) {
      errors.push({ client, error: new Error('returned null') })
      continue
    }

    return { result, clientUsed: client, errors }
  }

  return null
}
