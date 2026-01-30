import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryClient'
import {
  api,
  Site,
  Page,
  Instruction,
  Test,
  UserSettings,
} from '@/lib/api'

// ============================================================================
// Sites
// ============================================================================

export function useSites() {
  return useQuery({
    queryKey: queryKeys.sites.all,
    queryFn: () => api.getSites(),
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  })
}

export function useSite(siteId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sites.detail(siteId!),
    queryFn: () => api.getSite(siteId!),
    enabled: !!siteId,
    refetchInterval: 10 * 1000, // Poll every 30 seconds
  })
}

export function useCreateSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, domain }: { name: string; domain: string }) =>
      api.createSite(name, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

export function useUpdateSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Partial<Pick<Site, 'name' | 'domain' | 'interval_minutes' | 'viewports'>>
    }) => api.updateSite(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.detail(id) })
    },
  })
}

export function useDeleteSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.deleteSite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

// ============================================================================
// Pages
// ============================================================================

export function usePages(siteId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.pages.list(siteId!),
    queryFn: () => api.getPages(siteId!),
    enabled: !!siteId,
    refetchInterval: 10 * 1000, // Poll every 30 seconds
  })
}

export function usePage(pageId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.pages.detail(pageId!),
    queryFn: () => api.getPage(pageId!),
    enabled: !!pageId,
  })
}

export function useCreatePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      siteId,
      data,
    }: {
      siteId: number
      data: { name?: string; url: string; interval_minutes?: number | null; viewports?: number[] | null }
    }) => api.createPage(siteId, data),
    onSuccess: (_, { siteId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.list(siteId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.detail(siteId) })
    },
  })
}

export function useBulkCreatePages() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      siteId,
      pages,
    }: {
      siteId: number
      pages: Array<{ url: string; name: string; interval_minutes?: number | null; viewports?: number[] | null }>
    }) => api.bulkCreatePages(siteId, pages),
    onSuccess: (_, { siteId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.list(siteId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.detail(siteId) })
    },
  })
}

export function useUpdatePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Partial<Pick<Page, 'name' | 'url' | 'interval_minutes' | 'viewports' | 'is_active'>>
    }) => api.updatePage(id, data),
    onSuccess: (updatedPage) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.detail(updatedPage.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.list(updatedPage.site_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

export function useDeletePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.deletePage(id),
    onSuccess: () => {
      // Invalidate all pages lists since we don't know which site
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

export function useDeletePages() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: number[]) => api.deletePages(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

export function useCaptureStatus(pageId: number | undefined, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: queryKeys.pages.captureStatus(pageId!),
    queryFn: () => api.getCaptureStatus(pageId!),
    enabled: !!pageId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval,
  })
}

export function useTriggerCapture() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pageId: number) => api.triggerCapture(pageId),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.captureStatus(pageId) })
    },
  })
}

// ============================================================================
// Screenshots
// ============================================================================

export function useScreenshots(
  pageId: number | undefined,
  options?: { viewport?: string | null; limit?: number; offset?: number; enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.screenshots.list(pageId!, options?.viewport),
    queryFn: () =>
      api.getScreenshots(pageId!, {
        viewport: options?.viewport,
        limit: options?.limit,
        offset: options?.offset,
      }),
    enabled: !!pageId && (options?.enabled !== false),
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  })
}

export function useScreenshotErrors(screenshotId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.screenshots.errors(screenshotId!),
    queryFn: () => api.getScreenshotErrors(screenshotId!),
    enabled: !!screenshotId,
  })
}

export function useScreenshotTestResults(screenshotId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.screenshots.testResults(screenshotId!),
    queryFn: () => api.getScreenshotTestResults(screenshotId!),
    enabled: !!screenshotId,
  })
}

export function useDeleteScreenshot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.deleteScreenshot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screenshots'] })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

export function useDeleteScreenshots() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: number[]) => api.deleteScreenshotSet(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screenshots'] })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

// ============================================================================
// Instructions
// ============================================================================

export function useInstructions(pageId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.instructions.list(pageId!),
    queryFn: () => api.getInstructions(pageId!),
    enabled: !!pageId,
  })
}

export function useCreateInstruction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pageId,
      data,
    }: {
      pageId: number
      data: { name: string; prompt: string; viewport?: string; useActions?: boolean }
    }) => api.createInstruction(pageId, data),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instructions.list(pageId) })
    },
  })
}

export function useUpdateInstruction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pageId,
      instructionId,
      data,
    }: {
      pageId: number
      instructionId: number
      data: Partial<Pick<Instruction, 'name' | 'prompt' | 'is_active' | 'script' | 'script_type'>>
    }) => api.updateInstruction(pageId, instructionId, data),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instructions.list(pageId) })
    },
  })
}

export function useDeleteInstruction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId, instructionId }: { pageId: number; instructionId: number }) =>
      api.deleteInstruction(pageId, instructionId),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instructions.list(pageId) })
    },
  })
}

export function useRegenerateInstruction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pageId,
      instructionId,
      options,
    }: {
      pageId: number
      instructionId: number
      options?: { viewport?: string; useActions?: boolean }
    }) => api.regenerateInstruction(pageId, instructionId, options),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instructions.list(pageId) })
    },
  })
}

export function useReorderInstructions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId, instructionIds }: { pageId: number; instructionIds: number[] }) =>
      api.reorderInstructions(pageId, instructionIds),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instructions.list(pageId) })
    },
  })
}

// ============================================================================
// Tests
// ============================================================================

export function useTests(pageId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.tests.list(pageId!),
    queryFn: () => api.getTests(pageId!),
    enabled: !!pageId,
  })
}

export function useCreateTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pageId,
      data,
    }: {
      pageId: number
      data: { name: string; prompt: string; viewport?: string; viewports?: string[]; useActions?: boolean }
    }) => api.createTest(pageId, data),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tests.list(pageId) })
    },
  })
}

export function useUpdateTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pageId,
      testId,
      data,
    }: {
      pageId: number
      testId: number
      data: Partial<Pick<Test, 'name' | 'prompt' | 'is_active' | 'script' | 'script_type' | 'viewports'>>
    }) => api.updateTest(pageId, testId, data),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tests.list(pageId) })
    },
  })
}

export function useDeleteTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId, testId }: { pageId: number; testId: number }) =>
      api.deleteTest(pageId, testId),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tests.list(pageId) })
    },
  })
}

export function useRegenerateTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pageId,
      testId,
      options,
    }: {
      pageId: number
      testId: number
      options?: { viewport?: string; useActions?: boolean }
    }) => api.regenerateTest(pageId, testId, options),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tests.list(pageId) })
    },
  })
}

export function useReorderTests() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId, testIds }: { pageId: number; testIds: number[] }) =>
      api.reorderTests(pageId, testIds),
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tests.list(pageId) })
    },
  })
}

// ============================================================================
// Settings
// ============================================================================

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.user,
    queryFn: () => api.getSettings(),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<UserSettings>) => api.updateSettings(data),
    onSuccess: () => {
      // Invalidate settings
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.user })
      // Invalidate pages since they inherit settings (effective_interval_minutes)
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      // Invalidate sites since page counts may change how things are displayed
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
  })
}

// ============================================================================
// Page Discovery
// ============================================================================

export function useDiscoverPages() {
  return useMutation({
    mutationFn: ({ siteId, maxPages }: { siteId: number; maxPages?: number }) =>
      api.discoverPages(siteId, maxPages),
  })
}

// ============================================================================
// Misc Page Actions
// ============================================================================

export function useResolvePageTitle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pageId: number) => api.resolvePageTitle(pageId),
    onSuccess: (updatedPage) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.detail(updatedPage.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.list(updatedPage.site_id) })
    },
  })
}

export function useFetchPageTitle() {
  return useMutation({
    mutationFn: (url: string) => api.fetchPageTitle(url),
  })
}
