const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Default settings values
const DEFAULT_INTERVAL_MINUTES = 1440; // 24 hours
const DEFAULT_VIEWPORTS = [1920, 768, 375];

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
      default_viewports: viewports
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update user settings
router.put('/', async (req, res) => {
  try {
    const { default_interval_minutes, default_viewports } = req.body;

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
    } else {
      // Update existing settings
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

      if (updates.length > 0) {
        values.push(req.user.id);
        await db.query(
          `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`,
          values
        );
      }
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
      default_viewports: viewports
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
