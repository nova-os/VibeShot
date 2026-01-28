const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ACTION_SCHEMAS, validateActionSequence } = require('./action-executor');
const db = require('./config/database');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Log an AI message to the database
 * @param {number|null} sessionId - AI session ID (null if not tracking)
 * @param {string} role - Message role: 'system', 'user', 'assistant', 'tool_call', 'tool_result'
 * @param {string} content - Message content
 * @param {string|null} toolName - Tool name (for tool_call and tool_result)
 */
async function logAiMessage(sessionId, role, content, toolName = null) {
  if (!sessionId) return;
  
  try {
    await db.query(
      `INSERT INTO ai_messages (session_id, role, content, tool_name) VALUES (?, ?, ?, ?)`,
      [sessionId, role, content, toolName]
    );
  } catch (error) {
    console.error('Failed to log AI message:', error.message);
  }
}

/**
 * Update AI session status
 * @param {number|null} sessionId - AI session ID
 * @param {string} status - New status: 'pending', 'running', 'completed', 'failed'
 * @param {string|null} errorMessage - Error message (for failed status)
 */
async function updateSessionStatus(sessionId, status, errorMessage = null) {
  if (!sessionId) return;
  
  try {
    const completedAt = (status === 'completed' || status === 'failed') ? new Date() : null;
    await db.query(
      `UPDATE ai_sessions SET status = ?, error_message = ?, completed_at = ? WHERE id = ?`,
      [status, errorMessage, completedAt, sessionId]
    );
  } catch (error) {
    console.error('Failed to update AI session status:', error.message);
  }
}

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY not set. Script generation will not work.');
}

// Initialize Gemini client
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Generate documentation for action DSL from schemas
function generateActionDocs() {
  const docs = Object.entries(ACTION_SCHEMAS).map(([name, schema]) => {
    const required = schema.required.length > 0 ? schema.required.join(', ') : 'none';
    const optional = schema.optional.length > 0 ? schema.optional.join(', ') : 'none';
    return `  - ${name}: required=[${required}], optional=[${optional}]`;
  }).join('\n');
  return docs;
}

// Tool definitions for Gemini (exploration tools only - output is via text response)
const tools = [
  {
    name: 'getAccessibilityTree',
    description: 'Get the accessibility tree of the current page. Returns a structured representation of all accessible elements including their roles, names, and states. Use this to understand the page structure and find elements.',
  },
  {
    name: 'querySelector',
    description: 'Check if a CSS selector matches any elements on the page. Returns the count of matching elements and details about the first match.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'The CSS selector to test (e.g., "#menu-button", ".nav-toggle", "[aria-label=Menu]")'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'getElementDetails',
    description: 'Get detailed information about elements matching a CSS selector, including attributes, text content, and bounding box.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'The CSS selector to query'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'getClickableElements',
    description: 'List all clickable and interactive elements on the page (buttons, links, inputs, elements with click handlers). Returns their selectors, text, and roles.',
  }
];

// Convert tools to Gemini format (exploration tools only)
const geminiTools = [{
  functionDeclarations: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} }
  }))
}];

// Common prompt building blocks
const PROMPT_TOOLS = `You have tools to explore the page:
- getAccessibilityTree: See the full page structure
- querySelector: Test if a CSS selector works
- getElementDetails: Get info about specific elements
- getClickableElements: Find all interactive elements`;

const PROMPT_PROCESS_ACTION = `Process:
1. First, understand what the user wants to do
2. Use tools to explore the page and find the right elements
3. Test selectors to make sure they work
4. When ready, output the final result directly (not via a tool call)`;

const PROMPT_PROCESS_TEST = `Process:
1. First, understand what the user wants to test/verify
2. Use tools to explore the page and find the relevant elements
3. Test selectors to make sure they work
4. When ready, output the final result directly (not via a tool call)`;

const PROMPT_SELECTOR_GUIDELINE = `- Use robust selectors (prefer IDs, data attributes, or aria labels over classes)`;

const PROMPT_EVAL_RESTRICTIONS = `- Do NOT use setTimeout or async operations - the script should be synchronous
- Do NOT make fetch requests or load external resources
- Do NOT use alert, confirm, or prompt`;

const PROMPT_ACTION_GUIDELINES = `- Add waitForSelector before interacting with elements that may not be immediately present
- Use waitForNavigation after clicks that trigger page loads
- Add descriptive labels to steps for debugging
- Use appropriate timeouts (default is usually fine)
- For forms: use type for text inputs, select for dropdowns, click for checkboxes/buttons`;


const PROMPT_ASSERTION_ACTIONS = `Assertion actions for tests:
- assertSelector: Check if element exists, is visible, or has specific count
- assertText: Check element text content (exact or contains)
- assertUrl: Check current URL matches pattern
- assertTitle: Check page title matches pattern
- assert: Run custom JavaScript assertion that returns { passed: boolean, message: string }`;

const ROLE_ACTIONS_EVAL_MODE = `
You are an expert at web automation and DOM manipulation. 
Your task is to generate JavaScript code that performs a specific action on a webpage.
`.replace(/\n/g, ' ');

const ROLE_ACTIONS_ACTION_MODE = `
You are an Software Engineer specialized in writing browser automation scripts for web applications. 
Your task is to generate a browser automation script using a predefined actions DSL for browser automation.
`.replace(/\n/g, ' ');

const ROLE_TESTS_EVAL_MODE = `
You are an Software Engineer specialized in writing automated tests for web applications in javascript. 
For defining the test cases, you are using javascript code. 
Your task is to generate JavaScript test code that verifies conditions on a webpage.
`.replace(/\n/g, ' ');

const ROLE_TESTS_ACTION_MODE = `
You are an Software Engineer specialized in writing automated tests for web applications. 
For defining the test cases, you are using a predefined actions DSL for browser automation. 
Your task is to generate a sequence of actions that performs a test case by defining a workflow on a webpage.
`.replace(/\n/g, ' ');

// System prompt for simple script generation (instructions/actions - eval mode)
const SYSTEM_PROMPT_ACTIONS_EVAL_MODE = `${ROLE_ACTIONS_EVAL_MODE}

${PROMPT_TOOLS}

${PROMPT_PROCESS_ACTION}

Guidelines for the generated script:
${PROMPT_SELECTOR_GUIDELINE}
- Handle the case where elements might not exist
- Use click(), focus(), or other standard DOM methods
- Keep the script simple and focused on the task
- Do not use :text or :contains in selectors.
${PROMPT_EVAL_RESTRICTIONS}

IMPORTANT: When you are ready to provide the final script, output it using these XML tags:

<script>
// your JavaScript code here
</script>

<explanation>Brief explanation of what the script does</explanation>

Example output:

<script>
const element = document.querySelector('#menu-toggle');
if (element) {
  element.click();
}
</script>

<explanation>Clicks the menu toggle button if it exists</explanation>`;

// System prompt for action DSL generation (complex multi-step instructions)
const SYSTEM_PROMT_ACTIONS_ACTION_MODE = `${ROLE_ACTIONS_ACTION_MODE}

${PROMPT_TOOLS}

Available action types:
${generateActionDocs()}

${PROMPT_PROCESS_ACTION}

Guidelines for action sequences:
${PROMPT_SELECTOR_GUIDELINE}
${PROMPT_ACTION_GUIDELINES}
- Even for simple single actions, use the action sequence format
- Do not use :text or :contains in selectors.

IMPORTANT: When you are ready to provide the final action sequence, output it as a JSON object with this exact format:
\`\`\`json
{
  "steps": [...],
  "explanation": "Brief explanation of what the action sequence does"
}
\`\`\`

Example output for a login flow:
\`\`\`json
{
  "steps": [
    { "action": "waitForSelector", "selector": "#username", "label": "Wait for login form" },
    { "action": "type", "selector": "#username", "text": "testuser", "label": "Enter username" },
    { "action": "type", "selector": "#password", "text": "password123", "label": "Enter password" },
    { "action": "click", "selector": "#login-button", "label": "Click login" },
    { "action": "waitForNavigation", "waitUntil": "networkidle2", "label": "Wait for redirect" },
    { "action": "waitForSelector", "selector": ".dashboard", "label": "Verify dashboard loaded" }
  ],
  "explanation": "Logs in with test credentials and waits for dashboard"
}
\`\`\`

Example output for a simple click:
\`\`\`json
{
  "steps": [
    { "action": "waitForSelector", "selector": "#menu-toggle", "label": "Wait for menu button" },
    { "action": "click", "selector": "#menu-toggle", "label": "Click menu toggle" }
  ],
  "explanation": "Clicks the menu toggle button"
}
\`\`\``;

// System prompt for action DSL test generation
const SYSTEM_PROMPT_TESTS_ACTION_MODE = `${ROLE_TESTS_ACTION_MODE}

${PROMPT_TOOLS}

Available action types:
${generateActionDocs()}

${PROMPT_ASSERTION_ACTIONS}

${PROMPT_PROCESS_TEST}

Guidelines for test action sequences:
- Always use the action sequence format, even for simple single assertions
- Start with setup steps if needed (navigate, click, fill forms)
- End with assertion steps to verify the expected state
- Add descriptive labels to all steps for debugging
- Include meaningful error messages in assertions
- Use multiple assertions to verify different aspects
- Do not use :text or :contains in selectors.

IMPORTANT: When you are ready to provide the final test action sequence, output it as a JSON object with this exact format:
\`\`\`json
{
  "steps": [...],
  "explanation": "Brief explanation of what the test verifies"
}
\`\`\`

Example output for verifying login:
\`\`\`json
{
  "steps": [
    { "action": "type", "selector": "#username", "text": "testuser", "label": "Enter username" },
    { "action": "type", "selector": "#password", "text": "password123", "label": "Enter password" },
    { "action": "click", "selector": "#login-button", "label": "Click login" },
    { "action": "waitForNavigation", "label": "Wait for redirect" },
    { "action": "assertUrl", "pattern": "/dashboard", "message": "Should redirect to dashboard" },
    { "action": "assertSelector", "selector": ".welcome-message", "visible": true, "message": "Welcome message should be visible" },
    { "action": "assertText", "selector": ".user-name", "text": "testuser", "message": "Username should be displayed" }
  ],
  "explanation": "Tests the login flow and verifies dashboard redirect"
}
\`\`\`

Example output for a simple element check:
\`\`\`json
{
  "steps": [
    { "action": "assertSelector", "selector": "#main-navigation", "visible": true, "label": "Check navigation exists", "message": "Main navigation should be visible" },
    { "action": "assertText", "selector": "h1", "text": "Welcome", "contains": true, "label": "Check page title", "message": "Page should have welcome heading" }
  ],
  "explanation": "Verifies the navigation and welcome heading are present"
}
\`\`\``;

// System prompt for test generation (assertions)
const SYTEM_PROMT_TESTS_EVAL_MODE = `
${ROLE_TESTS_EVAL_MODE}

${PROMPT_TOOLS}

${PROMPT_PROCESS_TEST}

CRITICAL: The generated script MUST return an object with this exact structure:
{ passed: boolean, message: string }

Guidelines for the generated test script:
${PROMPT_SELECTOR_GUIDELINE}
- ALWAYS return { passed: true/false, message: "..." }
- Provide helpful, descriptive failure messages that explain what was expected vs what was found
- Check for element existence before accessing properties
- Keep the test focused on a single assertion or related group of assertions
${PROMPT_EVAL_RESTRICTIONS}
- Do not use :text or :contains in selectors.
- Wrap the entire script in an IIFE that returns the result

IMPORTANT: When you are ready to provide the final test script, output it using these XML tags:

<script>
// your JavaScript test code here
</script>

<explanation>Brief explanation of what the test verifies</explanation>

Example output for checking if element exists:

<script>
(function() {
  const element = document.querySelector('#login-button');
  if (!element) {
    return { passed: false, message: 'Login button not found on page' };
  }
  return { passed: true, message: 'Login button exists' };
})();
</script>

<explanation>Checks if the login button exists on the page</explanation>

Example output for checking element text content:

<script>
(function() {
  const header = document.querySelector('h1');
  if (!header) {
    return { passed: false, message: 'No h1 element found on page' };
  }
  const text = header.textContent.trim();
  const expected = 'Welcome';
  if (text.includes(expected)) {
    return { passed: true, message: 'Header contains expected text: "' + expected + '"' };
  }
  return { passed: false, message: 'Header text mismatch. Expected to contain: "' + expected + '", but found: "' + text + '"' };
})();
</script>

<explanation>Verifies that the h1 header contains 'Welcome'</explanation>
`;

/**
 * Execute a tool call using the Puppeteer page
 * @param {Page} page - Puppeteer page instance
 * @param {string} toolName - Name of the tool to execute
 * @param {object} args - Tool arguments
 * @returns {object} Tool result
 */
async function executeTool(page, toolName, args = {}) {
  switch (toolName) {
    case 'getAccessibilityTree':
      return await getAccessibilityTree(page);
    
    case 'querySelector':
      return await testSelector(page, args.selector);
    
    case 'getElementDetails':
      return await getElementDetails(page, args.selector);
    
    case 'getClickableElements':
      return await getClickableElements(page);
    
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Parse the final script output from the model's text response
 * @param {string} text - The model's text response
 * @param {string} expectedType - 'eval' for script or 'actions' for action sequences
 * @returns {object|null} Parsed result or null if not found
 */
function parseScriptFromText(text, expectedType) {
  // For eval mode, try XML tags first: <script>...</script> and <explanation>...</explanation>
  if (expectedType === 'eval') {
    const scriptMatch = text.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const script = scriptMatch[1].trim();
      const explanationMatch = text.match(/<explanation>([\s\S]*?)<\/explanation>/);
      const explanation = explanationMatch ? explanationMatch[1].trim() : 'Generated script';
      return {
        script,
        scriptType: 'eval',
        explanation
      };
    }
  }
  
  // For actions mode (or fallback), try JSON in code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      
      // Check if it's an action sequence (has steps array)
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return {
          script: JSON.stringify({ steps: parsed.steps }, null, 2),
          scriptType: 'actions',
          explanation: parsed.explanation || 'Generated action sequence'
        };
      }
      
      // Fallback: Check if it's an eval script (has script field) - for backwards compatibility
      if (parsed.script) {
        return {
          script: parsed.script,
          scriptType: 'eval',
          explanation: parsed.explanation || 'Generated script'
        };
      }
    } catch (e) {
      // JSON parse failed, continue to try other methods
    }
  }
  
  // Try to find raw JSON object (without code blocks)
  const jsonMatch = text.match(/\{[\s\S]*"(?:script|steps)"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return {
          script: JSON.stringify({ steps: parsed.steps }, null, 2),
          scriptType: 'actions',
          explanation: parsed.explanation || 'Generated action sequence'
        };
      }
      
      if (parsed.script) {
        return {
          script: parsed.script,
          scriptType: 'eval',
          explanation: parsed.explanation || 'Generated script'
        };
      }
    } catch (e) {
      // JSON parse failed
    }
  }
  
  return null;
}

/**
 * Get accessibility tree from page
 */
async function getAccessibilityTree(page) {
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    return { accessibilityTree: simplifyA11yTree(snapshot) };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Simplify accessibility tree for better readability
 */
function simplifyA11yTree(node, depth = 0) {
  if (!node) return null;
  if (depth > 5) return { truncated: true }; // Limit depth
  
  const result = {
    role: node.role,
    name: node.name || undefined,
  };
  
  if (node.children && node.children.length > 0) {
    result.children = node.children
      .map(child => simplifyA11yTree(child, depth + 1))
      .filter(Boolean)
      .slice(0, 20); // Limit children
  }
  
  return result;
}

/**
 * Test if a selector matches elements
 */
async function testSelector(page, selector) {
  try {
    const result = await page.evaluate((sel) => {
      const elements = document.querySelectorAll(sel);
      if (elements.length === 0) {
        return { matches: 0 };
      }
      
      const first = elements[0];
      return {
        matches: elements.length,
        firstElement: {
          tagName: first.tagName.toLowerCase(),
          id: first.id || undefined,
          className: first.className || undefined,
          textContent: (first.textContent || '').trim().slice(0, 100),
          isVisible: first.offsetParent !== null
        }
      };
    }, selector);
    return result;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get detailed info about elements matching selector
 */
async function getElementDetails(page, selector) {
  try {
    const result = await page.evaluate((sel) => {
      const elements = document.querySelectorAll(sel);
      return Array.from(elements).slice(0, 5).map(el => {
        const rect = el.getBoundingClientRect();
        const attrs = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return {
          tagName: el.tagName.toLowerCase(),
          attributes: attrs,
          textContent: (el.textContent || '').trim().slice(0, 200),
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          isVisible: el.offsetParent !== null && rect.width > 0 && rect.height > 0
        };
      });
    }, selector);
    return { elements: result, count: result.length };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get all clickable/interactive elements
 */
async function getClickableElements(page) {
  try {
    const result = await page.evaluate(() => {
      const interactive = [];
      const selectors = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])'
      ];
      
      const seen = new Set();
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          seen.add(el);
          
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (el.offsetParent === null && el.tagName !== 'BODY') continue;
          
          // Generate a unique selector for this element
          let uniqueSelector = '';
          if (el.id) {
            uniqueSelector = `#${el.id}`;
          } else if (el.getAttribute('data-testid')) {
            uniqueSelector = `[data-testid="${el.getAttribute('data-testid')}"]`;
          } else if (el.getAttribute('aria-label')) {
            uniqueSelector = `[aria-label="${el.getAttribute('aria-label')}"]`;
          } else if (el.name) {
            uniqueSelector = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
          } else {
            // Fallback to class-based selector
            const tag = el.tagName.toLowerCase();
            const classes = Array.from(el.classList).slice(0, 2).join('.');
            uniqueSelector = classes ? `${tag}.${classes}` : tag;
          }
          
          interactive.push({
            selector: uniqueSelector,
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || undefined,
            text: (el.textContent || el.value || '').trim().slice(0, 50),
            ariaLabel: el.getAttribute('aria-label') || undefined
          });
          
          if (interactive.length >= 30) break;
        }
        if (interactive.length >= 30) break;
      }
      
      return interactive;
    });
    return { clickableElements: result, count: result.length };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Internal function to generate script with specified system prompt
 * @param {Page} page - Puppeteer page instance
 * @param {string} prompt - User's natural language instruction
 * @param {string} pageUrl - URL of the page (for context)
 * @param {string} systemPrompt - The system prompt to use
 * @param {string} taskDescription - Description for the initial message
 * @param {string} expectedType - Expected output type: 'eval' or 'actions'
 * @param {number|null} sessionId - AI session ID for logging (optional)
 * @returns {object} Generated script or error
 */
async function generateScriptWithPrompt(page, prompt, pageUrl, systemPrompt, taskDescription, expectedType = 'eval', sessionId = null) {
  if (!genAI) {
    await updateSessionStatus(sessionId, 'failed', 'Gemini API key not configured');
    return { error: 'Gemini API key not configured' };
  }

  try {
    // Mark session as running
    await updateSessionStatus(sessionId, 'running');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      tools: geminiTools,
      systemInstruction: systemPrompt
    });

    // Start conversation with context
    const chat = model.startChat({
      history: []
    });

    // Log the system prompt
    await logAiMessage(sessionId, 'system', systemPrompt);

    // Log the initial user prompt
    const initialMessage = `${prompt}`;
    await logAiMessage(sessionId, 'user', initialMessage);

    // Initial message with the task
    let response = await chat.sendMessage(initialMessage);
    
    // Track validation retry attempts (max 3)
    let validationRetries = 0;
    const MAX_VALIDATION_RETRIES = 3;

    // Tool use loop (max 20 iterations to prevent infinite loops)
    for (let i = 0; i < 20; i++) {
      const candidate = response.response.candidates?.[0];
      if (!candidate) {
        const errorMsg = 'No response candidate from Gemini API';
        await updateSessionStatus(sessionId, 'failed', errorMsg);
        return { error: errorMsg };
      }
      
      const content = candidate.content;
      if (!content || !content.parts || !Array.isArray(content.parts)) {
        // This can happen if content was blocked or the response is malformed
        const finishReason = candidate.finishReason;
        const errorMsg = `Invalid response structure from Gemini API (finishReason: ${finishReason})`;
        await updateSessionStatus(sessionId, 'failed', errorMsg);
        return { error: errorMsg };
      }
      
      // Check if there are function calls
      const functionCalls = [];
      let textContent = '';
      for (const part of content.parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
        if (part.text) {
          textContent += part.text;
        }
      }

      // If there's text content, try to parse it as a final script output
      if (textContent) {
        const parsedScript = parseScriptFromText(textContent, expectedType);
        if (parsedScript) {
          // Log the assistant response
          await logAiMessage(sessionId, 'assistant', textContent);
          
          // Validate action sequences before returning
          if (parsedScript.scriptType === 'actions') {
            try {
              const actionSequence = JSON.parse(parsedScript.script);
              const validation = validateActionSequence(actionSequence);
              
              if (!validation.valid) {
                validationRetries++;
                console.log(`Action sequence validation failed (attempt ${validationRetries}/${MAX_VALIDATION_RETRIES}):`, validation.errors);
                
                if (validationRetries >= MAX_VALIDATION_RETRIES) {
                  const errorMsg = `Action sequence validation failed after ${MAX_VALIDATION_RETRIES} attempts. Errors: ${validation.errors.join('; ')}`;
                  await updateSessionStatus(sessionId, 'failed', errorMsg);
                  return { error: errorMsg };
                }
                
                // Send validation errors back to the model
                const errorMessage = `The action sequence has validation errors. Please fix them and output a corrected version:\n\n${validation.errors.map(e => `- ${e}`).join('\n')}`;
                await logAiMessage(sessionId, 'user', errorMessage);
                response = await chat.sendMessage(errorMessage);
                continue; // Continue the loop to get corrected output
              }
            } catch (parseError) {
              validationRetries++;
              console.log(`Action sequence JSON parse error (attempt ${validationRetries}/${MAX_VALIDATION_RETRIES}):`, parseError.message);
              
              if (validationRetries >= MAX_VALIDATION_RETRIES) {
                const errorMsg = `Action sequence JSON parsing failed after ${MAX_VALIDATION_RETRIES} attempts: ${parseError.message}`;
                await updateSessionStatus(sessionId, 'failed', errorMsg);
                return { error: errorMsg };
              }
              
              // JSON parse error - ask model to fix
              const errorMessage = `The action sequence JSON is malformed and cannot be parsed: ${parseError.message}\n\nPlease output a valid JSON action sequence.`;
              await logAiMessage(sessionId, 'user', errorMessage);
              response = await chat.sendMessage(errorMessage);
              continue; // Continue the loop to get corrected output
            }
          }
          
          // Validation passed or not needed (eval mode)
          await updateSessionStatus(sessionId, 'completed');
          return parsedScript;
        }
      }

      if (functionCalls.length === 0) {
        // No function calls and no valid script in text - this is an error
        const errorMsg = 'No script generated. Model response: ' + (textContent || 'empty');
        await logAiMessage(sessionId, 'assistant', textContent || 'No response');
        await updateSessionStatus(sessionId, 'failed', errorMsg);
        return { error: errorMsg };
      }

      // Execute function calls (exploration tools only)
      const functionResponses = [];
      for (const call of functionCalls) {
        console.log(`Gemini tool call: ${call.name}`, call.args);
        
        // Log the tool call
        await logAiMessage(sessionId, 'tool_call', JSON.stringify(call.args || {}), call.name);
        
        const result = await executeTool(page, call.name, call.args || {});
        
        // Log the tool result
        await logAiMessage(sessionId, 'tool_result', JSON.stringify(result), call.name);
        
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: result
          }
        });
      }

      // Send function results back to Gemini
      response = await chat.sendMessage(functionResponses);
    }

    const errorMsg = 'Max iterations reached without generating a script';
    await updateSessionStatus(sessionId, 'failed', errorMsg);
    return { error: errorMsg };

  } catch (error) {
    console.error('Gemini error:', error);
    await updateSessionStatus(sessionId, 'failed', error.message);
    return { error: error.message };
  }
}

/**
 * Generate an action script using Gemini with tool use (simple eval mode)
 * @param {Page} page - Puppeteer page instance
 * @param {string} prompt - User's natural language instruction
 * @param {string} pageUrl - URL of the page (for context)
 * @param {number|null} sessionId - AI session ID for logging (optional)
 * @returns {object} Generated script or error
 */
async function generateScript(page, prompt, pageUrl, sessionId = null) {
  return generateScriptWithPrompt(
    page, 
    prompt, 
    pageUrl, 
    SYSTEM_PROMPT_ACTIONS_EVAL_MODE, 
    'User instruction',
    'eval',  // Expect eval script output
    sessionId
  );
}

/**
 * Generate a test script using Gemini with tool use (simple eval mode)
 * @param {Page} page - Puppeteer page instance
 * @param {string} prompt - User's natural language test description
 * @param {string} pageUrl - URL of the page (for context)
 * @param {number|null} sessionId - AI session ID for logging (optional)
 * @returns {object} Generated test script or error
 */
async function generateTestScript(page, prompt, pageUrl, sessionId = null) {
  return generateScriptWithPrompt(
    page, 
    prompt, 
    pageUrl, 
    SYTEM_PROMT_TESTS_EVAL_MODE, 
    'Test to verify',
    'eval',  // Expect eval script output
    sessionId
  );
}

/**
 * Generate an action script using action DSL mode (always produces action sequences)
 * @param {Page} page - Puppeteer page instance
 * @param {string} prompt - User's natural language instruction
 * @param {string} pageUrl - URL of the page (for context)
 * @param {number|null} sessionId - AI session ID for logging (optional)
 * @returns {object} Generated script with scriptType 'actions'
 */
async function generateActionScript(page, prompt, pageUrl, sessionId = null) {
  return generateScriptWithPrompt(
    page, 
    prompt, 
    pageUrl, 
    SYSTEM_PROMT_ACTIONS_ACTION_MODE, 
    'User instruction',
    'actions',  // Expect action sequence output
    sessionId
  );
}

/**
 * Generate a test script using action DSL mode (always produces action sequences)
 * @param {Page} page - Puppeteer page instance
 * @param {string} prompt - User's natural language test description
 * @param {string} pageUrl - URL of the page (for context)
 * @param {number|null} sessionId - AI session ID for logging (optional)
 * @returns {object} Generated script with scriptType 'actions'
 */
async function generateActionTestScript(page, prompt, pageUrl, sessionId = null) {
  return generateScriptWithPrompt(
    page, 
    prompt, 
    pageUrl, 
    SYSTEM_PROMPT_TESTS_ACTION_MODE, 
    'Test to verify',
    'actions',  // Expect action sequence output
    sessionId
  );
}

module.exports = {
  generateScript,
  generateTestScript,
  generateActionScript,
  generateActionTestScript,
  executeTool,
  tools
};
