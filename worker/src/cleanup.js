const path = require('path');
const fs = require('fs').promises;
const db = require('./config/database');

/**
 * GFS-style screenshot retention cleanup
 * 
 * Retention tiers:
 * - Last 7 days: keep `keep_per_day` per day bucket
 * - 7-30 days ago: keep `keep_per_week` per week bucket
 * - 30-365 days ago: keep `keep_per_month` per month bucket
 * - Older than 365 days: keep `keep_per_year` per year bucket
 */

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

/**
 * Get the start of a day (midnight) for a given date
 */
function getStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the ISO week number for a date
 */
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get a bucket key for a screenshot based on its age and the retention tier
 */
function getBucketKey(createdAt, now) {
  const date = new Date(createdAt);
  const ageInDays = (now - date) / (1000 * 60 * 60 * 24);
  
  if (ageInDays <= 7) {
    // Daily bucket: YYYY-MM-DD
    return {
      tier: 'day',
      key: date.toISOString().split('T')[0]
    };
  } else if (ageInDays <= 30) {
    // Weekly bucket: YYYY-WXX
    const week = getWeekNumber(date);
    return {
      tier: 'week',
      key: `${date.getFullYear()}-W${String(week).padStart(2, '0')}`
    };
  } else if (ageInDays <= 365) {
    // Monthly bucket: YYYY-MM
    return {
      tier: 'month',
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    };
  } else {
    // Yearly bucket: YYYY
    return {
      tier: 'year',
      key: `${date.getFullYear()}`
    };
  }
}

/**
 * Apply retention policy to screenshots for a single page
 * Returns array of screenshot IDs to delete
 */
function applyRetentionPolicy(screenshots, settings, now) {
  const {
    max_screenshots_per_page,
    keep_per_day,
    keep_per_week,
    keep_per_month,
    keep_per_year,
    max_age_days
  } = settings;

  // Screenshots should already be sorted by created_at DESC (newest first)
  let remaining = [...screenshots];
  const toDelete = [];

  // Step 1: Apply max_screenshots_per_page limit (keep newest)
  if (max_screenshots_per_page && remaining.length > max_screenshots_per_page) {
    const excess = remaining.slice(max_screenshots_per_page);
    toDelete.push(...excess.map(s => s.id));
    remaining = remaining.slice(0, max_screenshots_per_page);
  }

  // Step 2: Apply max_age_days (delete anything older)
  if (max_age_days) {
    const cutoffDate = new Date(now - max_age_days * 24 * 60 * 60 * 1000);
    const oldScreenshots = remaining.filter(s => new Date(s.created_at) < cutoffDate);
    toDelete.push(...oldScreenshots.map(s => s.id));
    remaining = remaining.filter(s => new Date(s.created_at) >= cutoffDate);
  }

  // Step 3: Group by time buckets and apply GFS retention
  const buckets = {
    day: {},   // key -> [screenshots]
    week: {},
    month: {},
    year: {}
  };

  const keepLimits = {
    day: keep_per_day,
    week: keep_per_week,
    month: keep_per_month,
    year: keep_per_year
  };

  // Group screenshots into buckets
  for (const screenshot of remaining) {
    const { tier, key } = getBucketKey(screenshot.created_at, now);
    if (!buckets[tier][key]) {
      buckets[tier][key] = [];
    }
    buckets[tier][key].push(screenshot);
  }

  // Apply limits per bucket (keep the oldest N in each bucket for better distribution)
  const toKeep = new Set();

  for (const tier of ['day', 'week', 'month', 'year']) {
    const limit = keepLimits[tier];
    for (const [key, bucketScreenshots] of Object.entries(buckets[tier])) {
      // Sort by created_at ASC (oldest first) to spread retention across the bucket
      const sorted = bucketScreenshots.sort((a, b) => 
        new Date(a.created_at) - new Date(b.created_at)
      );
      
      // Keep evenly distributed screenshots from the bucket
      if (sorted.length <= limit) {
        // Keep all
        sorted.forEach(s => toKeep.add(s.id));
      } else {
        // Keep evenly distributed samples
        const step = sorted.length / limit;
        for (let i = 0; i < limit; i++) {
          const index = Math.floor(i * step);
          toKeep.add(sorted[index].id);
        }
      }
    }
  }

  // Mark screenshots not in toKeep for deletion
  for (const screenshot of remaining) {
    if (!toKeep.has(screenshot.id) && !toDelete.includes(screenshot.id)) {
      toDelete.push(screenshot.id);
    }
  }

  return toDelete;
}

/**
 * Delete screenshot files from disk
 */
async function deleteScreenshotFiles(screenshot) {
  const filePath = path.join(SCREENSHOTS_DIR, screenshot.file_path);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Cleanup: Could not delete screenshot file: ${err.message}`);
    }
  }

  if (screenshot.thumbnail_path) {
    const thumbnailPath = path.join(SCREENSHOTS_DIR, screenshot.thumbnail_path);
    try {
      await fs.unlink(thumbnailPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`Cleanup: Could not delete thumbnail file: ${err.message}`);
      }
    }
  }
}

/**
 * Run cleanup for all users with retention enabled
 */
async function runCleanup() {
  console.log('Cleanup: Starting retention cleanup job...');
  const now = new Date();
  let totalDeleted = 0;
  let pagesProcessed = 0;

  try {
    // Get all users with retention enabled
    const [usersWithRetention] = await db.query(`
      SELECT us.*, u.email 
      FROM user_settings us
      JOIN users u ON us.user_id = u.id
      WHERE us.retention_enabled = TRUE
    `);

    if (usersWithRetention.length === 0) {
      console.log('Cleanup: No users have retention enabled, skipping');
      return { pagesProcessed: 0, screenshotsDeleted: 0 };
    }

    console.log(`Cleanup: Found ${usersWithRetention.length} users with retention enabled`);

    for (const userSettings of usersWithRetention) {
      // Get all pages for this user
      const [pages] = await db.query(`
        SELECT p.id, p.name, s.name as site_name
        FROM pages p
        JOIN sites s ON p.site_id = s.id
        WHERE s.user_id = ?
      `, [userSettings.user_id]);

      for (const page of pages) {
        // Get all screenshots for this page, ordered by created_at DESC
        const [screenshots] = await db.query(`
          SELECT id, file_path, thumbnail_path, created_at
          FROM screenshots
          WHERE page_id = ?
          ORDER BY created_at DESC
        `, [page.id]);

        if (screenshots.length === 0) {
          continue;
        }

        // Apply retention policy
        const toDeleteIds = applyRetentionPolicy(screenshots, userSettings, now);

        if (toDeleteIds.length === 0) {
          continue;
        }

        console.log(`Cleanup: Page "${page.name}" (${page.site_name}) - deleting ${toDeleteIds.length} of ${screenshots.length} screenshots`);

        // Get full screenshot data for file deletion
        const [screenshotsToDelete] = await db.query(`
          SELECT id, file_path, thumbnail_path
          FROM screenshots
          WHERE id IN (${toDeleteIds.map(() => '?').join(',')})
        `, toDeleteIds);

        // Delete files
        for (const screenshot of screenshotsToDelete) {
          await deleteScreenshotFiles(screenshot);
        }

        // Delete database records
        await db.query(`
          DELETE FROM screenshots
          WHERE id IN (${toDeleteIds.map(() => '?').join(',')})
        `, toDeleteIds);

        totalDeleted += toDeleteIds.length;
        pagesProcessed++;
      }
    }

    console.log(`Cleanup: Completed - processed ${pagesProcessed} pages, deleted ${totalDeleted} screenshots`);
    return { pagesProcessed, screenshotsDeleted: totalDeleted };

  } catch (error) {
    console.error('Cleanup: Error during retention cleanup:', error);
    throw error;
  }
}

module.exports = {
  runCleanup,
  applyRetentionPolicy,
  getBucketKey
};
