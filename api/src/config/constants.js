/**
 * Default Constants for VibeShot API
 * 
 * These are system-wide defaults used when no user/site/page settings override them.
 * 
 * Cascade order (highest to lowest priority):
 *   1. Page settings (if set)
 *   2. Site settings (if set)
 *   3. User settings (if set)
 *   4. System defaults (this file)
 */

// Default capture interval in minutes (24 hours)
const DEFAULT_INTERVAL_MINUTES = 1440;

// Default viewport widths for screenshot capture [desktop, tablet, mobile]
const DEFAULT_VIEWPORTS = [1920, 768, 375];

// Default retention settings (GFS-style backup rotation)
const DEFAULT_RETENTION = {
  retention_enabled: false,
  max_screenshots_per_page: null,    // Hard limit per page (null = unlimited)
  keep_per_day: 4,                   // Keep 4 per day for first week
  keep_per_week: 2,                  // Keep 2 per week for first month
  keep_per_month: 1,                 // Keep 1 per month for first year
  keep_per_year: 1,                  // Keep 1 per year for older
  max_age_days: null                 // Delete after X days (null = unlimited)
};

module.exports = {
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_VIEWPORTS,
  DEFAULT_RETENTION
};
