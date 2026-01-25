// Types
export interface User {
  id: number
  email: string
  created_at: string
}

export interface Site {
  id: number
  user_id: number
  name: string
  domain: string
  interval_minutes: number | null
  viewports: number[] | null
  created_at: string
  page_count?: number
  screenshot_count?: number
}

export interface Page {
  id: number
  site_id: number
  name: string
  url: string
  interval_minutes: number | null
  viewports: number[] | null
  is_active: boolean
  last_screenshot_at: string | null
  created_at: string
  screenshot_count?: number
  latest_screenshot?: string | null
  // Error counts from the latest screenshot group
  latest_js_error_count?: number
  latest_network_error_count?: number
}

export interface UserSettings {
  default_interval_minutes: number
  default_viewports: number[]
  // Retention policy settings
  retention_enabled: boolean
  max_screenshots_per_page: number | null
  keep_per_day: number
  keep_per_week: number
  keep_per_month: number
  keep_per_year: number
  max_age_days: number | null
}

export interface Screenshot {
  id: number
  page_id: number
  file_path: string
  thumbnail_path: string | null
  width: number
  height: number
  file_size: number
  viewport: 'desktop' | 'tablet' | 'mobile' | null
  viewport_width: number | null
  created_at: string
  // Error counts (from screenshot_errors table)
  js_error_count?: number
  network_error_count?: number
  // Test result counts (from test_results table)
  tests_passed?: number
  tests_failed?: number
}

export interface JsError {
  id: number
  message: string
  source: string | null
  lineNumber: number | null
  columnNumber: number | null
  stack: string | null
  createdAt: string
}

export interface NetworkError {
  id: number
  message: string
  requestUrl: string | null
  requestMethod: string | null
  statusCode: number | null
  resourceType: string | null
  createdAt: string
}

export interface ScreenshotErrorsResponse {
  jsErrors: JsError[]
  networkErrors: NetworkError[]
  totalErrors: number
}

export interface Instruction {
  id: number
  page_id: number
  name: string
  prompt: string
  script: string | null
  script_type: 'eval' | 'actions'
  is_active: boolean
  execution_order: number
  last_error: string | null
  last_error_at: string | null
  last_success_at: string | null
  error_count: number
  created_at: string
  generationError?: string
  sessionId?: number  // AI session ID for tracking generation
}

export interface Test {
  id: number
  page_id: number
  name: string
  prompt: string
  script: string | null
  script_type: 'eval' | 'actions'
  is_active: boolean
  execution_order: number
  viewports: string[] | null  // null = all viewports, or array like ["desktop", "mobile"]
  created_at: string
  updated_at: string
  generationError?: string
  sessionId?: number  // AI session ID for tracking generation
}

export interface TestResult {
  id: number
  testId: number
  testName: string
  testPrompt: string
  passed: boolean
  message: string | null
  executionTimeMs: number | null
  createdAt: string
}

export interface TestResultsResponse {
  testResults: TestResult[]
  summary: {
    total: number
    passed: number
    failed: number
  }
}

export interface AiSession {
  id: number
  type: 'instruction' | 'test'
  target_id: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface AiMessage {
  id: number
  session_id: number
  role: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  tool_name: string | null
  created_at: string
}

export interface AiMessagesResponse {
  messages: AiMessage[]
  session: {
    id: number
    status: AiSession['status']
    error_message: string | null
    completed_at: string | null
  }
}

export interface ComparisonStats {
  diffPercentage: number
  diffPixels: number
}

export interface DiscoveredPage {
  url: string
  title: string
  reason: string
}

export interface DiscoverPagesResponse {
  pages: DiscoveredPage[]
  totalFound: number
}

export interface BulkCreatePagesResponse {
  created: number
  pages: Page[]
}

export interface ScreenshotsResponse {
  screenshots: Screenshot[]
  total: number
  offset: number
  limit: number
}

export interface AuthResponse {
  token: string
  user: User
}

export interface CaptureJob {
  id: number
  status: 'pending' | 'capturing' | 'completed' | 'failed'
  current_viewport: string | null
  viewports_completed: number
  viewports_total: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface CaptureStatusResponse {
  job: CaptureJob | null
}

export interface TriggerCaptureResponse {
  message: string
  jobId: number
}

// API Client
const API_BASE = '/api'

class ApiClient {
  private token: string | null

  constructor() {
    this.token = localStorage.getItem('token')
  }

  setToken(token: string | null) {
    this.token = token
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }

  getToken(): string | null {
    return this.token
  }

  isAuthenticated(): boolean {
    return !!this.token
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const error = new Error(data.error || 'Request failed') as Error & { status: number }
      error.status = response.status
      throw error
    }

    return data as T
  }

  // Auth endpoints
  async register(email: string, password: string): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.setToken(data.token)
    return data
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.setToken(data.token)
    return data
  }

  logout() {
    this.setToken(null)
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me')
  }

  // Settings endpoints
  async getSettings(): Promise<UserSettings> {
    return this.request<UserSettings>('/settings')
  }

  async updateSettings(data: Partial<UserSettings>): Promise<UserSettings> {
    return this.request<UserSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // Sites endpoints
  async getSites(): Promise<Site[]> {
    return this.request<Site[]>('/sites')
  }

  async getSite(id: number): Promise<Site> {
    return this.request<Site>(`/sites/${id}`)
  }

  async createSite(name: string, domain: string): Promise<Site> {
    return this.request<Site>('/sites', {
      method: 'POST',
      body: JSON.stringify({ name, domain }),
    })
  }

  async updateSite(id: number, data: Partial<Pick<Site, 'name' | 'domain' | 'interval_minutes' | 'viewports'>>): Promise<Site> {
    return this.request<Site>(`/sites/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteSite(id: number): Promise<void> {
    return this.request<void>(`/sites/${id}`, {
      method: 'DELETE',
    })
  }

  // Pages endpoints
  async getPages(siteId: number): Promise<Page[]> {
    return this.request<Page[]>(`/sites/${siteId}/pages`)
  }

  async getPage(id: number): Promise<Page> {
    return this.request<Page>(`/pages/${id}`)
  }

  async createPage(siteId: number, data: { name?: string; url: string; interval_minutes?: number | null; viewports?: number[] | null }): Promise<Page> {
    return this.request<Page>(`/sites/${siteId}/pages`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async discoverPages(siteId: number, maxPages: number = 10): Promise<DiscoverPagesResponse> {
    return this.request<DiscoverPagesResponse>(`/sites/${siteId}/discover-pages`, {
      method: 'POST',
      body: JSON.stringify({ maxPages }),
    })
  }

  async bulkCreatePages(
    siteId: number,
    pages: Array<{ url: string; name: string; interval_minutes?: number | null; viewports?: number[] | null }>
  ): Promise<BulkCreatePagesResponse> {
    return this.request<BulkCreatePagesResponse>(`/sites/${siteId}/pages/bulk`, {
      method: 'POST',
      body: JSON.stringify({ pages }),
    })
  }

  async updatePage(
    id: number,
    data: Partial<Pick<Page, 'name' | 'url' | 'interval_minutes' | 'viewports' | 'is_active'>>
  ): Promise<Page> {
    return this.request<Page>(`/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePage(id: number): Promise<void> {
    return this.request<void>(`/pages/${id}`, {
      method: 'DELETE',
    })
  }

  async resolvePageTitle(id: number): Promise<Page> {
    return this.request<Page>(`/pages/${id}/resolve-title`, {
      method: 'POST',
    })
  }

  async fetchPageTitle(url: string): Promise<{ title: string }> {
    return this.request<{ title: string }>('/pages/resolve-title', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  }

  async deletePages(ids: number[]): Promise<{ deletedCount: number }> {
    return this.request<{ deletedCount: number }>('/pages/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  }

  async triggerCapture(pageId: number): Promise<TriggerCaptureResponse> {
    return this.request<TriggerCaptureResponse>(`/pages/${pageId}/capture`, {
      method: 'POST',
    })
  }

  async getCaptureStatus(pageId: number): Promise<CaptureStatusResponse> {
    return this.request<CaptureStatusResponse>(`/pages/${pageId}/capture-status`)
  }

  // Screenshots endpoints
  async getScreenshots(
    pageId: number,
    options: { limit?: number; offset?: number; viewport?: string | null } = {}
  ): Promise<ScreenshotsResponse> {
    const { limit = 50, offset = 0, viewport = null } = options
    let url = `/pages/${pageId}/screenshots?limit=${limit}&offset=${offset}`
    if (viewport) {
      url += `&viewport=${encodeURIComponent(viewport)}`
    }
    return this.request<ScreenshotsResponse>(url)
  }

  async getScreenshot(id: number): Promise<Screenshot> {
    return this.request<Screenshot>(`/screenshots/${id}`)
  }

  async getScreenshotErrors(id: number): Promise<ScreenshotErrorsResponse> {
    return this.request<ScreenshotErrorsResponse>(`/screenshots/${id}/errors`)
  }

  async deleteScreenshot(id: number): Promise<void> {
    return this.request<void>(`/screenshots/${id}`, {
      method: 'DELETE',
    })
  }

  async deleteScreenshotSet(ids: number[]): Promise<{ deletedCount: number }> {
    return this.request<{ deletedCount: number }>('/screenshots/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  }

  getScreenshotImageUrl(id: number): string {
    return `${API_BASE}/screenshots/${id}/image?token=${encodeURIComponent(this.token || '')}`
  }

  getScreenshotThumbnailUrl(id: number): string {
    return `${API_BASE}/screenshots/${id}/thumbnail?token=${encodeURIComponent(this.token || '')}`
  }

  // Comparison endpoints
  getComparisonImageUrl(id1: number, id2: number): string {
    return `${API_BASE}/screenshots/${id1}/compare/${id2}?token=${encodeURIComponent(this.token || '')}`
  }

  async getComparisonStats(id1: number, id2: number): Promise<ComparisonStats> {
    return this.request<ComparisonStats>(`/screenshots/${id1}/compare/${id2}/stats`)
  }

  // Instructions endpoints
  async getInstructions(pageId: number): Promise<Instruction[]> {
    return this.request<Instruction[]>(`/pages/${pageId}/instructions`)
  }

  async createInstruction(
    pageId: number,
    data: { name: string; prompt: string; viewport?: string; useActions?: boolean }
  ): Promise<Instruction> {
    return this.request<Instruction>(`/pages/${pageId}/instructions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateInstruction(
    pageId: number,
    instructionId: number,
    data: Partial<Pick<Instruction, 'name' | 'prompt' | 'is_active' | 'script' | 'script_type'>>
  ): Promise<Instruction> {
    return this.request<Instruction>(`/pages/${pageId}/instructions/${instructionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteInstruction(pageId: number, instructionId: number): Promise<void> {
    return this.request<void>(`/pages/${pageId}/instructions/${instructionId}`, {
      method: 'DELETE',
    })
  }

  async regenerateInstruction(
    pageId: number,
    instructionId: number,
    options?: { viewport?: string; useActions?: boolean }
  ): Promise<Instruction> {
    return this.request<Instruction>(`/pages/${pageId}/instructions/${instructionId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })
  }

  async reorderInstructions(pageId: number, instructionIds: number[]): Promise<Instruction[]> {
    return this.request<Instruction[]>(`/pages/${pageId}/instructions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ instructionIds }),
    })
  }

  // Tests endpoints
  async getTests(pageId: number): Promise<Test[]> {
    return this.request<Test[]>(`/pages/${pageId}/tests`)
  }

  async createTest(
    pageId: number,
    data: { name: string; prompt: string; viewport?: string; viewports?: string[]; useActions?: boolean }
  ): Promise<Test> {
    return this.request<Test>(`/pages/${pageId}/tests`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTest(
    pageId: number,
    testId: number,
    data: Partial<Pick<Test, 'name' | 'prompt' | 'is_active' | 'script' | 'script_type' | 'viewports'>>
  ): Promise<Test> {
    return this.request<Test>(`/pages/${pageId}/tests/${testId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteTest(pageId: number, testId: number): Promise<void> {
    return this.request<void>(`/pages/${pageId}/tests/${testId}`, {
      method: 'DELETE',
    })
  }

  async regenerateTest(
    pageId: number,
    testId: number,
    options?: { viewport?: string; useActions?: boolean }
  ): Promise<Test> {
    return this.request<Test>(`/pages/${pageId}/tests/${testId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })
  }

  async reorderTests(pageId: number, testIds: number[]): Promise<Test[]> {
    return this.request<Test[]>(`/pages/${pageId}/tests/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ testIds }),
    })
  }

  async getScreenshotTestResults(screenshotId: number): Promise<TestResultsResponse> {
    return this.request<TestResultsResponse>(`/screenshots/${screenshotId}/test-results`)
  }

  // AI Sessions endpoints
  async getAiSession(sessionId: number): Promise<AiSession> {
    return this.request<AiSession>(`/ai-sessions/${sessionId}`)
  }

  async getLatestAiSession(type: 'instruction' | 'test', targetId: number): Promise<AiSession> {
    return this.request<AiSession>(`/ai-sessions/latest/${type}/${targetId}`)
  }

  async getAiMessages(sessionId: number, afterId?: number): Promise<AiMessagesResponse> {
    const params = afterId ? `?after=${afterId}` : ''
    return this.request<AiMessagesResponse>(`/ai-sessions/${sessionId}/messages${params}`)
  }
}

// Global API client instance
export const api = new ApiClient()
