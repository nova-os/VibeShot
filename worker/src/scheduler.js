const db = require('./config/database');
const { captureScreenshots } = require('./screenshot');
const { runCleanup } = require('./cleanup');

const POLL_INTERVAL = 60000; // 60 seconds
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

// Default settings (fallback when no user settings exist)
const DEFAULT_INTERVAL_MINUTES = 1440; // 24 hours
const DEFAULT_VIEWPORTS = '[1920, 768, 375]';

class Scheduler {
  constructor(browserPool) {
    this.browserPool = browserPool;
    this.isRunning = false;
    this.intervalId = null;
    this.cleanupIntervalId = null;
    this.activeJobs = new Set();
    this.isCleanupRunning = false;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Scheduler: Starting polling loop');
    
    // Run capture check immediately, then on interval
    this.checkAndCapture();
    this.intervalId = setInterval(() => this.checkAndCapture(), POLL_INTERVAL);
    
    // Run cleanup after a short delay, then every 6 hours
    setTimeout(() => this.runCleanupJob(), 60000); // Wait 1 minute before first cleanup
    this.cleanupIntervalId = setInterval(() => this.runCleanupJob(), CLEANUP_INTERVAL);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    console.log('Scheduler: Stopped');
  }

  async runCleanupJob() {
    if (!this.isRunning || this.isCleanupRunning) return;
    
    this.isCleanupRunning = true;
    try {
      await runCleanup();
    } catch (error) {
      console.error('Scheduler: Cleanup job failed:', error.message);
    } finally {
      this.isCleanupRunning = false;
    }
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
      SELECT p.id, p.url, p.name, p.last_screenshot_at,
             s.name as site_name, s.domain as site_domain,
             COALESCE(p.interval_minutes, s.interval_minutes, us.default_interval_minutes, ?) as effective_interval,
             COALESCE(p.viewports, s.viewports, us.default_viewports, ?) as effective_viewports
      FROM pages p
      JOIN sites s ON p.site_id = s.id
      LEFT JOIN user_settings us ON s.user_id = us.user_id
      WHERE p.is_active = TRUE
        AND (
          p.last_screenshot_at IS NULL
          OR TIMESTAMPDIFF(MINUTE, p.last_screenshot_at, NOW()) >= 
             COALESCE(p.interval_minutes, s.interval_minutes, us.default_interval_minutes, ?)
        )
      ORDER BY p.last_screenshot_at ASC
    `, [DEFAULT_INTERVAL_MINUTES, DEFAULT_VIEWPORTS, DEFAULT_INTERVAL_MINUTES]);
    
    // Filter out pages already being processed
    const filteredPages = pages.filter(page => !this.activeJobs.has(page.id));
    
    // Fetch instructions for each page and parse viewports
    for (const page of filteredPages) {
      const [instructions] = await db.query(`
        SELECT id, name, script, is_active
        FROM instructions
        WHERE page_id = ? AND is_active = TRUE AND script IS NOT NULL
        ORDER BY execution_order ASC
      `, [page.id]);
      
      page.instructions = instructions;
      
      // Parse viewports JSON if it's a string
      if (typeof page.effective_viewports === 'string') {
        page.effective_viewports = JSON.parse(page.effective_viewports);
      }
    }
    
    return filteredPages;
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
        const { screenshots, instructionResults } = await captureScreenshots(browser, page);
        
        // Save all screenshots to database
        for (const result of screenshots) {
          await this.saveScreenshot(page.id, result);
        }
        
        // Save instruction execution results (errors and successes)
        if (instructionResults && instructionResults.length > 0) {
          await this.saveInstructionResults(instructionResults);
        }
        
        // Update last_screenshot_at
        await db.query(
          'UPDATE pages SET last_screenshot_at = NOW() WHERE id = ?',
          [page.id]
        );

        console.log(`Scheduler: Successfully captured ${screenshots.length} viewports for page ${page.id}`);
        
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

  async saveInstructionResults(results) {
    for (const result of results) {
      try {
        if (result.success) {
          // Clear error and update success timestamp
          await db.query(
            `UPDATE instructions 
             SET last_error = NULL, 
                 last_success_at = NOW(),
                 error_count = 0
             WHERE id = ?`,
            [result.instructionId]
          );
          console.log(`Scheduler: Instruction ${result.instructionId} (${result.name}) executed successfully`);
        } else {
          // Log the error
          await db.query(
            `UPDATE instructions 
             SET last_error = ?, 
                 last_error_at = NOW(),
                 error_count = error_count + 1
             WHERE id = ?`,
            [result.error, result.instructionId]
          );
          console.log(`Scheduler: Instruction ${result.instructionId} (${result.name}) failed: ${result.error}`);
        }
      } catch (dbError) {
        console.error(`Scheduler: Failed to save instruction result for ${result.instructionId}:`, dbError.message);
      }
    }
  }
}

module.exports = Scheduler;
