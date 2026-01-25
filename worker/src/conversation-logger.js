const db = require('./config/database');

// Max length for current_step column (VARCHAR(100) in database)
const MAX_CURRENT_STEP_LENGTH = 100;

/**
 * Truncate current_step to fit database column
 */
function truncateCurrentStep(step) {
  if (!step) return step;
  if (step.length <= MAX_CURRENT_STEP_LENGTH) return step;
  return step.slice(0, MAX_CURRENT_STEP_LENGTH - 3) + '...';
}

/**
 * Create a new conversation record at the start of generation
 * @param {object} options - Create options
 * @param {string} options.contextType - 'instruction' or 'test'
 * @param {number} options.pageId - page_id (null if unknown)
 * @param {string} options.pageUrl - URL of the page
 * @param {string} options.prompt - User's prompt
 * @param {string} options.systemPromptType - Type of system prompt used
 * @param {string} options.modelName - Name of the AI model
 * @returns {number} The ID of the created conversation record
 */
async function createConversation({ contextType, pageId = null, pageUrl, prompt, systemPromptType, modelName }) {
  try {
    const [result] = await db.query(`
      INSERT INTO ai_conversations (
        context_type,
        page_id,
        page_url,
        prompt,
        system_prompt_type,
        status,
        current_step,
        messages,
        model_name
      ) VALUES (?, ?, ?, ?, ?, 'in_progress', 'Starting generation...', '[]', ?)
    `, [
      contextType,
      pageId,
      pageUrl || '',
      prompt || '',
      systemPromptType || 'unknown',
      modelName || 'unknown'
    ]);

    console.log(`ConversationLogger: Created conversation ${result.insertId} (${contextType})`);
    return result.insertId;
  } catch (error) {
    console.error('ConversationLogger: Failed to create conversation:', error.message);
    return null;
  }
}

/**
 * Add a message to an existing conversation (live update)
 * @param {number} conversationId - The conversation record ID
 * @param {object} message - The message to add
 * @param {string} currentStep - Description of current step for UI
 */
async function addMessage(conversationId, message, currentStep = null) {
  if (!conversationId) return;
  
  try {
    // Use JSON_ARRAY_APPEND to add message to the array
    let query = `
      UPDATE ai_conversations 
      SET messages = JSON_ARRAY_APPEND(messages, '$', CAST(? AS JSON)),
          total_tool_calls = total_tool_calls + ?
    `;
    const params = [JSON.stringify(message), message.type === 'tool_call' ? 1 : 0];
    
    if (currentStep) {
      query += `, current_step = ?`;
      params.push(truncateCurrentStep(currentStep));
    }
    
    query += ` WHERE id = ?`;
    params.push(conversationId);
    
    await db.query(query, params);
  } catch (error) {
    console.error('ConversationLogger: Failed to add message:', error.message);
  }
}

/**
 * Complete a conversation with final results
 * @param {number} conversationId - The conversation record ID
 * @param {object} result - The final result
 * @param {boolean} result.success - Whether generation succeeded
 * @param {string} result.scriptType - 'eval' or 'actions'
 * @param {string} result.script - The generated script
 * @param {string} result.explanation - Explanation of the script
 * @param {string} result.error - Error message if failed
 * @param {number} result.durationMs - Total duration in milliseconds
 */
async function completeConversation(conversationId, result) {
  if (!conversationId) return;
  
  try {
    const currentStep = result.success ? 'Generation complete' : 'Generation failed';
    await db.query(`
      UPDATE ai_conversations 
      SET status = ?,
          current_step = ?,
          success = ?,
          script_type = ?,
          generated_script = ?,
          explanation = ?,
          error_message = ?,
          duration_ms = ?
      WHERE id = ?
    `, [
      result.success ? 'completed' : 'failed',
      truncateCurrentStep(currentStep),
      result.success ? 1 : 0,
      result.scriptType || null,
      result.script || null,
      result.explanation || null,
      result.error || null,
      result.durationMs || null,
      conversationId
    ]);
    
    console.log(`ConversationLogger: Completed conversation ${conversationId} (success=${result.success})`);
  } catch (error) {
    console.error('ConversationLogger: Failed to complete conversation:', error.message);
  }
}

/**
 * Save an AI conversation log to the database (legacy - saves all at once)
 * @param {object} options - Save options
 * @param {string} options.contextType - 'instruction' or 'test'
 * @param {number} options.contextId - instruction_id or test_id (null if creation failed)
 * @param {number} options.pageId - page_id (null if unknown)
 * @param {object} options.conversationLog - The conversation log from Gemini
 * @returns {number} The ID of the saved conversation record
 */
async function saveConversation({ contextType, contextId = null, pageId = null, conversationLog }) {
  try {
    const currentStep = conversationLog.success ? 'Generation complete' : 'Generation failed';
    const [result] = await db.query(`
      INSERT INTO ai_conversations (
        context_type,
        context_id,
        page_id,
        page_url,
        prompt,
        system_prompt_type,
        status,
        current_step,
        success,
        script_type,
        generated_script,
        explanation,
        error_message,
        messages,
        model_name,
        total_tool_calls,
        duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contextType,
      contextId,
      pageId,
      conversationLog.pageUrl || '',
      conversationLog.prompt || '',
      conversationLog.systemPromptType || 'unknown',
      conversationLog.success ? 'completed' : 'failed',
      truncateCurrentStep(currentStep),
      conversationLog.success ? 1 : 0,
      conversationLog.scriptType || null,
      conversationLog.script || null,
      conversationLog.explanation || null,
      conversationLog.error || null,
      JSON.stringify(conversationLog.messages || []),
      conversationLog.modelName || 'unknown',
      conversationLog.totalToolCalls || 0,
      conversationLog.durationMs || null
    ]);

    console.log(`ConversationLogger: Saved conversation ${result.insertId} (${contextType}, success=${conversationLog.success})`);
    return result.insertId;
  } catch (error) {
    console.error('ConversationLogger: Failed to save conversation:', error.message);
    // Don't throw - logging failures shouldn't break the main flow
    return null;
  }
}

/**
 * Update the context_id of a conversation after the instruction/test is created
 * @param {number} conversationId - The conversation record ID
 * @param {number} contextId - The instruction_id or test_id
 */
async function updateConversationContext(conversationId, contextId) {
  if (!conversationId) return;
  
  try {
    await db.query(
      'UPDATE ai_conversations SET context_id = ? WHERE id = ?',
      [contextId, conversationId]
    );
  } catch (error) {
    console.error('ConversationLogger: Failed to update context:', error.message);
  }
}

/**
 * Get conversations for debugging
 * @param {object} options - Query options
 * @param {string} options.contextType - Filter by 'instruction' or 'test'
 * @param {number} options.contextId - Filter by context ID
 * @param {number} options.pageId - Filter by page ID
 * @param {boolean} options.onlyFailed - Only return failed conversations
 * @param {number} options.limit - Max records to return
 * @returns {Array} Conversation records
 */
async function getConversations({ contextType, contextId, pageId, onlyFailed = false, limit = 50 } = {}) {
  let query = 'SELECT * FROM ai_conversations WHERE 1=1';
  const params = [];

  if (contextType) {
    query += ' AND context_type = ?';
    params.push(contextType);
  }
  if (contextId) {
    query += ' AND context_id = ?';
    params.push(contextId);
  }
  if (pageId) {
    query += ' AND page_id = ?';
    params.push(pageId);
  }
  if (onlyFailed) {
    query += ' AND success = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const [rows] = await db.query(query, params);
  
  // Parse JSON messages
  return rows.map(row => ({
    ...row,
    messages: JSON.parse(row.messages || '[]')
  }));
}

module.exports = {
  createConversation,
  addMessage,
  completeConversation,
  saveConversation,
  updateConversationContext,
  getConversations
};
