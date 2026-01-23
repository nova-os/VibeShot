const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Worker API URL for script generation
const WORKER_API_URL = process.env.WORKER_API_URL || 'http://worker:3001';

// All routes require authentication
router.use(authenticateToken);

// Helper function to verify page ownership
async function verifyPageOwnership(pageId, userId) {
  const [pages] = await db.query(
    `SELECT p.* FROM pages p
     JOIN sites s ON p.site_id = s.id
     WHERE p.id = ? AND s.user_id = ?`,
    [pageId, userId]
  );
  return pages[0] || null;
}

// Helper function to call worker API
async function callWorkerApi(endpoint, body) {
  const response = await fetch(`${WORKER_API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

/**
 * Fetch page title from a URL using a simple HTTP request
 * @param {string} url - The URL to fetch
 * @returns {Promise<string|null>} The page title or null if not found
 */
async function fetchPageTitle(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    
    // Extract title from HTML using regex (simple approach without DOM parser)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      // Decode HTML entities
      const decoded = title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
      
      if (decoded.length > 0 && decoded.length <= 255) {
        return decoded;
      }
    }
    return null;
  } catch (error) {
    console.log(`Failed to fetch page title for ${url}:`, error.message);
    return null;
  }
}

// Fetch page title from URL (for previewing before creating)
router.post('/resolve-title', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const title = await fetchPageTitle(url);
    
    if (!title) {
      return res.status(404).json({ error: 'Could not fetch page title' });
    }

    res.json({ title });
  } catch (error) {
    console.error('Resolve title error:', error);
    res.status(500).json({ error: 'Failed to resolve page title' });
  }
});

// Batch delete pages (must be before /:id routes)
router.delete('/batch', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    // Verify ownership of all pages
    const placeholders = ids.map(() => '?').join(',');
    const [pages] = await db.query(
      `SELECT p.* FROM pages p
       JOIN sites s ON p.site_id = s.id
       WHERE p.id IN (${placeholders}) AND s.user_id = ?`,
      [...ids, req.user.id]
    );

    if (pages.length === 0) {
      return res.status(404).json({ error: 'No pages found' });
    }

    // Delete all verified pages (cascade will handle screenshots and instructions)
    const deletedIds = pages.map(p => p.id);
    const deletePlaceholders = deletedIds.map(() => '?').join(',');
    await db.query(`DELETE FROM pages WHERE id IN (${deletePlaceholders})`, deletedIds);

    res.json({ 
      message: 'Pages deleted successfully',
      deletedCount: deletedIds.length
    });
  } catch (error) {
    console.error('Delete pages batch error:', error);
    res.status(500).json({ error: 'Failed to delete pages' });
  }
});

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

    const page = pages[0];
    // Parse viewports if it's a string
    if (page.viewports && typeof page.viewports === 'string') {
      page.viewports = JSON.parse(page.viewports);
    }

    res.json(page);
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({ error: 'Failed to get page' });
  }
});

// Update page
router.put('/:id', async (req, res) => {
  try {
    const { url, name, interval_minutes, viewports, is_active } = req.body;

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

    // Build dynamic update query to handle null values explicitly
    const updates = [];
    const values = [];

    if (url !== undefined) {
      updates.push('url = ?');
      values.push(url);
    }
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    // interval_minutes can be null (use defaults) or a number
    if (interval_minutes !== undefined) {
      updates.push('interval_minutes = ?');
      values.push(interval_minutes);
    }
    // viewports can be null (use defaults) or an array
    if (viewports !== undefined) {
      updates.push('viewports = ?');
      values.push(viewports ? JSON.stringify(viewports) : null);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length > 0) {
      values.push(req.params.id);
      await db.query(
        `UPDATE pages SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    const [pages] = await db.query('SELECT * FROM pages WHERE id = ?', [req.params.id]);
    
    // Parse viewports if it's a string
    const page = pages[0];
    if (page.viewports && typeof page.viewports === 'string') {
      page.viewports = JSON.parse(page.viewports);
    }
    
    res.json(page);
  } catch (error) {
    console.error('Update page error:', error);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// Resolve page title from URL
router.post('/:id/resolve-title', async (req, res) => {
  try {
    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const title = await fetchPageTitle(page.url);
    
    if (!title) {
      return res.status(404).json({ error: 'Could not fetch page title' });
    }

    // Update the page name
    await db.query('UPDATE pages SET name = ? WHERE id = ?', [title, page.id]);

    // Return the updated page
    const [pages] = await db.query('SELECT * FROM pages WHERE id = ?', [page.id]);
    const updatedPage = pages[0];
    
    // Parse viewports if it's a string
    if (updatedPage.viewports && typeof updatedPage.viewports === 'string') {
      updatedPage.viewports = JSON.parse(updatedPage.viewports);
    }

    res.json(updatedPage);
  } catch (error) {
    console.error('Resolve title error:', error);
    res.status(500).json({ error: 'Failed to resolve page title' });
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

    // Check if there's already a pending or capturing job for this page
    const [existingJobs] = await db.query(
      `SELECT id FROM capture_jobs 
       WHERE page_id = ? AND status IN ('pending', 'capturing')`,
      [req.params.id]
    );

    if (existingJobs.length > 0) {
      return res.json({ 
        message: 'Capture already in progress',
        jobId: existingJobs[0].id 
      });
    }

    // Create a pending capture job
    const [jobResult] = await db.query(
      `INSERT INTO capture_jobs (page_id, status) VALUES (?, 'pending')`,
      [req.params.id]
    );

    // Set last_screenshot_at to null to trigger immediate capture by worker
    await db.query(
      'UPDATE pages SET last_screenshot_at = NULL WHERE id = ?',
      [req.params.id]
    );

    res.json({ 
      message: 'Screenshot capture scheduled',
      jobId: jobResult.insertId 
    });
  } catch (error) {
    console.error('Trigger capture error:', error);
    res.status(500).json({ error: 'Failed to trigger capture' });
  }
});

// Get capture status for a page
router.get('/:id/capture-status', async (req, res) => {
  try {
    // Verify ownership
    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get the latest capture job for this page
    const [jobs] = await db.query(
      `SELECT id, status, current_viewport, viewports_completed, viewports_total, 
              error_message, started_at, completed_at, created_at
       FROM capture_jobs 
       WHERE page_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [req.params.id]
    );

    if (jobs.length === 0) {
      return res.json({ job: null });
    }

    res.json({ job: jobs[0] });
  } catch (error) {
    console.error('Get capture status error:', error);
    res.status(500).json({ error: 'Failed to get capture status' });
  }
});

// ============================================
// INSTRUCTIONS ROUTES
// ============================================

// Get instructions for a page
router.get('/:id/instructions', async (req, res) => {
  try {
    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const [instructions] = await db.query(
      `SELECT * FROM instructions WHERE page_id = ? ORDER BY execution_order ASC`,
      [req.params.id]
    );

    res.json(instructions);
  } catch (error) {
    console.error('Get instructions error:', error);
    res.status(500).json({ error: 'Failed to get instructions' });
  }
});

// Create instruction for a page
router.post('/:id/instructions', async (req, res) => {
  try {
    const { name, prompt, viewport } = req.body;

    if (!name || !prompt) {
      return res.status(400).json({ error: 'Name and prompt are required' });
    }

    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get the next execution order
    const [maxOrder] = await db.query(
      'SELECT MAX(execution_order) as max_order FROM instructions WHERE page_id = ?',
      [req.params.id]
    );
    const nextOrder = (maxOrder[0].max_order || 0) + 1;

    // Call worker to generate script
    console.log(`Generating script for page ${page.url} with prompt: "${prompt}"`);
    
    let script = null;
    let generationError = null;

    try {
      const result = await callWorkerApi('/generate-script', {
        pageUrl: page.url,
        prompt,
        viewport: viewport || 'desktop'
      });

      if (result.success) {
        script = result.script;
      } else {
        generationError = result.error;
        console.error('Script generation failed:', result.error);
      }
    } catch (err) {
      generationError = err.message;
      console.error('Worker API call failed:', err.message);
    }

    // Insert instruction (even if script generation failed - user can regenerate)
    const [insertResult] = await db.query(
      `INSERT INTO instructions (page_id, name, prompt, script, execution_order)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, name, prompt, script, nextOrder]
    );

    const [instructions] = await db.query(
      'SELECT * FROM instructions WHERE id = ?',
      [insertResult.insertId]
    );

    const response = instructions[0];
    if (generationError) {
      response.generationError = generationError;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('Create instruction error:', error);
    res.status(500).json({ error: 'Failed to create instruction' });
  }
});

// Reorder instructions (MUST be before /:instructionId routes to avoid matching "reorder" as an ID)
router.put('/:id/instructions/reorder', async (req, res) => {
  try {
    const { instructionIds } = req.body;

    if (!Array.isArray(instructionIds)) {
      return res.status(400).json({ error: 'instructionIds must be an array' });
    }

    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Update execution_order for each instruction
    for (let i = 0; i < instructionIds.length; i++) {
      await db.query(
        'UPDATE instructions SET execution_order = ? WHERE id = ? AND page_id = ?',
        [i, instructionIds[i], req.params.id]
      );
    }

    const [instructions] = await db.query(
      'SELECT * FROM instructions WHERE page_id = ? ORDER BY execution_order ASC',
      [req.params.id]
    );

    res.json(instructions);
  } catch (error) {
    console.error('Reorder instructions error:', error);
    res.status(500).json({ error: 'Failed to reorder instructions' });
  }
});

// Update instruction
router.put('/:id/instructions/:instructionId', async (req, res) => {
  try {
    const { name, prompt, is_active, script } = req.body;

    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Verify instruction belongs to this page
    const [existing] = await db.query(
      'SELECT * FROM instructions WHERE id = ? AND page_id = ?',
      [req.params.instructionId, req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Instruction not found' });
    }

    await db.query(
      `UPDATE instructions SET 
        name = COALESCE(?, name),
        prompt = COALESCE(?, prompt),
        is_active = COALESCE(?, is_active),
        script = COALESCE(?, script)
       WHERE id = ?`,
      [name, prompt, is_active, script, req.params.instructionId]
    );

    const [instructions] = await db.query(
      'SELECT * FROM instructions WHERE id = ?',
      [req.params.instructionId]
    );

    res.json(instructions[0]);
  } catch (error) {
    console.error('Update instruction error:', error);
    res.status(500).json({ error: 'Failed to update instruction' });
  }
});

// Delete instruction
router.delete('/:id/instructions/:instructionId', async (req, res) => {
  try {
    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Verify instruction belongs to this page
    const [existing] = await db.query(
      'SELECT * FROM instructions WHERE id = ? AND page_id = ?',
      [req.params.instructionId, req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Instruction not found' });
    }

    await db.query('DELETE FROM instructions WHERE id = ?', [req.params.instructionId]);
    res.json({ message: 'Instruction deleted successfully' });
  } catch (error) {
    console.error('Delete instruction error:', error);
    res.status(500).json({ error: 'Failed to delete instruction' });
  }
});

// Regenerate script for instruction
router.post('/:id/instructions/:instructionId/regenerate', async (req, res) => {
  try {
    const { viewport } = req.body;

    const page = await verifyPageOwnership(req.params.id, req.user.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get the instruction
    const [instructions] = await db.query(
      'SELECT * FROM instructions WHERE id = ? AND page_id = ?',
      [req.params.instructionId, req.params.id]
    );

    if (instructions.length === 0) {
      return res.status(404).json({ error: 'Instruction not found' });
    }

    const instruction = instructions[0];

    // Call worker to regenerate script
    console.log(`Regenerating script for instruction ${instruction.id}`);
    
    try {
      const result = await callWorkerApi('/generate-script', {
        pageUrl: page.url,
        prompt: instruction.prompt,
        viewport: viewport || 'desktop'
      });

      if (result.success) {
        await db.query(
          'UPDATE instructions SET script = ? WHERE id = ?',
          [result.script, req.params.instructionId]
        );

        const [updated] = await db.query(
          'SELECT * FROM instructions WHERE id = ?',
          [req.params.instructionId]
        );

        res.json(updated[0]);
      } else {
        res.status(500).json({ error: 'Script generation failed: ' + result.error });
      }
    } catch (err) {
      res.status(500).json({ error: 'Worker API call failed: ' + err.message });
    }
  } catch (error) {
    console.error('Regenerate instruction error:', error);
    res.status(500).json({ error: 'Failed to regenerate instruction' });
  }
});

module.exports = router;
