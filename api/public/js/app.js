// Main Application Logic

let currentSite = null;
let currentPage = null;
let currentViewportFilter = null; // null means "all"
let compareMode = false;
let selectedForComparison = new Set();
let screenshotsCache = []; // Cache screenshots for comparison selection
let isSyncingScroll = false; // Flag to prevent scroll sync loops

const VIEWPORT_LABELS = {
  mobile: '📱 Mobile',
  tablet: '📱 Tablet',
  desktop: '🖥️ Desktop'
};

const VIEWPORT_ICONS = {
  mobile: '📱',
  tablet: '📱',
  desktop: '🖥️'
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNavigation();
  initModals();
  checkAuth();
  createToastContainer();
});

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  container.id = 'toast-container';
  document.body.appendChild(container);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Navigation
function initNavigation() {
  document.getElementById('back-to-dashboard').addEventListener('click', showDashboard);
  document.getElementById('back-to-site').addEventListener('click', () => showSiteDetail(currentSite.id));
  document.getElementById('add-site-btn').addEventListener('click', showAddSiteModal);
  document.getElementById('add-page-btn').addEventListener('click', showAddPageModal);
  document.getElementById('delete-site-btn').addEventListener('click', confirmDeleteSite);
  document.getElementById('capture-now-btn').addEventListener('click', triggerCapture);
  document.getElementById('edit-page-btn').addEventListener('click', showEditPageModal);
  document.getElementById('delete-page-btn').addEventListener('click', confirmDeletePage);
}

// Dashboard
async function loadDashboard() {
  showDashboard();
}

function showDashboard() {
  document.getElementById('dashboard-section').classList.remove('hidden');
  document.getElementById('site-detail-section').classList.add('hidden');
  document.getElementById('screenshots-section').classList.add('hidden');
  loadSites();
}

async function loadSites() {
  const grid = document.getElementById('sites-grid');
  const emptyState = document.getElementById('empty-state');

  grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  emptyState.classList.add('hidden');

  try {
    const sites = await api.getSites();

    if (sites.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    grid.innerHTML = sites.map(site => `
      <div class="site-card" onclick="showSiteDetail(${site.id})">
        <div class="site-card-header">
          <div>
            <div class="site-card-name">${escapeHtml(site.name)}</div>
            <div class="site-card-domain">${escapeHtml(site.domain)}</div>
          </div>
        </div>
        <div class="site-card-stats">
          <div class="stat">
            <div class="stat-value">${site.page_count || 0}</div>
            <div class="stat-label">Pages</div>
          </div>
          <div class="stat">
            <div class="stat-value">${site.screenshot_count || 0}</div>
            <div class="stat-label">Screenshots</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    grid.innerHTML = `<p class="text-muted">Failed to load sites: ${error.message}</p>`;
  }
}

// Site Detail
async function showSiteDetail(siteId) {
  document.getElementById('dashboard-section').classList.add('hidden');
  document.getElementById('site-detail-section').classList.remove('hidden');
  document.getElementById('screenshots-section').classList.add('hidden');

  try {
    const [site, pages] = await Promise.all([
      api.getSite(siteId),
      api.getPages(siteId)
    ]);

    currentSite = site;

    document.getElementById('site-name').textContent = site.name;
    document.getElementById('site-domain').textContent = site.domain;

    const pagesList = document.getElementById('pages-list');
    
    if (pages.length === 0) {
      pagesList.innerHTML = `
        <div class="empty-state">
          <h2>No pages monitored</h2>
          <p>Add pages to start capturing screenshots</p>
        </div>
      `;
      return;
    }

    pagesList.innerHTML = pages.map(page => `
      <div class="page-card ${page.is_active ? '' : 'inactive'}" onclick="showScreenshots(${page.id})">
        <div class="page-status ${page.is_active ? '' : 'inactive'}"></div>
        <div class="page-info">
          <div class="page-card-name">${escapeHtml(page.name)}</div>
          <div class="page-card-url">${escapeHtml(page.url)}</div>
        </div>
        <div class="page-meta">
          <span>Every ${formatInterval(page.interval_minutes)}</span>
          <span>${page.screenshot_count || 0} screenshots</span>
          ${page.latest_screenshot ? `<span>Last: ${formatDate(page.latest_screenshot)}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('Failed to load site: ' + error.message, 'error');
  }
}

// Screenshots
async function showScreenshots(pageId) {
  document.getElementById('dashboard-section').classList.add('hidden');
  document.getElementById('site-detail-section').classList.add('hidden');
  document.getElementById('screenshots-section').classList.remove('hidden');

  try {
    const page = await api.getPage(pageId);
    currentPage = page;
    currentViewportFilter = null; // Reset filter when switching pages

    document.getElementById('page-name').textContent = page.name;
    document.getElementById('page-url').textContent = page.url;

    // Render viewport filter tabs
    renderViewportTabs();
    
    loadScreenshots(pageId);
  } catch (error) {
    showToast('Failed to load page: ' + error.message, 'error');
  }
}

function renderViewportTabs() {
  const container = document.getElementById('viewport-tabs');
  if (!container) return;

  container.innerHTML = `
    <div class="viewport-tabs-left">
      <button class="viewport-tab ${currentViewportFilter === null ? 'active' : ''}" onclick="filterByViewport(null)">
        All
      </button>
      <button class="viewport-tab ${currentViewportFilter === 'desktop' ? 'active' : ''}" onclick="filterByViewport('desktop')">
        🖥️ Desktop
      </button>
      <button class="viewport-tab ${currentViewportFilter === 'tablet' ? 'active' : ''}" onclick="filterByViewport('tablet')">
        📱 Tablet
      </button>
      <button class="viewport-tab ${currentViewportFilter === 'mobile' ? 'active' : ''}" onclick="filterByViewport('mobile')">
        📱 Mobile
      </button>
    </div>
    <div class="viewport-tabs-right">
      <button class="btn ${compareMode ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="toggleCompareMode()">
        ${compareMode ? '✕ Cancel' : '⟷ Compare'}
      </button>
      ${compareMode && selectedForComparison.size === 2 ? `
        <button class="btn btn-primary btn-sm" onclick="showComparison()">
          Compare Selected
        </button>
      ` : ''}
    </div>
  `;
}

function toggleCompareMode() {
  compareMode = !compareMode;
  selectedForComparison.clear();
  renderViewportTabs();
  loadScreenshots(currentPage.id);
}

function toggleScreenshotSelection(id, event) {
  event.stopPropagation();
  
  if (selectedForComparison.has(id)) {
    selectedForComparison.delete(id);
  } else {
    if (selectedForComparison.size < 2) {
      selectedForComparison.add(id);
    } else {
      showToast('You can only select 2 screenshots to compare', 'error');
      return;
    }
  }
  
  renderViewportTabs();
  // Update checkbox states without full reload
  document.querySelectorAll('.screenshot-card').forEach(card => {
    const cardId = parseInt(card.dataset.screenshotId);
    const checkbox = card.querySelector('.compare-checkbox');
    if (checkbox) {
      checkbox.checked = selectedForComparison.has(cardId);
    }
    card.classList.toggle('selected-for-compare', selectedForComparison.has(cardId));
  });
}

function filterByViewport(viewport) {
  currentViewportFilter = viewport;
  renderViewportTabs();
  loadScreenshots(currentPage.id);
}

async function loadScreenshots(pageId) {
  const timeline = document.getElementById('screenshots-timeline');
  timeline.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const result = await api.getScreenshots(pageId, { 
      viewport: currentViewportFilter 
    });
    const screenshots = result.screenshots;
    
    // Cache screenshots for comparison lookup
    screenshotsCache = screenshots;

    if (screenshots.length === 0) {
      timeline.innerHTML = `
        <div class="empty-state">
          <h2>No screenshots yet</h2>
          <p>Screenshots will appear here once captured</p>
        </div>
      `;
      return;
    }

    // Group screenshots by timestamp (same capture session)
    const grouped = groupScreenshotsByTimestamp(screenshots);
    
    if (currentViewportFilter) {
      // Single viewport view - show as grid
      timeline.innerHTML = screenshots.map(screenshot => renderScreenshotCard(screenshot)).join('');
    } else {
      // All viewports view - group by capture time
      timeline.innerHTML = grouped.map(group => renderScreenshotGroup(group)).join('');
    }
  } catch (error) {
    timeline.innerHTML = `<p class="text-muted">Failed to load screenshots: ${error.message}</p>`;
  }
}

function groupScreenshotsByTimestamp(screenshots) {
  const groups = {};
  
  screenshots.forEach(screenshot => {
    // Group by created_at minute (screenshots in same capture should have same minute)
    const date = new Date(screenshot.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
    
    if (!groups[key]) {
      groups[key] = {
        timestamp: screenshot.created_at,
        screenshots: []
      };
    }
    groups[key].screenshots.push(screenshot);
  });
  
  // Sort groups by timestamp (newest first)
  return Object.values(groups).sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
}

function renderScreenshotGroup(group) {
  // Sort screenshots within group: desktop, tablet, mobile
  const order = { desktop: 0, tablet: 1, mobile: 2 };
  group.screenshots.sort((a, b) => 
    (order[a.viewport] || 99) - (order[b.viewport] || 99)
  );
  
  return `
    <div class="screenshot-group">
      <div class="screenshot-group-header">
        <span class="screenshot-group-date">${formatDateTime(group.timestamp)}</span>
        <span class="screenshot-group-count">${group.screenshots.length} viewport${group.screenshots.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="screenshot-group-items">
        ${group.screenshots.map(screenshot => renderScreenshotCard(screenshot, true)).join('')}
      </div>
    </div>
  `;
}

function renderScreenshotCard(screenshot, showViewport = false) {
  const viewportBadge = screenshot.viewport ? `
    <span class="viewport-badge viewport-${screenshot.viewport}">
      ${VIEWPORT_ICONS[screenshot.viewport] || ''} ${screenshot.viewport}
    </span>
  ` : '';
  
  const isSelected = selectedForComparison.has(screenshot.id);
  const compareCheckbox = compareMode ? `
    <label class="compare-checkbox-wrapper" onclick="toggleScreenshotSelection(${screenshot.id}, event)">
      <input type="checkbox" class="compare-checkbox" ${isSelected ? 'checked' : ''}>
      <span class="compare-checkbox-label">Select</span>
    </label>
  ` : '';
  
  const cardClick = compareMode 
    ? `toggleScreenshotSelection(${screenshot.id}, event)` 
    : `viewScreenshot(${screenshot.id})`;
  
  return `
    <div class="screenshot-card ${isSelected ? 'selected-for-compare' : ''}" 
         data-screenshot-id="${screenshot.id}"
         onclick="${cardClick}">
      <div class="screenshot-thumb">
        <img src="${api.getScreenshotThumbnailUrl(screenshot.id)}" 
             alt="Screenshot" 
             onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>📷</span>'">
        ${showViewport ? viewportBadge : ''}
        ${compareCheckbox}
      </div>
      <div class="screenshot-info">
        ${!showViewport ? `<div class="screenshot-date">${formatDateTime(screenshot.created_at)}</div>` : ''}
        <div class="screenshot-meta">
          ${showViewport ? `<span class="viewport-label">${screenshot.viewport_width || screenshot.width}px</span> · ` : ''}
          ${screenshot.width}×${screenshot.height} · ${formatFileSize(screenshot.file_size)}
        </div>
      </div>
    </div>
  `;
}

async function viewScreenshot(id) {
  const viewer = document.getElementById('screenshot-viewer');
  const img = document.getElementById('viewer-image');
  const scrollHint = document.getElementById('viewer-scroll-hint');
  
  // Fetch screenshot metadata
  try {
    const screenshot = await api.getScreenshot(id);
    document.getElementById('viewer-date').textContent = formatDateTime(screenshot.created_at);
    document.getElementById('viewer-size').textContent = formatFileSize(screenshot.file_size);
    document.getElementById('viewer-dimensions').textContent = `${screenshot.width}×${screenshot.height}`;
    
    // Show viewport info
    const viewportEl = document.getElementById('viewer-viewport');
    if (viewportEl && screenshot.viewport) {
      viewportEl.textContent = `${VIEWPORT_ICONS[screenshot.viewport] || ''} ${screenshot.viewport} (${screenshot.viewport_width || screenshot.width}px)`;
      viewportEl.classList.remove('hidden');
    } else if (viewportEl) {
      viewportEl.classList.add('hidden');
    }
    
    // Show scroll hint for tall images (height > 2x width suggests full page)
    if (screenshot.height > screenshot.width * 2) {
      scrollHint.classList.remove('hidden');
    } else {
      scrollHint.classList.add('hidden');
    }
  } catch (e) {
    console.error('Failed to load screenshot metadata:', e);
  }
  
  img.src = api.getScreenshotImageUrl(id);
  viewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  // Scroll viewer content to top
  document.querySelector('.viewer-content').scrollTop = 0;
}

function closeViewer() {
  document.getElementById('screenshot-viewer').classList.add('hidden');
  document.getElementById('viewer-scroll-hint').classList.add('hidden');
  document.body.style.overflow = '';
}

// Comparison View
async function showComparison() {
  if (selectedForComparison.size !== 2) {
    showToast('Please select exactly 2 screenshots to compare', 'error');
    return;
  }
  
  const ids = Array.from(selectedForComparison);
  const screenshot1 = screenshotsCache.find(s => s.id === ids[0]);
  const screenshot2 = screenshotsCache.find(s => s.id === ids[1]);
  
  if (!screenshot1 || !screenshot2) {
    showToast('Could not find selected screenshots', 'error');
    return;
  }
  
  // Sort by date (older first = "before")
  const [before, after] = [screenshot1, screenshot2].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  
  const comparisonViewer = document.getElementById('comparison-viewer');
  const beforeImg = document.getElementById('comparison-before-img');
  const afterImg = document.getElementById('comparison-after-img');
  const diffImg = document.getElementById('comparison-diff-img');
  const statsEl = document.getElementById('comparison-stats');
  const beforeDate = document.getElementById('comparison-before-date');
  const afterDate = document.getElementById('comparison-after-date');
  
  // Show viewer with loading state
  comparisonViewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  // Set loading state
  statsEl.innerHTML = '<span class="loading-text">Analyzing changes...</span>';
  diffImg.src = '';
  diffImg.alt = 'Loading diff...';
  
  // Set dates
  beforeDate.textContent = formatDateTime(before.created_at);
  afterDate.textContent = formatDateTime(after.created_at);
  
  // Load before and after images
  beforeImg.src = api.getScreenshotImageUrl(before.id);
  afterImg.src = api.getScreenshotImageUrl(after.id);
  
  // Initialize synchronized scrolling
  initComparisonSyncScroll();
  
  // Load diff image and stats
  try {
    const stats = await api.getComparisonStats(before.id, after.id);
    
    // Update stats display
    const changeLevel = stats.diffPercentage < 1 ? 'minimal' : 
                        stats.diffPercentage < 5 ? 'moderate' : 'significant';
    
    statsEl.innerHTML = `
      <span class="diff-percentage diff-${changeLevel}">${stats.diffPercentage}% changed</span>
      <span class="diff-pixels">${stats.diffPixels.toLocaleString()} pixels differ</span>
    `;
    
    // Load diff image
    diffImg.src = api.getComparisonImageUrl(before.id, after.id);
  } catch (error) {
    console.error('Failed to load comparison:', error);
    statsEl.innerHTML = '<span class="error-text">Failed to generate comparison</span>';
  }
}

function initComparisonSyncScroll() {
  const panels = document.querySelectorAll('.comparison-panel-image');
  
  panels.forEach(panel => {
    panel.addEventListener('scroll', handleComparisonScroll);
  });
}

function handleComparisonScroll(event) {
  if (isSyncingScroll) return;
  
  isSyncingScroll = true;
  
  const sourcePanel = event.target;
  const panels = document.querySelectorAll('.comparison-panel-image');
  
  // Calculate scroll percentage for both axes
  const scrollTopPercent = sourcePanel.scrollTop / (sourcePanel.scrollHeight - sourcePanel.clientHeight) || 0;
  const scrollLeftPercent = sourcePanel.scrollLeft / (sourcePanel.scrollWidth - sourcePanel.clientWidth) || 0;
  
  panels.forEach(panel => {
    if (panel !== sourcePanel) {
      // Apply same scroll percentage to other panels
      const maxScrollTop = panel.scrollHeight - panel.clientHeight;
      const maxScrollLeft = panel.scrollWidth - panel.clientWidth;
      
      panel.scrollTop = scrollTopPercent * maxScrollTop;
      panel.scrollLeft = scrollLeftPercent * maxScrollLeft;
    }
  });
  
  // Reset sync flag after a small delay to allow scroll events to settle
  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
}

function cleanupComparisonSyncScroll() {
  const panels = document.querySelectorAll('.comparison-panel-image');
  panels.forEach(panel => {
    panel.removeEventListener('scroll', handleComparisonScroll);
  });
}

function closeComparisonViewer() {
  // Clean up scroll event listeners
  cleanupComparisonSyncScroll();
  
  document.getElementById('comparison-viewer').classList.add('hidden');
  document.body.style.overflow = '';
}

// Trigger capture
async function triggerCapture() {
  if (!currentPage) return;

  try {
    await api.triggerCapture(currentPage.id);
    showToast('Screenshot capture scheduled', 'success');
  } catch (error) {
    showToast('Failed to trigger capture: ' + error.message, 'error');
  }
}

// Modals
function initModals() {
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeViewer();
      closeComparisonViewer();
    }
  });
}

function showModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showAddSiteModal() {
  showModal('Add Site', `
    <form class="modal-form" onsubmit="createSite(event)">
      <div class="form-group">
        <label for="site-name-input">Site Name</label>
        <input type="text" id="site-name-input" placeholder="My Website" required>
      </div>
      <div class="form-group">
        <label for="site-domain-input">Domain</label>
        <input type="text" id="site-domain-input" placeholder="example.com" required>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Site</button>
      </div>
    </form>
  `);
}

async function createSite(e) {
  e.preventDefault();
  const name = document.getElementById('site-name-input').value;
  const domain = document.getElementById('site-domain-input').value;

  try {
    await api.createSite(name, domain);
    closeModal();
    showToast('Site added successfully', 'success');
    loadSites();
  } catch (error) {
    showToast('Failed to create site: ' + error.message, 'error');
  }
}

function showAddPageModal() {
  if (!currentSite) return;

  showModal('Add Page', `
    <form class="modal-form" onsubmit="createPage(event)">
      <div class="form-group">
        <label for="page-name-input">Page Name</label>
        <input type="text" id="page-name-input" placeholder="Homepage" required>
      </div>
      <div class="form-group">
        <label for="page-url-input">URL</label>
        <input type="url" id="page-url-input" placeholder="https://example.com/" required>
      </div>
      <div class="form-group">
        <label for="page-interval-input">Capture Interval (minutes)</label>
        <input type="number" id="page-interval-input" value="360" min="5" required>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Page</button>
      </div>
    </form>
  `);
}

async function createPage(e) {
  e.preventDefault();
  if (!currentSite) return;

  const name = document.getElementById('page-name-input').value;
  const url = document.getElementById('page-url-input').value;
  const interval_minutes = parseInt(document.getElementById('page-interval-input').value);

  try {
    await api.createPage(currentSite.id, { name, url, interval_minutes });
    closeModal();
    showToast('Page added successfully', 'success');
    showSiteDetail(currentSite.id);
  } catch (error) {
    showToast('Failed to create page: ' + error.message, 'error');
  }
}

function showEditPageModal() {
  if (!currentPage) return;

  showModal('Edit Page', `
    <form class="modal-form" onsubmit="updatePage(event)">
      <div class="form-group">
        <label for="edit-page-name">Page Name</label>
        <input type="text" id="edit-page-name" value="${escapeHtml(currentPage.name)}" required>
      </div>
      <div class="form-group">
        <label for="edit-page-url">URL</label>
        <input type="url" id="edit-page-url" value="${escapeHtml(currentPage.url)}" required>
      </div>
      <div class="form-group">
        <label for="edit-page-interval">Capture Interval (minutes)</label>
        <input type="number" id="edit-page-interval" value="${currentPage.interval_minutes}" min="5" required>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="edit-page-active" ${currentPage.is_active ? 'checked' : ''}>
          Active (capture screenshots)
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </div>
    </form>
  `);
}

async function updatePage(e) {
  e.preventDefault();
  if (!currentPage) return;

  const name = document.getElementById('edit-page-name').value;
  const url = document.getElementById('edit-page-url').value;
  const interval_minutes = parseInt(document.getElementById('edit-page-interval').value);
  const is_active = document.getElementById('edit-page-active').checked;

  try {
    await api.updatePage(currentPage.id, { name, url, interval_minutes, is_active });
    closeModal();
    showToast('Page updated successfully', 'success');
    showScreenshots(currentPage.id);
  } catch (error) {
    showToast('Failed to update page: ' + error.message, 'error');
  }
}

function confirmDeleteSite() {
  if (!currentSite) return;

  showModal('Delete Site', `
    <p>Are you sure you want to delete <strong>${escapeHtml(currentSite.name)}</strong>?</p>
    <p class="text-muted">This will also delete all pages and screenshots.</p>
    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-danger" onclick="deleteSite()">Delete Site</button>
    </div>
  `);
}

async function deleteSite() {
  if (!currentSite) return;

  try {
    await api.deleteSite(currentSite.id);
    closeModal();
    showToast('Site deleted successfully', 'success');
    currentSite = null;
    showDashboard();
  } catch (error) {
    showToast('Failed to delete site: ' + error.message, 'error');
  }
}

function confirmDeletePage() {
  if (!currentPage) return;

  showModal('Delete Page', `
    <p>Are you sure you want to delete <strong>${escapeHtml(currentPage.name)}</strong>?</p>
    <p class="text-muted">This will also delete all screenshots for this page.</p>
    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-danger" onclick="deletePage()">Delete Page</button>
    </div>
  `);
}

async function deletePage() {
  if (!currentPage || !currentSite) return;

  try {
    await api.deletePage(currentPage.id);
    closeModal();
    showToast('Page deleted successfully', 'success');
    currentPage = null;
    showSiteDetail(currentSite.id);
  } catch (error) {
    showToast('Failed to delete page: ' + error.message, 'error');
  }
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function formatInterval(minutes) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
