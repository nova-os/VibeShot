const db = require('./config/database');
const { captureScreenshots } = require('./screenshot');

const POLL_INTERVAL = 60000; // 60 seconds

class Scheduler {
  constructor(browserPool) {
    this.browserPool = browserPool;
    this.isRunning = false;
    this.intervalId = null;
    this.activeJobs = new Set();
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Scheduler: Starting polling loop');
    
    // Run immediately, then on interval
    this.checkAndCapture();
    this.intervalId = setInterval(() => this.checkAndCapture(), POLL_INTERVAL);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('Scheduler: Stopped');
  }

  async checkAndCapture() {
    if (!this.isRunning) return;

    try {
      const pages = await this.getPagesNeedingCapture();
      
      if (pages.length === 0) {
        console.log('Scheduler: No pages need capturing');
        return;
      }

      console.log(`Scheduler: Found ${pages.length} pages needing capture`);

      // Process pages in parallel (limited by browser pool)
      const capturePromises = pages.map(page => this.processPage(page));
      await Promise.allSettled(capturePromises);

    } catch (error) {
      console.error('Scheduler: Error checking pages:', error);
    }
  }

  async getPagesNeedingCapture() {
    const [pages] = await db.query(`
      SELECT p.id, p.url, p.name, p.interval_minutes, p.last_screenshot_at,
             s.name as site_name, s.domain as site_domain
      FROM pages p
      JOIN sites s ON p.site_id = s.id
      WHERE p.is_active = TRUE
        AND (
          p.last_screenshot_at IS NULL
          OR TIMESTAMPDIFF(MINUTE, p.last_screenshot_at, NOW()) >= p.interval_minutes
        )
      ORDER BY p.last_screenshot_at ASC
    `);
    
    // Filter out pages already being processed
    return pages.filter(page => !this.activeJobs.has(page.id));
  }

  async processPage(page) {
    // Mark as active to prevent duplicate processing
    this.activeJobs.add(page.id);

    try {
      console.log(`Scheduler: Capturing page ${page.id} - ${page.name} (${page.url})`);
      
      // Acquire browser from pool
      const browser = await this.browserPool.acquire();
      
      try {
        // Capture screenshots for all viewports
        const results = await captureScreenshots(browser, page);
        
        // Save all screenshots to database
        for (const result of results) {
          await this.saveScreenshot(page.id, result);
        }
        
        // Update last_screenshot_at
        await db.query(
          'UPDATE pages SET last_screenshot_at = NOW() WHERE id = ?',
          [page.id]
        );

        console.log(`Scheduler: Successfully captured ${results.length} viewports for page ${page.id}`);
        
      } finally {
        // Always release browser back to pool
        this.browserPool.release(browser);
      }

    } catch (error) {
      console.error(`Scheduler: Failed to capture page ${page.id}:`, error.message);
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(page.id);
    }
  }

  async saveScreenshot(pageId, result) {
    await db.query(
      `INSERT INTO screenshots (page_id, viewport, viewport_width, file_path, thumbnail_path, file_size, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pageId, result.viewport, result.viewportWidth, result.filePath, result.thumbnailPath, result.fileSize, result.width, result.height]
    );
  }
}

module.exports = Scheduler;
