const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * Helper function to verify session ownership via instruction or test
 * Returns the session if found and owned by the user, null otherwise
 */
async function verifySessionOwnership(sessionId, userId) {
  const [sessions] = await db.query(
    `SELECT s.* FROM ai_sessions s
     LEFT JOIN instructions i ON s.type = 'instruction' AND s.target_id = i.id
     LEFT JOIN tests t ON s.type = 'test' AND s.target_id = t.id
     LEFT JOIN pages pi ON i.page_id = pi.id
     LEFT JOIN pages pt ON t.page_id = pt.id
     LEFT JOIN sites si ON pi.site_id = si.id
     LEFT JOIN sites st ON pt.site_id = st.id
     WHERE s.id = ? AND (si.user_id = ? OR st.user_id = ?)`,
    [sessionId, userId, userId]
  );
  return sessions[0] || null;
}

// Get latest AI session for a target (instruction or test)
router.get('/latest/:type/:targetId', async (req, res) => {
  try {
    const { type, targetId } = req.params;
    
    if (!['instruction', 'test'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be "instruction" or "test"' });
    }

    // Find the latest session for this target and verify ownership
    const [sessions] = await db.query(
      `SELECT s.* FROM ai_sessions s
       LEFT JOIN instructions i ON s.type = 'instruction' AND s.target_id = i.id
       LEFT JOIN tests t ON s.type = 'test' AND s.target_id = t.id
       LEFT JOIN pages pi ON i.page_id = pi.id
       LEFT JOIN pages pt ON t.page_id = pt.id
       LEFT JOIN sites si ON pi.site_id = si.id
       LEFT JOIN sites st ON pt.site_id = st.id
       WHERE s.type = ? AND s.target_id = ? AND (si.user_id = ? OR st.user_id = ?)
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [type, targetId, req.user.id, req.user.id]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'No session found for this target' });
    }

    res.json(sessions[0]);
  } catch (error) {
    console.error('Get latest AI session error:', error);
    res.status(500).json({ error: 'Failed to get latest AI session' });
  }
});

// Get AI session by ID
router.get('/:id', async (req, res) => {
  try {
    const session = await verifySessionOwnership(req.params.id, req.user.id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Get AI session error:', error);
    res.status(500).json({ error: 'Failed to get AI session' });
  }
});

// Get messages for an AI session (supports polling with ?after=lastId)
router.get('/:id/messages', async (req, res) => {
  try {
    const session = await verifySessionOwnership(req.params.id, req.user.id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const afterId = parseInt(req.query.after) || 0;
    
    // Fetch messages after the specified ID
    const [messages] = await db.query(
      `SELECT id, session_id, role, content, tool_name, created_at
       FROM ai_messages
       WHERE session_id = ? AND id > ?
       ORDER BY id ASC`,
      [req.params.id, afterId]
    );

    // Also return the current session status for polling convenience
    res.json({
      messages,
      session: {
        id: session.id,
        status: session.status,
        error_message: session.error_message,
        completed_at: session.completed_at
      }
    });
  } catch (error) {
    console.error('Get AI messages error:', error);
    res.status(500).json({ error: 'Failed to get AI messages' });
  }
});

module.exports = router;
