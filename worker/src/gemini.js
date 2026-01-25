const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ACTION_SCHEMAS } = require('./action-executor');
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

// Tool definitions for Gemini
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
  },
  {
    name: 'generateScript',
    description: 'Generate the final JavaScript code to execute on the page. Call this when you have determined the correct approach. The script will be executed in the browser context.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'The JavaScript code to execute. Use standard DOM APIs. The code runs in the page context with access to document, window, etc.'
        },
        explanation: {
          type: 'string',
          description: 'Brief explanation of what the script does'
        }
      },
      required: ['script', 'explanation']
    }
  },
  {
    name: 'generateActionSequence',
    description: 'Generate a sequence of Puppeteer actions for complex multi-step workflows that involve navigation, waiting, or multiple page interactions. Use this instead of generateScript when the task requires page navigation or complex async operations.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'Array of action objects. Each action has an "action" field and action-specific parameters.',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'Action type: click, type, clear, select, hover, focus, press, waitForSelector, waitForNavigation, waitForTimeout, waitForFunction, goto, goBack, goForward, reload, scroll, scrollToElement, evaluate, setViewport, assert, assertSelector, assertText, assertUrl, assertTitle'
              },
              label: {
                type: 'string',
                description: 'Optional human-readable label for this step'
              },
              selector: {
                type: 'string',
                description: 'CSS selector for element-based actions'
              },
              text: {
                type: 'string',
                description: 'Text to type or match'
              },
              value: {
                type: 'string',
                description: 'Value for select actions'
              },
              url: {
                type: 'string',
                description: 'URL for goto action'
              },
              script: {
                type: 'string',
                description: 'JavaScript code for evaluate/assert/waitForFunction actions'
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds'
              },
              ms: {
                type: 'number',
                description: 'Milliseconds to wait for waitForTimeout'
              },
              key: {
                type: 'string',
                description: 'Key to press for press action'
              },
              waitUntil: {
                type: 'string',
                description: 'Navigation wait condition: load, domcontentloaded, networkidle0, networkidle2'
              },
              visible: {
                type: 'boolean',
                description: 'Wait for element to be visible'
              },
              hidden: {
                type: 'boolean',
                description: 'Wait for element to be hidden'
              },
              pattern: {
                type: 'string',
                description: 'Pattern to match for URL/title assertions'
              },
              message: {
                type: 'string',
                description: 'Custom failure message for assertions'
              },
              exact: {
                type: 'boolean',
                description: 'Use exact matching instead of contains'
              },
              contains: {
                type: 'boolean',
                description: 'Use contains matching (default for text)'
              },
              count: {
                type: 'number',
                description: 'Expected element count for assertSelector'
              }
            },
            required: ['action']
          }
        },
        explanation: {
          type: 'string',
          description: 'Brief explanation of what the action sequence does'
        }
      },
      required: ['steps', 'explanation']
    }
  }
];

// Convert tools to Gemini format
const geminiTools = [{
  functionDeclarations: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} }
  }))
}];

// Simple mode tools - excludes generateActionSequence to force eval-only output
const simpleTools = tools.filter(t => t.name !== 'generateActionSequence');
const simpleGeminiTools = [{
  functionDeclarations: simpleTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} }
  }))
}];

// Action mode tools - excludes generateScript to force action sequence output
const actionTools = tools.filter(t => t.name !== 'generateScript');
const actionGeminiTools = [{
  functionDeclarations: actionTools.map(tool => ({
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
3. Test selectors to make sure they work`;

const PROMPT_PROCESS_TEST = `Process:
1. First, understand what the user wants to test/verify
2. Use tools to explore the page and find the relevant elements
3. Test selectors to make sure they work`;

const PROMPT_SELECTOR_GUIDELINE = `- Use robust selectors (prefer IDs, data attributes, or aria labels over classes)`;

const PROMPT_EVAL_RESTRICTIONS = `- Do NOT use setTimeout or async operations - the script should be synchronous
- Do NOT make fetch requests or load external resources
- Do NOT use alert, confirm, or prompt`;

const PROMPT_ACTION_GUIDELINES = `- Add waitForSelector before interacting with elements that may not be immediately present
- Use waitForNavigation after clicks that trigger page loads
- Add descriptive labels to steps for debugging
- Use appropriate timeouts (default is usually fine)
- For forms: use type for text inputs, select for dropdowns, click for checkboxes/buttons`;

const PROMPT_LOGIN_EXAMPLE = `{
  "steps": [
    { "action": "waitForSelector", "selector": "#username", "label": "Wait for login form" },
    { "action": "type", "selector": "#username", "text": "testuser", "label": "Enter username" },
    { "action": "type", "selector": "#password", "text": "password123", "label": "Enter password" },
    { "action": "click", "selector": "#login-button", "label": "Click login" },
    { "action": "waitForNavigation", "waitUntil": "networkidle2", "label": "Wait for redirect" },
    { "action": "waitForSelector", "selector": ".dashboard", "label": "Verify dashboard loaded" }
  ]
}`;

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
4. Generate the final script using generateScript

Guidelines for the generated script:
${PROMPT_SELECTOR_GUIDELINE}
- Handle the case where elements might not exist
- Use click(), focus(), or other standard DOM methods
- Keep the script simple and focused on the task
${PROMPT_EVAL_RESTRICTIONS}

Example script format:
const element = document.querySelector('#menu-toggle');
if (element) {
  element.click();
}`;

// System prompt for action DSL generation (complex multi-step instructions)
const SYSTEM_PROMT_ACTIONS_ACTION_MODE = `${ROLE_ACTIONS_ACTION_MODE}

${PROMPT_TOOLS}

Available action types:
${generateActionDocs()}

${PROMPT_PROCESS_ACTION}
4. Generate the action sequence using generateActionSequence

Guidelines for action sequences:
${PROMPT_SELECTOR_GUIDELINE}
${PROMPT_ACTION_GUIDELINES}
- Even for simple single actions, use the action sequence format

Example action sequence for a login flow:
${PROMPT_LOGIN_EXAMPLE}

Example action sequence for a simple click test case:
{
  "steps": [
    { "action": "waitForSelector", "selector": "#menu-toggle", "label": "Wait for menu button" },
    { "action": "click", "selector": "#menu-toggle", "label": "Click menu toggle" }
  ]
}`;

// System prompt for action DSL test generation
const SYSTEM_PROMPT_TESTS_ACTION_MODE = `${ROLE_TESTS_ACTION_MODE}

${PROMPT_TOOLS}

Available action types:
${generateActionDocs()}

${PROMPT_ASSERTION_ACTIONS}

${PROMPT_PROCESS_TEST}
4. Generate the test action sequence using generateActionSequence

Guidelines for test action sequences:
- Always use the action sequence format, even for simple single assertions
- Start with setup steps if needed (navigate, click, fill forms)
- End with assertion steps to verify the expected state
- Add descriptive labels to all steps for debugging
- Include meaningful error messages in assertions
- Use multiple assertions to verify different aspects

Example test action sequence for verifying login:
{
  "steps": [
    { "action": "type", "selector": "#username", "text": "testuser", "label": "Enter username" },
    { "action": "type", "selector": "#password", "text": "password123", "label": "Enter password" },
    { "action": "click", "selector": "#login-button", "label": "Click login" },
    { "action": "waitForNavigation", "label": "Wait for redirect" },
    { "action": "assertUrl", "pattern": "/dashboard", "message": "Should redirect to dashboard" },
    { "action": "assertSelector", "selector": ".welcome-message", "visible": true, "message": "Welcome message should be visible" },
    { "action": "assertText", "selector": ".user-name", "text": "testuser", "message": "Username should be displayed" }
  ]
}

Example test action sequence for a simple element check:
{
  "steps": [
    { "action": "assertSelector", "selector": "#main-navigation", "visible": true, "label": "Check navigation exists", "message": "Main navigation should be visible" },
    { "action": "assertText", "selector": "h1", "text": "Welcome", "contains": true, "label": "Check page title", "message": "Page should have welcome heading" }
  ]
}`;

// System prompt for test generation (assertions)
const SYTEM_PROMT_TESTS_EVAL_MODE = `
${ROLE_TESTS_EVAL_MODE}

${PROMPT_TOOLS}

${PROMPT_PROCESS_TEST}
4. Generate the final test script using generateScript

CRITICAL: The generated script MUST return an object with this exact structure:
{ passed: boolean, message: string }

Guidelines for the generated test script:
${PROMPT_SELECTOR_GUIDELINE}
- ALWAYS return { passed: true/false, message: "..." }
- Provide helpful, descriptive failure messages that explain what was expected vs what was found
- Check for element existence before accessing properties
- Keep the test focused on a single assertion or related group of assertions
${PROMPT_EVAL_RESTRICTIONS}
- Wrap the entire script in an IIFE that returns the result

Example test scripts:

1. Check if element exists:
(function() {
  const element = document.querySelector('#login-button');
  if (!element) {
    return { passed: false, message: 'Login button not found on page' };
  }
  return { passed: true, message: 'Login button exists' };
})();

2. Check element text content:
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

3. Check element visibility:
(function() {
  const modal = document.querySelector('.modal');
  if (!modal) {
    return { passed: false, message: 'Modal element not found' };
  }
  const style = window.getComputedStyle(modal);
  const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  if (isVisible) {
    return { passed: true, message: 'Modal is visible' };
  }
  return { passed: false, message: 'Modal exists but is not visible (display: ' + style.display + ', visibility: ' + style.visibility + ')' };
})();

4. Check form field value:
(function() {
  const input = document.querySelector('input[name="email"]');
  if (!input) {
    return { passed: false, message: 'Email input field not found' };
  }
  if (input.value && input.value.length > 0) {
    return { passed: true, message: 'Email field has value: "' + input.value + '"' };
  }
  return { passed: false, message: 'Email field is empty' };
})();
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
    
    case 'generateScript':
      // This is the final output - return as-is (eval mode)
      return { type: 'script', scriptType: 'eval', script: args.script, explanation: args.explanation };
    
    case 'generateActionSequence':
      // This is the final output for action DSL mode
      return { 
        type: 'script', 
        scriptType: 'actions', 
        script: JSON.stringify({ steps: args.steps }, null, 2), 
        explanation: args.explanation 
      };
    
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
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
 * @param {object} toolSet - The Gemini tool set to use (defaults to all tools)
 * @param {number|null} sessionId - AI session ID for logging (optional)
 * @returns {object} Generated script or error
 */
async function generateScriptWithPrompt(page, prompt, pageUrl, systemPrompt, taskDescription, toolSet = geminiTools, sessionId = null) {
  if (!genAI) {
    await updateSessionStatus(sessionId, 'failed', 'Gemini API key not configured');
    return { error: 'Gemini API key not configured' };
  }

  try {
    // Mark session as running
    await updateSessionStatus(sessionId, 'running');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-pro-preview',
      tools: toolSet,
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

    // Tool use loop (max 10 iterations to prevent infinite loops)
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
      for (const part of content.parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }

      if (functionCalls.length === 0) {
        // No more function calls - check if we got a text response
        const text = content.parts.find(p => p.text)?.text;
        const errorMsg = 'No script generated. Model response: ' + (text || 'empty');
        await logAiMessage(sessionId, 'assistant', text || 'No response');
        await updateSessionStatus(sessionId, 'failed', errorMsg);
        return { error: errorMsg };
      }

      // Execute function calls
      const functionResponses = [];
      for (const call of functionCalls) {
        console.log(`Gemini tool call: ${call.name}`, call.args);
        
        // Log the tool call
        await logAiMessage(sessionId, 'tool_call', JSON.stringify(call.args || {}), call.name);
        
        const result = await executeTool(page, call.name, call.args || {});
        
        // Check if this is the final script
        if (result.type === 'script') {
          // Log the final script generation
          await logAiMessage(sessionId, 'assistant', `Generated ${result.scriptType} script: ${result.explanation}`);
          await updateSessionStatus(sessionId, 'completed');
          return {
            script: result.script,
            scriptType: result.scriptType || 'eval',
            explanation: result.explanation
          };
        }
        
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
    simpleGeminiTools,  // Simple mode - only generateScript tool available
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
    simpleGeminiTools,  // Simple mode - only generateScript tool available
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
    actionGeminiTools,  // Action mode - only generateActionSequence available
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
    actionGeminiTools,  // Action mode - only generateActionSequence available
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
