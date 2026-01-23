const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Default settings values
const DEFAULT_INTERVAL_MINUTES = 1440; // 24 hours
const DEFAULT_VIEWPORTS = [1920, 768, 375];

// Default retention settings
const DEFAULT_RETENTION = {
  retention_enabled: false,
  max_screenshots_per_page: null,
  keep_per_day: 4,
  keep_per_week: 2,
  keep_per_month: 1,
  keep_per_year: 1,
  max_age_days: null
};

// Get user settings (creates defaults if not exists)
router.get('/', async (req, res) => {
  try {
    // Try to get existing settings
    let [settings] = await db.query(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    // If no settings exist, create defaults
    if (settings.length === 0) {
      await db.query(
        `INSERT INTO user_settings (user_id, default_interval_minutes, default_viewports) 
         VALUES (?, ?, ?)`,
        [req.user.id, DEFAULT_INTERVAL_MINUTES, JSON.stringify(DEFAULT_VIEWPORTS)]
      );

      [settings] = await db.query(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [req.user.id]
      );
    }

    const userSettings = settings[0];
    
    // Parse viewports JSON if it's a string
    let viewports = userSettings.default_viewports;
    if (typeof viewports === 'string') {
      viewports = JSON.parse(viewports);
    }

    res.json({
      default_interval_minutes: userSettings.default_interval_minutes,
      default_viewports: viewports,
      // Retention settings
      retention_enabled: Boolean(userSettings.retention_enabled),
      max_screenshots_per_page: userSettings.max_screenshots_per_page,
      keep_per_day: userSettings.keep_per_day ?? DEFAULT_RETENTION.keep_per_day,
      keep_per_week: userSettings.keep_per_week ?? DEFAULT_RETENTION.keep_per_week,
      keep_per_month: userSettings.keep_per_month ?? DEFAULT_RETENTION.keep_per_month,
      keep_per_year: userSettings.keep_per_year ?? DEFAULT_RETENTION.keep_per_year,
      max_age_days: userSettings.max_age_days
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update user settings
router.put('/', async (req, res) => {
  try {
    const { 
      default_interval_minutes, 
      default_viewports,
      // Retention settings
      retention_enabled,
      max_screenshots_per_page,
      keep_per_day,
      keep_per_week,
      keep_per_month,
      keep_per_year,
      max_age_days
    } = req.body;

    // Validate interval
    if (default_interval_minutes !== undefined) {
      if (!Number.isInteger(default_interval_minutes) || default_interval_minutes < 5) {
        return res.status(400).json({ error: 'Interval must be at least 5 minutes' });
      }
    }

    // Validate viewports
    if (default_viewports !== undefined) {
      if (!Array.isArray(default_viewports) || default_viewports.length === 0) {
        return res.status(400).json({ error: 'Viewports must be a non-empty array' });
      }
      for (const width of default_viewports) {
        if (!Number.isInteger(width) || width < 320 || width > 3840) {
          return res.status(400).json({ error: 'Viewport widths must be between 320 and 3840 pixels' });
        }
      }
    }

    // Validate retention settings
    if (max_screenshots_per_page !== undefined && max_screenshots_per_page !== null) {
      if (!Number.isInteger(max_screenshots_per_page) || max_screenshots_per_page < 1) {
        return res.status(400).json({ error: 'Max screenshots per page must be at least 1' });
      }
    }

    if (keep_per_day !== undefined) {
      if (!Number.isInteger(keep_per_day) || keep_per_day < 1) {
        return res.status(400).json({ error: 'Keep per day must be at least 1' });
      }
    }

    if (keep_per_week !== undefined) {
      if (!Number.isInteger(keep_per_week) || keep_per_week < 1) {
        return res.status(400).json({ error: 'Keep per week must be at least 1' });
      }
    }

    if (keep_per_month !== undefined) {
      if (!Number.isInteger(keep_per_month) || keep_per_month < 1) {
        return res.status(400).json({ error: 'Keep per month must be at least 1' });
      }
    }

    if (keep_per_year !== undefined) {
      if (!Number.isInteger(keep_per_year) || keep_per_year < 1) {
        return res.status(400).json({ error: 'Keep per year must be at least 1' });
      }
    }

    if (max_age_days !== undefined && max_age_days !== null) {
      if (!Number.isInteger(max_age_days) || max_age_days < 1) {
        return res.status(400).json({ error: 'Max age must be at least 1 day' });
      }
    }

    // Check if settings exist
    const [existing] = await db.query(
      'SELECT id FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    if (existing.length === 0) {
      // Create new settings
      await db.query(
        `INSERT INTO user_settings (user_id, default_interval_minutes, default_viewports) 
         VALUES (?, ?, ?)`,
        [
          req.user.id,
          default_interval_minutes || DEFAULT_INTERVAL_MINUTES,
          JSON.stringify(default_viewports || DEFAULT_VIEWPORTS)
        ]
      );
    }

    // Update settings (always do this, even after insert, to handle retention fields)
    const updates = [];
    const values = [];

    if (default_interval_minutes !== undefined) {
      updates.push('default_interval_minutes = ?');
      values.push(default_interval_minutes);
    }

    if (default_viewports !== undefined) {
      updates.push('default_viewports = ?');
      values.push(JSON.stringify(default_viewports));
    }

    // Retention settings
    if (retention_enabled !== undefined) {
      updates.push('retention_enabled = ?');
      values.push(retention_enabled ? 1 : 0);
    }

    if (max_screenshots_per_page !== undefined) {
      updates.push('max_screenshots_per_page = ?');
      values.push(max_screenshots_per_page);
    }

    if (keep_per_day !== undefined) {
      updates.push('keep_per_day = ?');
      values.push(keep_per_day);
    }

    if (keep_per_week !== undefined) {
      updates.push('keep_per_week = ?');
      values.push(keep_per_week);
    }

    if (keep_per_month !== undefined) {
      updates.push('keep_per_month = ?');
      values.push(keep_per_month);
    }

    if (keep_per_year !== undefined) {
      updates.push('keep_per_year = ?');
      values.push(keep_per_year);
    }

    if (max_age_days !== undefined) {
      updates.push('max_age_days = ?');
      values.push(max_age_days);
    }

    if (updates.length > 0) {
      values.push(req.user.id);
      await db.query(
        `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`,
        values
      );
    }

    // Return updated settings
    const [settings] = await db.query(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    const userSettings = settings[0];
    let viewports = userSettings.default_viewports;
    if (typeof viewports === 'string') {
      viewports = JSON.parse(viewports);
    }

    res.json({
      default_interval_minutes: userSettings.default_interval_minutes,
      default_viewports: viewports,
      // Retention settings
      retention_enabled: Boolean(userSettings.retention_enabled),
      max_screenshots_per_page: userSettings.max_screenshots_per_page,
      keep_per_day: userSettings.keep_per_day ?? DEFAULT_RETENTION.keep_per_day,
      keep_per_week: userSettings.keep_per_week ?? DEFAULT_RETENTION.keep_per_week,
      keep_per_month: userSettings.keep_per_month ?? DEFAULT_RETENTION.keep_per_month,
      keep_per_year: userSettings.keep_per_year ?? DEFAULT_RETENTION.keep_per_year,
      max_age_days: userSettings.max_age_days
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
