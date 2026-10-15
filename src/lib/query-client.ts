import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { SessionExpiredError } from './errors'

type Listener = () => void
const sessionExpiredListeners = new Set<Listener>()

/** Subscribe to "the API rejected our session" events. */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

function handleError(error: unknown) {
  if (error instanceof SessionExpiredError) sessionExpiredListeners.forEach((l) => l())
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => !(error instanceof SessionExpiredError) && count < 2,
      },
      mutations: { retry: false },
    },
  })
}
