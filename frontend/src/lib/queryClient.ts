import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time of 30 seconds - data is considered fresh for this duration
      staleTime: 30 * 1000,
      // Retry failed requests once
      retry: 1,
      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,
    },
  },
})

// Query key factory for consistent key generation
export const queryKeys = {
  // Sites
  sites: {
    all: ['sites'] as const,
    detail: (id: number) => ['sites', id] as const,
  },
  // Pages
  pages: {
    list: (siteId: number) => ['pages', 'list', siteId] as const,
    detail: (id: number) => ['pages', id] as const,
    captureStatus: (id: number) => ['pages', id, 'captureStatus'] as const,
  },
  // Screenshots
  screenshots: {
    list: (pageId: number, viewport?: string | null) =>
      ['screenshots', 'list', pageId, viewport ?? 'all'] as const,
    detail: (id: number) => ['screenshots', id] as const,
    errors: (id: number) => ['screenshots', id, 'errors'] as const,
    testResults: (id: number) => ['screenshots', id, 'testResults'] as const,
  },
  // Instructions
  instructions: {
    list: (pageId: number) => ['instructions', pageId] as const,
  },
  // Tests
  tests: {
    list: (pageId: number) => ['tests', pageId] as const,
  },
  // Settings
  settings: {
    user: ['settings'] as const,
  },
  // AI Sessions
  aiSessions: {
    detail: (id: number) => ['ai-sessions', id] as const,
    latest: (type: string, targetId: number) =>
      ['ai-sessions', 'latest', type, targetId] as const,
    messages: (sessionId: number) => ['ai-sessions', sessionId, 'messages'] as const,
  },
}
