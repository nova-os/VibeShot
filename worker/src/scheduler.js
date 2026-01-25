const db = require('./config/database');
const { captureScreenshotsWithProgress } = require('./screenshot');
const { runCleanup } = require('./cleanup');

const POLL_INTERVAL = 10000; // 10 seconds
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

// Retry settings for failed captures
const BASE_RETRY_DELAY_MINUTES = 5; // Initial retry delay after first failure
const MAX_CONSECUTIVE_FAILURES = 5; // Stop retrying after this many consecutive failures
const STALE_JOB_TIMEOUT_MINUTES = 10; // Consider "capturing" jobs stale after this long

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

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Scheduler: Starting polling loop');
    
    // Reset any stale "capturing" jobs from previous runs
    await this.resetStaleJobs();
    
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

  async resetStaleJobs() {
    try {
      // Find and reset jobs that have been "capturing" for too long (worker crashed/restarted)
      const [result] = await db.query(
        `UPDATE capture_jobs 
         SET status = 'failed', 
             error_message = 'Job timed out (worker restarted or crashed)',
             completed_at = NOW()
         WHERE status = 'capturing' 
         AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [STALE_JOB_TIMEOUT_MINUTES]
      );
      
      if (result.affectedRows > 0) {
        console.log(`Scheduler: Reset ${result.affectedRows} stale capturing job(s) from previous run`);
      }
    } catch (error) {
      console.error('Scheduler: Failed to reset stale jobs:', error.message);
    }
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
      // Periodically check for and reset stale jobs
      await this.resetStaleJobs();
      
      const pages = await this.getPagesNeedingCapture();
      
      if (pages.length === 0) {
        // console.log('Scheduler: No pages need capturing');
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
    // Get pages that need capture based on interval OR have a pending capture job
    // Also get info about the most recent job for retry logic
    const [pages] = await db.query(`
      SELECT p.id, p.url, p.name, p.last_screenshot_at,
             s.name as site_name, s.domain as site_domain,
             COALESCE(p.interval_minutes, s.interval_minutes, us.default_interval_minutes, ?) as effective_interval,
             COALESCE(p.viewports, s.viewports, us.default_viewports, ?) as effective_viewports,
             pending_job.id as pending_job_id,
             latest_job.status as latest_job_status,
             latest_job.completed_at as latest_job_completed_at,
             latest_job.consecutive_failures
      FROM pages p
      JOIN sites s ON p.site_id = s.id
      LEFT JOIN user_settings us ON s.user_id = us.user_id
      LEFT JOIN capture_jobs pending_job ON p.id = pending_job.page_id AND pending_job.status = 'pending'
      LEFT JOIN (
        -- Get the most recent job for each page with consecutive failure count
        SELECT cj1.page_id, cj1.status, cj1.completed_at,
               (SELECT COUNT(*) FROM capture_jobs cj2 
                WHERE cj2.page_id = cj1.page_id 
                AND cj2.status = 'failed'
                AND cj2.id >= COALESCE(
                  (SELECT MAX(cj3.id) FROM capture_jobs cj3 
                   WHERE cj3.page_id = cj1.page_id AND cj3.status IN ('completed', 'pending', 'capturing')),
                  0
                )
               ) as consecutive_failures
        FROM capture_jobs cj1
        WHERE cj1.id = (SELECT MAX(cj4.id) FROM capture_jobs cj4 WHERE cj4.page_id = cj1.page_id)
      ) latest_job ON p.id = latest_job.page_id
      WHERE p.is_active = TRUE
        AND (
          -- Has a pending job (user-triggered capture)
          pending_job.id IS NOT NULL
          -- OR page needs regular scheduled capture
          OR (
            (p.last_screenshot_at IS NULL
             OR TIMESTAMPDIFF(MINUTE, p.last_screenshot_at, NOW()) >= 
                COALESCE(p.interval_minutes, s.interval_minutes, us.default_interval_minutes, ?))
            -- AND not in retry cooldown (if last job failed)
            AND (
              latest_job.status IS NULL
              OR latest_job.status != 'failed'
              OR latest_job.consecutive_failures >= ?
              OR TIMESTAMPDIFF(MINUTE, latest_job.completed_at, NOW()) >= 
                 LEAST(? * POW(2, latest_job.consecutive_failures - 1), 1440)
            )
          )
        )
      ORDER BY pending_job.id DESC, p.last_screenshot_at ASC
    `, [DEFAULT_INTERVAL_MINUTES, DEFAULT_VIEWPORTS, DEFAULT_INTERVAL_MINUTES, MAX_CONSECUTIVE_FAILURES, BASE_RETRY_DELAY_MINUTES]);
    
    // Filter out pages already being processed and pages that exceeded max retries
    const filteredPages = pages.filter(page => {
      if (this.activeJobs.has(page.id)) {
        return false;
      }
      
      // Skip pages that have exceeded max consecutive failures (unless there's a pending job)
      if (!page.pending_job_id && 
          page.latest_job_status === 'failed' && 
          page.consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`Scheduler: Skipping page ${page.id} - exceeded max retries (${page.consecutive_failures} consecutive failures)`);
        return false;
      }
      
      return true;
    });
    
    // Fetch instructions and tests for each page and parse viewports
    for (const page of filteredPages) {
      const [instructions] = await db.query(`
        SELECT id, name, script, is_active
        FROM instructions
        WHERE page_id = ? AND is_active = TRUE AND script IS NOT NULL
        ORDER BY execution_order ASC
      `, [page.id]);
      
      const [tests] = await db.query(`
        SELECT id, name, script, is_active
        FROM tests
        WHERE page_id = ? AND is_active = TRUE AND script IS NOT NULL
        ORDER BY execution_order ASC
      `, [page.id]);
      
      page.instructions = instructions;
      page.tests = tests;
      
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
    
    // Get or create capture job
    let jobId = page.pending_job_id;
    const viewportsTotal = (page.effective_viewports || [1920, 768, 375]).length;
    const isRetry = page.latest_job_status === 'failed' && page.consecutive_failures > 0;

    try {
      // Create job if none exists (scheduled capture)
      if (!jobId) {
        const [result] = await db.query(
          `INSERT INTO capture_jobs (page_id, status, viewports_total, started_at) 
           VALUES (?, 'capturing', ?, NOW())`,
          [page.id, viewportsTotal]
        );
        jobId = result.insertId;
      } else {
        // Update existing pending job to capturing
        await db.query(
          `UPDATE capture_jobs 
           SET status = 'capturing', viewports_total = ?, started_at = NOW() 
           WHERE id = ?`,
          [viewportsTotal, jobId]
        );
      }
      
      if (isRetry) {
        console.log(`Scheduler: Retrying page ${page.id} - ${page.name} (attempt ${page.consecutive_failures + 1}/${MAX_CONSECUTIVE_FAILURES}) [job ${jobId}]`);
      } else {
        console.log(`Scheduler: Capturing page ${page.id} - ${page.name} (${page.url}) [job ${jobId}]`);
      }
      
      // Acquire browser from pool
      const browser = await this.browserPool.acquire();
      
      try {
        // Progress callback to update job status
        const onProgress = async (viewport, completed, total) => {
          try {
            await db.query(
              `UPDATE capture_jobs 
               SET current_viewport = ?, viewports_completed = ?, viewports_total = ? 
               WHERE id = ?`,
              [viewport, completed, total, jobId]
            );
          } catch (err) {
            console.error(`Scheduler: Failed to update job progress:`, err.message);
          }
        };
        
        // Capture screenshots for all viewports with progress tracking
        const { screenshots, instructionResults, testResultsByViewport } = await captureScreenshotsWithProgress(
          browser, 
          page, 
          onProgress
        );
        
        // Save all screenshots to database (including errors) and save test results per viewport
        for (const result of screenshots) {
          const screenshotId = await this.saveScreenshot(page.id, result);
          
          // Save any captured errors
          if (result.errors && result.errors.length > 0) {
            await this.saveScreenshotErrors(screenshotId, result.errors);
          }
          
          // Save test results for this viewport's screenshot
          const viewportTestResults = testResultsByViewport[result.viewport];
          if (viewportTestResults && viewportTestResults.length > 0) {
            await this.saveTestResults(viewportTestResults, screenshotId);
          }
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
        
        // Mark job as completed
        await db.query(
          `UPDATE capture_jobs 
           SET status = 'completed', completed_at = NOW(), current_viewport = NULL 
           WHERE id = ?`,
          [jobId]
        );

        console.log(`Scheduler: Successfully captured ${screenshots.length} viewports for page ${page.id} [job ${jobId}]`);
        
      } finally {
        // Always release browser back to pool
        this.browserPool.release(browser);
      }

    } catch (error) {
      console.error(`Scheduler: Failed to capture page ${page.id}:`, error.message);
      
      // Mark job as failed
      if (jobId) {
        try {
          await db.query(
            `UPDATE capture_jobs 
             SET status = 'failed', error_message = ?, completed_at = NOW() 
             WHERE id = ?`,
            [error.message, jobId]
          );
          
          // Log retry info
          const failureCount = (page.consecutive_failures || 0) + 1;
          if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
            console.log(`Scheduler: Page ${page.id} has failed ${failureCount} times - will not auto-retry (manual capture still possible)`);
          } else {
            const retryDelay = Math.min(BASE_RETRY_DELAY_MINUTES * Math.pow(2, failureCount - 1), 1440);
            console.log(`Scheduler: Page ${page.id} will retry in ${retryDelay} minutes (failure ${failureCount}/${MAX_CONSECUTIVE_FAILURES})`);
          }
        } catch (dbErr) {
          console.error(`Scheduler: Failed to update job failure status:`, dbErr.message);
        }
      }
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(page.id);
    }
  }

  async saveScreenshot(pageId, result) {
    const [insertResult] = await db.query(
      `INSERT INTO screenshots (page_id, viewport, viewport_width, file_path, thumbnail_path, file_size, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pageId, result.viewport, result.viewportWidth, result.filePath, result.thumbnailPath, result.fileSize, result.width, result.height]
    );
    return insertResult.insertId;
  }

  async saveScreenshotErrors(screenshotId, errors) {
    if (!errors || errors.length === 0) return;
    
    for (const error of errors) {
      try {
        if (error.type === 'js') {
          await db.query(
            `INSERT INTO screenshot_errors 
             (screenshot_id, error_type, message, source, line_number, column_number, stack)
             VALUES (?, 'js', ?, ?, ?, ?, ?)`,
            [
              screenshotId,
              error.message,
              error.source,
              error.lineNumber,
              error.columnNumber,
              error.stack
            ]
          );
        } else if (error.type === 'network') {
          await db.query(
            `INSERT INTO screenshot_errors 
             (screenshot_id, error_type, message, request_url, request_method, status_code, resource_type)
             VALUES (?, 'network', ?, ?, ?, ?, ?)`,
            [
              screenshotId,
              error.message,
              error.requestUrl,
              error.requestMethod,
              error.statusCode,
              error.resourceType
            ]
          );
        }
      } catch (dbError) {
        console.error(`Scheduler: Failed to save screenshot error:`, dbError.message);
      }
    }
    
    console.log(`Scheduler: Saved ${errors.length} error(s) for screenshot ${screenshotId}`);
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

  async saveTestResults(results, screenshotId) {
    let passed = 0;
    let failed = 0;
    
    for (const result of results) {
      try {
        await db.query(
          `INSERT INTO test_results (test_id, screenshot_id, passed, message, execution_time_ms)
           VALUES (?, ?, ?, ?, ?)`,
          [result.testId, screenshotId, result.passed, result.message, result.executionTimeMs]
        );
        
        if (result.passed) {
          passed++;
        } else {
          failed++;
        }
      } catch (dbError) {
        console.error(`Scheduler: Failed to save test result for test ${result.testId}:`, dbError.message);
      }
    }
    
    console.log(`Scheduler: Saved ${results.length} test result(s) for screenshot ${screenshotId} (${passed} passed, ${failed} failed)`);
  }
}

module.exports = Scheduler;
