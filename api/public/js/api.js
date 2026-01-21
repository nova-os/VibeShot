// API Client for AIShot

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken() {
    return this.token;
  }

  isAuthenticated() {
    return !!this.token;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || 'Request failed');
      error.status = response.status;
      throw error;
    }

    return data;
  }

  // Auth endpoints
  async register(email, password) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Sites endpoints
  async getSites() {
    return this.request('/sites');
  }

  async getSite(id) {
    return this.request(`/sites/${id}`);
  }

  async createSite(name, domain) {
    return this.request('/sites', {
      method: 'POST',
      body: JSON.stringify({ name, domain })
    });
  }

  async updateSite(id, data) {
    return this.request(`/sites/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteSite(id) {
    return this.request(`/sites/${id}`, {
      method: 'DELETE'
    });
  }

  // Pages endpoints
  async getPages(siteId) {
    return this.request(`/sites/${siteId}/pages`);
  }

  async getPage(id) {
    return this.request(`/pages/${id}`);
  }

  async createPage(siteId, data) {
    return this.request(`/sites/${siteId}/pages`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updatePage(id, data) {
    return this.request(`/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deletePage(id) {
    return this.request(`/pages/${id}`, {
      method: 'DELETE'
    });
  }

  async triggerCapture(pageId) {
    return this.request(`/pages/${pageId}/capture`, {
      method: 'POST'
    });
  }

  // Screenshots endpoints
  async getScreenshots(pageId, { limit = 50, offset = 0, viewport = null } = {}) {
    let url = `/pages/${pageId}/screenshots?limit=${limit}&offset=${offset}`;
    if (viewport) {
      url += `&viewport=${encodeURIComponent(viewport)}`;
    }
    return this.request(url);
  }

  async getScreenshot(id) {
    return this.request(`/screenshots/${id}`);
  }

  async deleteScreenshot(id) {
    return this.request(`/screenshots/${id}`, {
      method: 'DELETE'
    });
  }

  async deleteScreenshotSet(ids) {
    return this.request('/screenshots/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids })
    });
  }

  getScreenshotImageUrl(id) {
    return `${API_BASE}/screenshots/${id}/image?token=${encodeURIComponent(this.token)}`;
  }

  getScreenshotThumbnailUrl(id) {
    return `${API_BASE}/screenshots/${id}/thumbnail?token=${encodeURIComponent(this.token)}`;
  }

  // Comparison endpoints
  getComparisonImageUrl(id1, id2) {
    return `${API_BASE}/screenshots/${id1}/compare/${id2}?token=${encodeURIComponent(this.token)}`;
  }

  async getComparisonStats(id1, id2) {
    return this.request(`/screenshots/${id1}/compare/${id2}/stats`);
  }

  // Instructions endpoints
  async getInstructions(pageId) {
    return this.request(`/pages/${pageId}/instructions`);
  }

  async createInstruction(pageId, { name, prompt, viewport }) {
    return this.request(`/pages/${pageId}/instructions`, {
      method: 'POST',
      body: JSON.stringify({ name, prompt, viewport })
    });
  }

  async updateInstruction(pageId, instructionId, data) {
    return this.request(`/pages/${pageId}/instructions/${instructionId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteInstruction(pageId, instructionId) {
    return this.request(`/pages/${pageId}/instructions/${instructionId}`, {
      method: 'DELETE'
    });
  }

  async regenerateInstruction(pageId, instructionId, { viewport } = {}) {
    return this.request(`/pages/${pageId}/instructions/${instructionId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ viewport })
    });
  }

  async reorderInstructions(pageId, instructionIds) {
    return this.request(`/pages/${pageId}/instructions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ instructionIds })
    });
  }
}

// Global API client instance
const api = new ApiClient();
