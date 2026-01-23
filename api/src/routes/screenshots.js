const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const sharp = require('sharp');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Delete multiple screenshots (screenshot set) - must be before /:id routes
router.delete('/batch', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    // Verify ownership of all screenshots
    const placeholders = ids.map(() => '?').join(',');
    const [screenshots] = await db.query(
      `SELECT sc.* FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id IN (${placeholders}) AND s.user_id = ?`,
      [...ids, req.user.id]
    );

    if (screenshots.length === 0) {
      return res.status(404).json({ error: 'No screenshots found' });
    }

    // Delete files for each screenshot
    for (const screenshot of screenshots) {
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
    }

    // Delete database records
    const deletedIds = screenshots.map(s => s.id);
    const deletePlaceholders = deletedIds.map(() => '?').join(',');
    await db.query(`DELETE FROM screenshots WHERE id IN (${deletePlaceholders})`, deletedIds);

    res.json({ 
      message: 'Screenshots deleted successfully',
      deletedCount: deletedIds.length
    });
  } catch (error) {
    console.error('Delete screenshots batch error:', error);
    res.status(500).json({ error: 'Failed to delete screenshots' });
  }
});

// Get screenshot metadata (includes error counts)
router.get('/:id', async (req, res) => {
  try {
    const [screenshots] = await db.query(
      `SELECT sc.*,
              COALESCE(error_counts.js_error_count, 0) as js_error_count,
              COALESCE(error_counts.network_error_count, 0) as network_error_count
       FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       LEFT JOIN (
         SELECT screenshot_id,
                SUM(CASE WHEN error_type = 'js' THEN 1 ELSE 0 END) as js_error_count,
                SUM(CASE WHEN error_type = 'network' THEN 1 ELSE 0 END) as network_error_count
         FROM screenshot_errors
         GROUP BY screenshot_id
       ) error_counts ON sc.id = error_counts.screenshot_id
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

// Get errors for a screenshot
router.get('/:id/errors', async (req, res) => {
  try {
    // Verify ownership first
    const [screenshots] = await db.query(
      `SELECT sc.id FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (screenshots.length === 0) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    // Get all errors for this screenshot
    const [errors] = await db.query(
      `SELECT id, error_type, message, source, line_number, column_number, stack,
              request_url, request_method, status_code, resource_type, created_at
       FROM screenshot_errors
       WHERE screenshot_id = ?
       ORDER BY error_type ASC, id ASC`,
      [req.params.id]
    );

    // Group errors by type
    const jsErrors = errors.filter(e => e.error_type === 'js').map(e => ({
      id: e.id,
      message: e.message,
      source: e.source,
      lineNumber: e.line_number,
      columnNumber: e.column_number,
      stack: e.stack,
      createdAt: e.created_at
    }));

    const networkErrors = errors.filter(e => e.error_type === 'network').map(e => ({
      id: e.id,
      message: e.message,
      requestUrl: e.request_url,
      requestMethod: e.request_method,
      statusCode: e.status_code,
      resourceType: e.resource_type,
      createdAt: e.created_at
    }));

    res.json({
      jsErrors,
      networkErrors,
      totalErrors: errors.length
    });
  } catch (error) {
    console.error('Get screenshot errors:', error);
    res.status(500).json({ error: 'Failed to get screenshot errors' });
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

// Compare two screenshots and generate diff image
router.get('/:id/compare/:otherId', async (req, res) => {
  try {
    const { id, otherId } = req.params;
    
    // Fetch both screenshots, ensuring they belong to the same page and user
    const [screenshots] = await db.query(
      `SELECT sc.*, p.id as page_id FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id IN (?, ?) AND s.user_id = ?`,
      [id, otherId, req.user.id]
    );

    if (screenshots.length !== 2) {
      return res.status(404).json({ error: 'One or both screenshots not found' });
    }

    const screenshot1 = screenshots.find(s => s.id === parseInt(id));
    const screenshot2 = screenshots.find(s => s.id === parseInt(otherId));

    // Verify both screenshots belong to the same page
    if (screenshot1.page_id !== screenshot2.page_id) {
      return res.status(400).json({ error: 'Screenshots must belong to the same page' });
    }

    // Load both images
    const filePath1 = path.join(__dirname, '../../screenshots', screenshot1.file_path);
    const filePath2 = path.join(__dirname, '../../screenshots', screenshot2.file_path);

    try {
      await fs.access(filePath1);
      await fs.access(filePath2);
    } catch {
      return res.status(404).json({ error: 'Screenshot files not found' });
    }

    // Read and decode PNG images using sharp for consistent handling
    // Then convert to raw pixel data for pixelmatch
    const img1Buffer = await fs.readFile(filePath1);
    const img2Buffer = await fs.readFile(filePath2);

    // Get image metadata
    const img1Meta = await sharp(img1Buffer).metadata();
    const img2Meta = await sharp(img2Buffer).metadata();

    // Determine target dimensions (use the smaller of each dimension)
    const targetWidth = Math.min(img1Meta.width, img2Meta.width);
    const targetHeight = Math.min(img1Meta.height, img2Meta.height);

    // Resize images to match dimensions and get raw RGBA pixel data
    const img1Raw = await sharp(img1Buffer)
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'top' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const img2Raw = await sharp(img2Buffer)
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'top' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Create output buffer for diff
    const diffBuffer = Buffer.alloc(targetWidth * targetHeight * 4);

    // Run pixelmatch comparison
    const numDiffPixels = pixelmatch(
      img1Raw,
      img2Raw,
      diffBuffer,
      targetWidth,
      targetHeight,
      { 
        threshold: 0.1,
        includeAA: true,
        alpha: 0.1,
        diffColor: [255, 0, 128], // Magenta for differences
        diffColorAlt: [0, 255, 128] // Cyan for anti-aliased
      }
    );

    // Calculate diff percentage
    const totalPixels = targetWidth * targetHeight;
    const diffPercentage = ((numDiffPixels / totalPixels) * 100).toFixed(2);

    // Convert raw buffer back to PNG using sharp
    const diffPng = await sharp(diffBuffer, {
      raw: {
        width: targetWidth,
        height: targetHeight,
        channels: 4
      }
    }).png().toBuffer();

    // Set headers with diff statistics
    res.set({
      'Content-Type': 'image/png',
      'X-Diff-Pixels': numDiffPixels.toString(),
      'X-Diff-Percentage': diffPercentage,
      'X-Diff-Width': targetWidth.toString(),
      'X-Diff-Height': targetHeight.toString(),
      'Access-Control-Expose-Headers': 'X-Diff-Pixels, X-Diff-Percentage, X-Diff-Width, X-Diff-Height'
    });

    res.send(diffPng);
  } catch (error) {
    console.error('Compare screenshots error:', error);
    res.status(500).json({ error: 'Failed to compare screenshots' });
  }
});

// Get comparison stats without generating full diff image
router.get('/:id/compare/:otherId/stats', async (req, res) => {
  try {
    const { id, otherId } = req.params;
    
    // Fetch both screenshots
    const [screenshots] = await db.query(
      `SELECT sc.*, p.id as page_id FROM screenshots sc
       JOIN pages p ON sc.page_id = p.id
       JOIN sites s ON p.site_id = s.id
       WHERE sc.id IN (?, ?) AND s.user_id = ?`,
      [id, otherId, req.user.id]
    );

    if (screenshots.length !== 2) {
      return res.status(404).json({ error: 'One or both screenshots not found' });
    }

    const screenshot1 = screenshots.find(s => s.id === parseInt(id));
    const screenshot2 = screenshots.find(s => s.id === parseInt(otherId));

    if (screenshot1.page_id !== screenshot2.page_id) {
      return res.status(400).json({ error: 'Screenshots must belong to the same page' });
    }

    // Load and compare images
    const filePath1 = path.join(__dirname, '../../screenshots', screenshot1.file_path);
    const filePath2 = path.join(__dirname, '../../screenshots', screenshot2.file_path);

    const img1Buffer = await fs.readFile(filePath1);
    const img2Buffer = await fs.readFile(filePath2);

    const img1Meta = await sharp(img1Buffer).metadata();
    const img2Meta = await sharp(img2Buffer).metadata();

    const targetWidth = Math.min(img1Meta.width, img2Meta.width);
    const targetHeight = Math.min(img1Meta.height, img2Meta.height);

    const img1Raw = await sharp(img1Buffer)
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'top' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const img2Raw = await sharp(img2Buffer)
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'top' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const diffBuffer = Buffer.alloc(targetWidth * targetHeight * 4);

    const numDiffPixels = pixelmatch(
      img1Raw,
      img2Raw,
      diffBuffer,
      targetWidth,
      targetHeight,
      { threshold: 0.1, includeAA: true }
    );

    const totalPixels = targetWidth * targetHeight;
    const diffPercentage = ((numDiffPixels / totalPixels) * 100).toFixed(2);

    res.json({
      diffPixels: numDiffPixels,
      diffPercentage: parseFloat(diffPercentage),
      totalPixels,
      width: targetWidth,
      height: targetHeight,
      screenshot1: {
        id: screenshot1.id,
        created_at: screenshot1.created_at,
        viewport: screenshot1.viewport
      },
      screenshot2: {
        id: screenshot2.id,
        created_at: screenshot2.created_at,
        viewport: screenshot2.viewport
      }
    });
  } catch (error) {
    console.error('Get comparison stats error:', error);
    res.status(500).json({ error: 'Failed to get comparison stats' });
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
