const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const WORKER_URL = process.env.WORKER_URL || 'http://worker:3001';

// All routes require authentication
router.use(authenticateToken);

// Get all sites for user
router.get('/', async (req, res) => {
  try {
    const [sites] = await db.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM pages WHERE site_id = s.id) as page_count,
        (SELECT COUNT(*) FROM screenshots sc 
         JOIN pages p ON sc.page_id = p.id 
         WHERE p.site_id = s.id) as screenshot_count
       FROM sites s 
       WHERE s.user_id = ? 
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json(sites);
  } catch (error) {
    console.error('Get sites error:', error);
    res.status(500).json({ error: 'Failed to get sites' });
  }
});

// Get single site
router.get('/:id', async (req, res) => {
  try {
    const [sites] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (sites.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json(sites[0]);
  } catch (error) {
    console.error('Get site error:', error);
    res.status(500).json({ error: 'Failed to get site' });
  }
});

// Create new site
router.post('/', async (req, res) => {
  try {
    const { name, domain } = req.body;

    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    const [result] = await db.query(
      'INSERT INTO sites (user_id, name, domain) VALUES (?, ?, ?)',
      [req.user.id, name, domain]
    );

    const [sites] = await db.query('SELECT * FROM sites WHERE id = ?', [result.insertId]);
    res.status(201).json(sites[0]);
  } catch (error) {
    console.error('Create site error:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// Update site
router.put('/:id', async (req, res) => {
  try {
    const { name, domain } = req.body;

    // Verify ownership
    const [existing] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    await db.query(
      'UPDATE sites SET name = COALESCE(?, name), domain = COALESCE(?, domain) WHERE id = ?',
      [name, domain, req.params.id]
    );

    const [sites] = await db.query('SELECT * FROM sites WHERE id = ?', [req.params.id]);
    res.json(sites[0]);
  } catch (error) {
    console.error('Update site error:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// Delete site
router.delete('/:id', async (req, res) => {
  try {
    // Verify ownership
    const [existing] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    await db.query('DELETE FROM sites WHERE id = ?', [req.params.id]);
    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    console.error('Delete site error:', error);
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// Get pages for a site
router.get('/:id/pages', async (req, res) => {
  try {
    // Verify ownership
    const [sites] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (sites.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const [pages] = await db.query(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM screenshots WHERE page_id = p.id) as screenshot_count,
        (SELECT created_at FROM screenshots WHERE page_id = p.id ORDER BY created_at DESC LIMIT 1) as latest_screenshot
       FROM pages p 
       WHERE p.site_id = ? 
       ORDER BY p.created_at DESC`,
      [req.params.id]
    );

    // Parse viewports JSON for each page
    for (const page of pages) {
      if (page.viewports && typeof page.viewports === 'string') {
        page.viewports = JSON.parse(page.viewports);
      }
    }

    res.json(pages);
  } catch (error) {
    console.error('Get pages error:', error);
    res.status(500).json({ error: 'Failed to get pages' });
  }
});

// Discover pages for a site using AI
router.post('/:id/discover-pages', async (req, res) => {
  try {
    const { maxPages = 10 } = req.body;

    // Verify ownership
    const [sites] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (sites.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const site = sites[0];

    // Call worker API to discover pages
    const response = await fetch(`${WORKER_URL}/discover-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        domain: site.domain,
        maxPages 
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return res.status(500).json({ 
        error: result.error || 'Failed to discover pages' 
      });
    }

    res.json({
      pages: result.pages,
      totalFound: result.totalFound
    });
  } catch (error) {
    console.error('Discover pages error:', error);
    res.status(500).json({ error: 'Failed to discover pages' });
  }
});

// Bulk create pages for a site
router.post('/:id/pages/bulk', async (req, res) => {
  try {
    const { pages } = req.body;

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'Pages array is required' });
    }

    // Verify ownership
    const [sites] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (sites.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Insert all pages (interval_minutes and viewports are null by default - uses user settings)
    const createdPages = [];
    for (const page of pages) {
      const { url, name, interval_minutes = null, viewports = null } = page;
      
      if (!url || !name) continue;

      const [result] = await db.query(
        'INSERT INTO pages (site_id, url, name, interval_minutes, viewports) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, url, name, interval_minutes, viewports ? JSON.stringify(viewports) : null]
      );

      const [newPages] = await db.query('SELECT * FROM pages WHERE id = ?', [result.insertId]);
      if (newPages.length > 0) {
        createdPages.push(newPages[0]);
      }
    }

    res.status(201).json({ 
      created: createdPages.length,
      pages: createdPages 
    });
  } catch (error) {
    console.error('Bulk create pages error:', error);
    res.status(500).json({ error: 'Failed to create pages' });
  }
});

// Create page for a site
router.post('/:id/pages', async (req, res) => {
  try {
    const { url, name, interval_minutes = null, viewports = null } = req.body;

    if (!url || !name) {
      return res.status(400).json({ error: 'URL and name are required' });
    }

    // Verify ownership
    const [sites] = await db.query(
      'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (sites.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const [result] = await db.query(
      'INSERT INTO pages (site_id, url, name, interval_minutes, viewports) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, url, name, interval_minutes, viewports ? JSON.stringify(viewports) : null]
    );

    const [pages] = await db.query('SELECT * FROM pages WHERE id = ?', [result.insertId]);
    res.status(201).json(pages[0]);
  } catch (error) {
    console.error('Create page error:', error);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

module.exports = router;
