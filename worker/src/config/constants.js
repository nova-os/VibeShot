/**
 * Default Constants for VibeShot Worker
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

// Standard viewport size configurations (width x height)
const VIEWPORT_SIZES = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 }
};

// Retry settings for failed captures
const RETRY_SETTINGS = {
  BASE_RETRY_DELAY_MINUTES: 5,      // Initial retry delay after first failure
  MAX_CONSECUTIVE_FAILURES: 5,       // Stop retrying after this many consecutive failures
  STALE_JOB_TIMEOUT_MINUTES: 10     // Consider "capturing" jobs stale after this long
};

module.exports = {
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_VIEWPORTS,
  VIEWPORT_SIZES,
  RETRY_SETTINGS
};
