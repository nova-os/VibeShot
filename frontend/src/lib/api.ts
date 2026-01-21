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
  created_at: string
  page_count?: number
  screenshot_count?: number
}

export interface Page {
  id: number
  site_id: number
  name: string
  url: string
  interval_minutes: number
  is_active: boolean
  last_screenshot_at: string | null
  created_at: string
  screenshot_count?: number
  latest_screenshot?: string | null
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
}

export interface Instruction {
  id: number
  page_id: number
  name: string
  prompt: string
  script: string | null
  is_active: boolean
  execution_order: number
  last_error: string | null
  last_error_at: string | null
  last_success_at: string | null
  error_count: number
  created_at: string
  generationError?: string
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

  async updateSite(id: number, data: Partial<Pick<Site, 'name' | 'domain'>>): Promise<Site> {
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

  async createPage(siteId: number, data: Pick<Page, 'name' | 'url' | 'interval_minutes'>): Promise<Page> {
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
    pages: Array<{ url: string; name: string; interval_minutes?: number }>
  ): Promise<BulkCreatePagesResponse> {
    return this.request<BulkCreatePagesResponse>(`/sites/${siteId}/pages/bulk`, {
      method: 'POST',
      body: JSON.stringify({ pages }),
    })
  }

  async updatePage(
    id: number,
    data: Partial<Pick<Page, 'name' | 'url' | 'interval_minutes' | 'is_active'>>
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

  async triggerCapture(pageId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/pages/${pageId}/capture`, {
      method: 'POST',
    })
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
    data: { name: string; prompt: string; viewport?: string }
  ): Promise<Instruction> {
    return this.request<Instruction>(`/pages/${pageId}/instructions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateInstruction(
    pageId: number,
    instructionId: number,
    data: Partial<Pick<Instruction, 'name' | 'prompt' | 'is_active' | 'script'>>
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
    options?: { viewport?: string }
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
}

// Global API client instance
export const api = new ApiClient()
