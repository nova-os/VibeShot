const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get screenshot metadata
router.get('/:id', async (req, res) => {
  try {
    const [screenshots] = await db.query(
      `SELECT sc.* FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (screenshots.length === 0) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    res.json(screenshots[0]);
  } catch (error) {
    console.error('Get screenshot error:', error);
    res.status(500).json({ error: 'Failed to get screenshot' });
  }
});

// Serve screenshot image
router.get('/:id/image', async (req, res) => {
  try {
    const [screenshots] = await db.query(
      `SELECT sc.* FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (screenshots.length === 0) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    const screenshot = screenshots[0];
    const filePath = path.join(__dirname, '../../screenshots', screenshot.file_path);

    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch {
      res.status(404).json({ error: 'Screenshot file not found' });
    }
  } catch (error) {
    console.error('Get screenshot image error:', error);
    res.status(500).json({ error: 'Failed to get screenshot image' });
  }
});

// Serve thumbnail
router.get('/:id/thumbnail', async (req, res) => {
  try {
    const [screenshots] = await db.query(
      `SELECT sc.* FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (screenshots.length === 0) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    const screenshot = screenshots[0];
    
    if (!screenshot.thumbnail_path) {
      return res.status(404).json({ error: 'Thumbnail not available' });
    }

    const filePath = path.join(__dirname, '../../screenshots', screenshot.thumbnail_path);

    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch {
      res.status(404).json({ error: 'Thumbnail file not found' });
    }
  } catch (error) {
    console.error('Get thumbnail error:', error);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// Delete screenshot
router.delete('/:id', async (req, res) => {
  try {
    const [screenshots] = await db.query(
      `SELECT sc.* FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (screenshots.length === 0) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    const screenshot = screenshots[0];

    // Delete files
    const screenshotPath = path.join(__dirname, '../../screenshots', screenshot.file_path);
    try {
      await fs.unlink(screenshotPath);
    } catch (err) {
      console.warn('Could not delete screenshot file:', err.message);
    }

    if (screenshot.thumbnail_path) {
      const thumbnailPath = path.join(__dirname, '../../screenshots', screenshot.thumbnail_path);
      try {
        await fs.unlink(thumbnailPath);
      } catch (err) {
        console.warn('Could not delete thumbnail file:', err.message);
      }
    }

    // Delete database record
    await db.query('DELETE FROM screenshots WHERE id = ?', [req.params.id]);

    res.json({ message: 'Screenshot deleted successfully' });
  } catch (error) {
    console.error('Delete screenshot error:', error);
    res.status(500).json({ error: 'Failed to delete screenshot' });
  }
});

module.exports = router;
