/**
 * Action Executor - Executes structured action DSL sequences using Puppeteer
 * 
 * This module provides a safe, controlled way to execute multi-step browser
 * interactions including navigation, waits, and assertions.
 */

/**
 * Supported action types and their schemas
 */
const ACTION_SCHEMAS = {
  // Navigation & Interaction
  click: {
    required: ['selector'],
    optional: ['timeout', 'button', 'clickCount', 'delay']
  },
  type: {
    required: ['selector', 'text'],
    optional: ['timeout', 'delay']
  },
  clear: {
    required: ['selector'],
    optional: ['timeout']
  },
  select: {
    required: ['selector', 'value'],
    optional: ['timeout']
  },
  hover: {
    required: ['selector'],
    optional: ['timeout']
  },
  focus: {
    required: ['selector'],
    optional: ['timeout']
  },
  press: {
    required: ['key'],
    optional: ['delay']
  },

  // Waiting
  waitForSelector: {
    required: ['selector'],
    optional: ['timeout', 'visible', 'hidden']
  },
  waitForNavigation: {
    required: [],
    optional: ['timeout', 'waitUntil']
  },
  waitForTimeout: {
    required: ['ms'],
    optional: []
  },
  waitForFunction: {
    required: ['script'],
    optional: ['timeout', 'polling']
  },

  // Navigation
  goto: {
    required: ['url'],
    optional: ['timeout', 'waitUntil']
  },
  goBack: {
    required: [],
    optional: ['timeout', 'waitUntil']
  },
  goForward: {
    required: [],
    optional: ['timeout', 'waitUntil']
  },
  reload: {
    required: [],
    optional: ['timeout', 'waitUntil']
  },

  // Scrolling
  scroll: {
    required: [],
    optional: ['selector', 'x', 'y', 'behavior']
  },
  scrollToElement: {
    required: ['selector'],
    optional: ['block', 'inline', 'behavior']
  },

  // Page manipulation
  evaluate: {
    required: ['script'],
    optional: []
  },
  setViewport: {
    required: ['width', 'height'],
    optional: ['deviceScaleFactor', 'isMobile', 'hasTouch']
  },

  // Assertions (for tests)
  assert: {
    required: ['script'],
    optional: ['message']
  },
  assertSelector: {
    required: ['selector'],
    optional: ['message', 'visible', 'count']
  },
  assertText: {
    required: ['selector', 'text'],
    optional: ['message', 'contains', 'exact']
  },
  assertUrl: {
    required: ['pattern'],
    optional: ['message', 'exact']
  },
  assertTitle: {
    required: ['pattern'],
    optional: ['message', 'exact']
  }
};

/**
 * Default timeouts for various operations
 */
const DEFAULT_TIMEOUTS = {
  click: 5000,
  type: 5000,
  select: 5000,
  hover: 5000,
  focus: 5000,
  waitForSelector: 10000,
  waitForNavigation: 30000,
  waitForFunction: 10000,
  goto: 30000,
  goBack: 30000,
  goForward: 30000,
  reload: 30000
};

/**
 * Get list of known action types
 * @returns {string[]} Array of known action type names
 */
function getKnownActionTypes() {
  return Object.keys(ACTION_SCHEMAS);
}

/**
 * Validate an action against its schema
 * @param {Object} action - The action to validate
 * @param {number} stepIndex - Index of the step for error messages
 * @returns {Object} Validation result { valid: boolean, error?: string, warnings?: string[] }
 */
function validateAction(action, stepIndex = 0) {
  const stepLabel = action?.label ? `"${action.label}"` : `Step ${stepIndex + 1}`;
  const warnings = [];
  
  if (!action || typeof action !== 'object') {
    return { valid: false, error: `${stepLabel}: Action must be an object` };
  }

  if (!action.action || typeof action.action !== 'string') {
    return { valid: false, error: `${stepLabel}: Action must have an "action" field` };
  }

  const schema = ACTION_SCHEMAS[action.action];
  if (!schema) {
    const knownActions = getKnownActionTypes().join(', ');
    return { 
      valid: false, 
      error: `${stepLabel}: Unknown action type "${action.action}". Known actions: ${knownActions}` 
    };
  }

  // Check required fields
  const missingFields = [];
  for (const field of schema.required) {
    if (action[field] === undefined || action[field] === null || action[field] === '') {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    return { 
      valid: false, 
      error: `${stepLabel}: Action "${action.action}" requires field(s): ${missingFields.join(', ')}` 
    };
  }

  // Check for unknown fields (warn but don't fail)
  const knownFields = ['action', 'label', ...schema.required, ...schema.optional];
  const unknownFields = Object.keys(action).filter(key => !knownFields.includes(key));
  if (unknownFields.length > 0) {
    warnings.push(`${stepLabel}: Unknown field(s) for "${action.action}": ${unknownFields.join(', ')}`);
  }

  // Validate specific field types
  if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout <= 0)) {
    warnings.push(`${stepLabel}: timeout should be a positive number`);
  }
  if (action.ms !== undefined && (typeof action.ms !== 'number' || action.ms < 0)) {
    warnings.push(`${stepLabel}: ms should be a non-negative number`);
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Validate a complete action sequence
 * @param {Object} actionSequence - The action sequence to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
 */
function validateActionSequence(actionSequence) {
  const errors = [];
  const warnings = [];

  if (!actionSequence || typeof actionSequence !== 'object') {
    return { valid: false, errors: ['Action sequence must be an object'], warnings: [] };
  }

  if (!Array.isArray(actionSequence.steps)) {
    return { valid: false, errors: ['Action sequence must have a "steps" array'], warnings: [] };
  }

  if (actionSequence.steps.length === 0) {
    return { valid: false, errors: ['Action sequence has no steps'], warnings: [] };
  }

  actionSequence.steps.forEach((step, index) => {
    const result = validateAction(step, index);
    if (!result.valid) {
      errors.push(result.error);
    }
    if (result.warnings) {
      warnings.push(...result.warnings);
    }
  });

  // Log validation summary
  if (errors.length > 0 || warnings.length > 0) {
    console.log(`ActionExecutor: Validation found ${errors.length} error(s) and ${warnings.length} warning(s)`);
    errors.forEach(e => console.error(`  ERROR: ${e}`));
    warnings.forEach(w => console.warn(`  WARNING: ${w}`));
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Generate a detailed validation report for an action sequence
 * @param {Object|string} actionSequenceOrScript - Action sequence object or JSON string
 * @returns {Object} Detailed validation report
 */
function generateValidationReport(actionSequenceOrScript) {
  // Parse if string
  let sequence;
  if (typeof actionSequenceOrScript === 'string') {
    try {
      sequence = JSON.parse(actionSequenceOrScript);
    } catch (e) {
      return {
        valid: false,
        parseError: `Invalid JSON: ${e.message}`,
        steps: [],
        summary: { total: 0, valid: 0, invalid: 0, errors: 1, warnings: 0 }
      };
    }
  } else {
    sequence = actionSequenceOrScript;
  }

  if (!sequence || !Array.isArray(sequence.steps)) {
    return {
      valid: false,
      parseError: 'Action sequence must have a "steps" array',
      steps: [],
      summary: { total: 0, valid: 0, invalid: 0, errors: 1, warnings: 0 }
    };
  }

  const stepReports = sequence.steps.map((step, index) => {
    const validation = validateAction(step, index);
    return {
      index: index + 1,
      action: step.action || 'unknown',
      label: step.label || null,
      valid: validation.valid,
      error: validation.error || null,
      warnings: validation.warnings || []
    };
  });

  const validSteps = stepReports.filter(s => s.valid);
  const invalidSteps = stepReports.filter(s => !s.valid);
  const totalWarnings = stepReports.reduce((sum, s) => sum + s.warnings.length, 0);

  return {
    valid: invalidSteps.length === 0,
    steps: stepReports,
    summary: {
      total: stepReports.length,
      valid: validSteps.length,
      invalid: invalidSteps.length,
      errors: invalidSteps.length,
      warnings: totalWarnings
    },
    errors: invalidSteps.map(s => s.error),
    warnings: stepReports.flatMap(s => s.warnings)
  };
}

/**
 * Execute a single action on a Puppeteer page
 * @param {Page} page - Puppeteer page instance
 * @param {Object} action - The action to execute
 * @param {Object} context - Execution context (for passing data between steps)
 * @returns {Object} Execution result
 */
async function executeAction(page, action, context = {}) {
  const startTime = Date.now();
  
  try {
    let result = null;

    switch (action.action) {
      // === Navigation & Interaction ===
      case 'click': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.click;
        await page.waitForSelector(action.selector, { timeout, visible: true });
        await page.click(action.selector, {
          button: action.button || 'left',
          clickCount: action.clickCount || 1,
          delay: action.delay || 0
        });
        break;
      }

      case 'type': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.type;
        await page.waitForSelector(action.selector, { timeout, visible: true });
        await page.type(action.selector, action.text, {
          delay: action.delay || 0
        });
        break;
      }

      case 'clear': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.type;
        await page.waitForSelector(action.selector, { timeout, visible: true });
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, action.selector);
        break;
      }

      case 'select': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.select;
        await page.waitForSelector(action.selector, { timeout, visible: true });
        const values = Array.isArray(action.value) ? action.value : [action.value];
        await page.select(action.selector, ...values);
        break;
      }

      case 'hover': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.hover;
        await page.waitForSelector(action.selector, { timeout, visible: true });
        await page.hover(action.selector);
        break;
      }

      case 'focus': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.focus;
        await page.waitForSelector(action.selector, { timeout, visible: true });
        await page.focus(action.selector);
        break;
      }

      case 'press': {
        await page.keyboard.press(action.key, {
          delay: action.delay || 0
        });
        break;
      }

      // === Waiting ===
      case 'waitForSelector': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.waitForSelector;
        await page.waitForSelector(action.selector, {
          timeout,
          visible: action.visible,
          hidden: action.hidden
        });
        break;
      }

      case 'waitForNavigation': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.waitForNavigation;
        await page.waitForNavigation({
          timeout,
          waitUntil: action.waitUntil || 'networkidle2'
        });
        break;
      }

      case 'waitForTimeout': {
        const ms = Math.min(action.ms, 30000); // Cap at 30 seconds
        await new Promise(resolve => setTimeout(resolve, ms));
        break;
      }

      case 'waitForFunction': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.waitForFunction;
        await page.waitForFunction(action.script, {
          timeout,
          polling: action.polling || 'raf'
        });
        break;
      }

      // === Navigation ===
      case 'goto': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.goto;
        await page.goto(action.url, {
          timeout,
          waitUntil: action.waitUntil || 'networkidle2'
        });
        break;
      }

      case 'goBack': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.goBack;
        await page.goBack({
          timeout,
          waitUntil: action.waitUntil || 'networkidle2'
        });
        break;
      }

      case 'goForward': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.goForward;
        await page.goForward({
          timeout,
          waitUntil: action.waitUntil || 'networkidle2'
        });
        break;
      }

      case 'reload': {
        const timeout = action.timeout || DEFAULT_TIMEOUTS.reload;
        await page.reload({
          timeout,
          waitUntil: action.waitUntil || 'networkidle2'
        });
        break;
      }

      // === Scrolling ===
      case 'scroll': {
        if (action.selector) {
          await page.evaluate((sel, x, y, behavior) => {
            const el = document.querySelector(sel);
            if (el) {
              el.scrollTo({ left: x || 0, top: y || 0, behavior: behavior || 'auto' });
            }
          }, action.selector, action.x, action.y, action.behavior);
        } else {
          await page.evaluate((x, y, behavior) => {
            window.scrollTo({ left: x || 0, top: y || 0, behavior: behavior || 'auto' });
          }, action.x, action.y, action.behavior);
        }
        break;
      }

      case 'scrollToElement': {
        await page.evaluate((sel, block, inline, behavior) => {
          const el = document.querySelector(sel);
          if (el) {
            el.scrollIntoView({
              block: block || 'center',
              inline: inline || 'nearest',
              behavior: behavior || 'auto'
            });
          }
        }, action.selector, action.block, action.inline, action.behavior);
        break;
      }

      // === Page manipulation ===
      case 'evaluate': {
        result = await page.evaluate(action.script);
        break;
      }

      case 'setViewport': {
        await page.setViewport({
          width: action.width,
          height: action.height,
          deviceScaleFactor: action.deviceScaleFactor || 1,
          isMobile: action.isMobile || false,
          hasTouch: action.hasTouch || false
        });
        break;
      }

      // === Assertions ===
      case 'assert': {
        result = await page.evaluate(action.script);
        if (typeof result === 'object' && result !== null && typeof result.passed === 'boolean') {
          // Already in correct format
        } else if (typeof result === 'boolean') {
          result = {
            passed: result,
            message: action.message || (result ? 'Assertion passed' : 'Assertion failed')
          };
        } else {
          result = {
            passed: false,
            message: `Assertion script must return boolean or { passed, message }. Got: ${typeof result}`
          };
        }
        break;
      }

      case 'assertSelector': {
        const elements = await page.$$(action.selector);
        const count = elements.length;
        
        if (action.count !== undefined) {
          result = {
            passed: count === action.count,
            message: count === action.count
              ? `Found expected ${action.count} element(s) for "${action.selector}"`
              : `Expected ${action.count} element(s) for "${action.selector}", found ${count}`
          };
        } else if (action.visible) {
          const visible = count > 0 && await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }, action.selector);
          result = {
            passed: visible,
            message: visible
              ? `Element "${action.selector}" is visible`
              : `Element "${action.selector}" is not visible`
          };
        } else {
          result = {
            passed: count > 0,
            message: count > 0
              ? `Found ${count} element(s) matching "${action.selector}"`
              : action.message || `No elements found for "${action.selector}"`
          };
        }
        break;
      }

      case 'assertText': {
        const element = await page.$(action.selector);
        if (!element) {
          result = {
            passed: false,
            message: action.message || `Element "${action.selector}" not found`
          };
        } else {
          const text = await page.evaluate(el => el.textContent, element);
          const trimmedText = (text || '').trim();
          
          if (action.exact) {
            const passed = trimmedText === action.text;
            result = {
              passed,
              message: passed
                ? `Text matches exactly: "${action.text}"`
                : `Text mismatch. Expected: "${action.text}", Found: "${trimmedText}"`
            };
          } else {
            const passed = trimmedText.includes(action.text);
            result = {
              passed,
              message: passed
                ? `Text contains: "${action.text}"`
                : `Text does not contain "${action.text}". Found: "${trimmedText}"`
            };
          }
        }
        break;
      }

      case 'assertUrl': {
        const currentUrl = page.url();
        let passed;
        
        if (action.exact) {
          passed = currentUrl === action.pattern;
        } else {
          // Support regex patterns
          try {
            const regex = new RegExp(action.pattern);
            passed = regex.test(currentUrl);
          } catch {
            passed = currentUrl.includes(action.pattern);
          }
        }
        
        result = {
          passed,
          message: passed
            ? `URL matches pattern: "${action.pattern}"`
            : action.message || `URL "${currentUrl}" does not match pattern "${action.pattern}"`
        };
        break;
      }

      case 'assertTitle': {
        const title = await page.title();
        let passed;
        
        if (action.exact) {
          passed = title === action.pattern;
        } else {
          try {
            const regex = new RegExp(action.pattern);
            passed = regex.test(title);
          } catch {
            passed = title.includes(action.pattern);
          }
        }
        
        result = {
          passed,
          message: passed
            ? `Title matches pattern: "${action.pattern}"`
            : action.message || `Title "${title}" does not match pattern "${action.pattern}"`
        };
        break;
      }

      default:
        throw new Error(`Unknown action type: ${action.action}`);
    }

    return {
      success: true,
      action: action.action,
      duration: Date.now() - startTime,
      result
    };

  } catch (error) {
    return {
      success: false,
      action: action.action,
      duration: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Execute a complete action sequence
 * @param {Page} page - Puppeteer page instance
 * @param {Object} actionSequence - The action sequence to execute
 * @param {Object} options - Execution options
 * @returns {Object} Execution results
 */
async function executeActionSequence(page, actionSequence, options = {}) {
  const { stopOnError = true, logPrefix = 'ActionExecutor' } = options;
  
  // Validate the sequence first
  const validation = validateActionSequence(actionSequence);
  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid action sequence: ${validation.errors.join('; ')}`,
      results: []
    };
  }

  const results = [];
  const context = {};
  let allSuccessful = true;

  console.log(`${logPrefix}: Executing ${actionSequence.steps.length} action(s)`);

  for (let i = 0; i < actionSequence.steps.length; i++) {
    const step = actionSequence.steps[i];
    const stepLabel = step.label || `Step ${i + 1}`;
    
    console.log(`${logPrefix}: [${stepLabel}] ${step.action}${step.selector ? ` on "${step.selector}"` : ''}`);
    
    const result = await executeAction(page, step, context);
    results.push({
      ...result,
      stepIndex: i,
      label: stepLabel
    });

    if (!result.success) {
      allSuccessful = false;
      console.error(`${logPrefix}: [${stepLabel}] Failed: ${result.error}`);
      
      if (stopOnError) {
        console.log(`${logPrefix}: Stopping execution due to error`);
        break;
      }
    } else {
      console.log(`${logPrefix}: [${stepLabel}] Completed in ${result.duration}ms`);
    }
  }

  return {
    success: allSuccessful,
    results,
    totalSteps: actionSequence.steps.length,
    completedSteps: results.length,
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
  };
}

/**
 * Parse action sequence from JSON string or return object as-is
 * @param {string|Object} input - JSON string or action sequence object
 * @returns {Object} Parsed action sequence or error
 */
function parseActionSequence(input) {
  if (typeof input === 'object') {
    return { success: true, sequence: input };
  }

  try {
    const parsed = JSON.parse(input);
    return { success: true, sequence: parsed };
  } catch (error) {
    return { success: false, error: `Failed to parse action sequence: ${error.message}` };
  }
}

/**
 * Collect assertion results from action results
 * @param {Array} results - Array of action execution results
 * @returns {Object} Aggregated assertion results
 */
function collectAssertionResults(results) {
  const assertions = results.filter(r => 
    r.action.startsWith('assert') && r.result
  );

  const passed = assertions.filter(a => a.result.passed);
  const failed = assertions.filter(a => !a.result.passed);

  return {
    totalAssertions: assertions.length,
    passed: passed.length,
    failed: failed.length,
    allPassed: failed.length === 0,
    results: assertions.map(a => ({
      action: a.action,
      passed: a.result.passed,
      message: a.result.message,
      label: a.label
    }))
  };
}

module.exports = {
  executeAction,
  executeActionSequence,
  validateAction,
  validateActionSequence,
  parseActionSequence,
  collectAssertionResults,
  generateValidationReport,
  getKnownActionTypes,
  ACTION_SCHEMAS,
  DEFAULT_TIMEOUTS
};
