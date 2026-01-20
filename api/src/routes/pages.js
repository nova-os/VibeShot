const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get single page
router.get('/:id', async (req, res) => {
  try {
    const [pages] = await db.query(
      `SELECT p.* FROM pages p
       JOIN sites s ON p.site_id = s.id
       WHERE p.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (pages.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json(pages[0]);
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({ error: 'Failed to get page' });
  }
});

// Update page
router.put('/:id', async (req, res) => {
  try {
    const { url, name, interval_minutes, is_active } = req.body;

    // Verify ownership
    const [existing] = await db.query(
      `SELECT p.* FROM pages p
       JOIN sites s ON p.site_id = s.id
       WHERE p.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    await db.query(
      `UPDATE pages SET 
        url = COALESCE(?, url),
        name = COALESCE(?, name),
        interval_minutes = COALESCE(?, interval_minutes),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [url, name, interval_minutes, is_active, req.params.id]
    );

    const [pages] = await db.query('SELECT * FROM pages WHERE id = ?', [req.params.id]);
    res.json(pages[0]);
  } catch (error) {
    console.error('Update page error:', error);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// Delete page
router.delete('/:id', async (req, res) => {
  try {
    // Verify ownership
    const [existing] = await db.query(
      `SELECT p.* FROM pages p
       JOIN sites s ON p.site_id = s.id
       WHERE p.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    await db.query('DELETE FROM pages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Delete page error:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// Get screenshots for a page
router.get('/:id/screenshots', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const viewport = req.query.viewport; // Optional viewport filter

    // Verify ownership
    const [pages] = await db.query(
      `SELECT p.* FROM pages p
       JOIN sites s ON p.site_id = s.id
       WHERE p.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (pages.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Build query with optional viewport filter
    let screenshotsQuery = `SELECT * FROM screenshots WHERE page_id = ?`;
    let countQuery = `SELECT COUNT(*) as total FROM screenshots WHERE page_id = ?`;
    const queryParams = [req.params.id];
    const countParams = [req.params.id];

    if (viewport) {
      screenshotsQuery += ` AND viewport = ?`;
      countQuery += ` AND viewport = ?`;
      queryParams.push(viewport);
      countParams.push(viewport);
    }

    screenshotsQuery += ` ORDER BY created_at DESC, viewport ASC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const [screenshots] = await db.query(screenshotsQuery, queryParams);
    const [countResult] = await db.query(countQuery, countParams);

    res.json({
      screenshots,
      total: countResult[0].total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get screenshots error:', error);
    res.status(500).json({ error: 'Failed to get screenshots' });
  }
});

// Trigger immediate capture
router.post('/:id/capture', async (req, res) => {
  try {
    // Verify ownership
    const [pages] = await db.query(
      `SELECT p.* FROM pages p
       JOIN sites s ON p.site_id = s.id
       WHERE p.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (pages.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Set last_screenshot_at to null to trigger immediate capture by worker
    await db.query(
      'UPDATE pages SET last_screenshot_at = NULL WHERE id = ?',
      [req.params.id]
    );

    res.json({ message: 'Screenshot capture scheduled' });
  } catch (error) {
    console.error('Trigger capture error:', error);
    res.status(500).json({ error: 'Failed to trigger capture' });
  }
});

module.exports = router;
