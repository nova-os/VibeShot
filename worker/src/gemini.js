const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY not set. Script generation will not work.');
}

// Initialize Gemini client
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

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

// System prompt for script generation
const SYSTEM_PROMPT = `You are an expert at web automation and DOM manipulation. Your task is to generate JavaScript code that performs a specific action on a webpage.

You have tools to explore the page:
- getAccessibilityTree: See the full page structure
- querySelector: Test if a CSS selector works
- getElementDetails: Get info about specific elements
- getClickableElements: Find all interactive elements

Process:
1. First, understand what the user wants to do
2. Use tools to explore the page and find the right elements
3. Test selectors to make sure they work
4. Generate the final script using generateScript

Guidelines for the generated script:
- Use robust selectors (prefer IDs, data attributes, or aria labels over classes)
- Handle the case where elements might not exist
- Use click(), focus(), or other standard DOM methods
- Keep the script simple and focused on the task
- Do NOT use setTimeout or async operations - the script should be synchronous
- Do NOT make fetch requests or load external resources
- Do NOT use alert, confirm, or prompt

Example script format:
const element = document.querySelector('#menu-toggle');
if (element) {
  element.click();
}`;

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
      // This is the final output - return as-is
      return { type: 'script', script: args.script, explanation: args.explanation };
    
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
 * Generate a script using Gemini with tool use
 * @param {Page} page - Puppeteer page instance
 * @param {string} prompt - User's natural language instruction
 * @param {string} pageUrl - URL of the page (for context)
 * @returns {object} Generated script or error
 */
async function generateScript(page, prompt, pageUrl) {
  if (!genAI) {
    return { error: 'Gemini API key not configured' };
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-pro-preview',
      tools: geminiTools,
      systemInstruction: SYSTEM_PROMPT
    });

    // Start conversation with context
    const chat = model.startChat({
      history: []
    });

    // Initial message with the task
    let response = await chat.sendMessage(
      `Page URL: ${pageUrl}\n\nUser instruction: "${prompt}"\n\nPlease explore the page to understand its structure, then generate the JavaScript code to accomplish this task.`
    );

    // Tool use loop (max 10 iterations to prevent infinite loops)
    for (let i = 0; i < 10; i++) {
      const candidate = response.response.candidates[0];
      const content = candidate.content;
      
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
        return { error: 'No script generated. Model response: ' + (text || 'empty') };
      }

      // Execute function calls
      const functionResponses = [];
      for (const call of functionCalls) {
        console.log(`Gemini tool call: ${call.name}`, call.args);
        const result = await executeTool(page, call.name, call.args || {});
        
        // Check if this is the final script
        if (result.type === 'script') {
          return {
            script: result.script,
            explanation: result.explanation
          };
        }
        
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

    return { error: 'Max iterations reached without generating a script' };

  } catch (error) {
    console.error('Gemini error:', error);
    return { error: error.message };
  }
}

module.exports = {
  generateScript,
  executeTool,
  tools
};
