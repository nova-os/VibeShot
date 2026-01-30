const { generateActionTestScript } = require('./gemini');
const { validateActionSequence, parseActionSequence, executeActionSequence, collectAssertionResults } = require('./action-executor');
const { preparePage } = require('./browser-helpers');

/**
 * Action Test Generator - Orchestrates the generation of page test scripts
 * that can use either eval mode (page.evaluate) or action DSL (Puppeteer API).
 * 
 * The AI decides which mode to use based on the complexity of the test.
 */
class ActionTestGenerator {
  constructor(browserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Generate a test script for a page based on a natural language prompt
   * @param {string} pageUrl - URL of the page to analyze
   * @param {string} prompt - User's test description in natural language
   * @param {object} options - Additional options
   * @param {number} options.sessionId - AI session ID for logging
   * @returns {object} Generated test script and metadata including scriptType
   */
  async generate(pageUrl, prompt, options = {}) {
    const { viewport, sessionId = null } = options;
    
    console.log(`ActionTestGenerator: Generating test for ${pageUrl}`);
    console.log(`ActionTestGenerator: Prompt: "${prompt}"`);

    let browser = null;
    let page = null;

    try {
      // Acquire browser from pool
      browser = await this.browserPool.acquire();
      
      // Create new page
      page = await browser.newPage();

      // Prepare page with viewport, navigation, and cookie consent handling
      // Uses same setup as screenshot capture for consistent page state
      await preparePage(page, pageUrl, { 
        viewport, 
        timeout: 60000,
        logPrefix: 'ActionTestGenerator'
      });

      // Generate test script using Gemini (may return eval or actions mode)
      console.log('ActionTestGenerator: Calling Gemini for test generation');
      const result = await generateActionTestScript(page, prompt, pageUrl, sessionId);

      if (result.error) {
        console.error('ActionTestGenerator: Generation failed:', result.error);
        return { success: false, error: result.error };
      }

      const scriptType = result.scriptType || 'eval';
      console.log(`ActionTestGenerator: Generated ${scriptType} mode test`);

      // Validate the generated test script
      console.log('ActionTestGenerator: Validating generated test script');
      const validation = await this.validateTestScript(page, result.script, scriptType);

      if (!validation.success) {
        console.warn('ActionTestGenerator: Test script validation failed:', validation.error);
        // Return the script anyway but with a warning
        return {
          success: true,
          script: result.script,
          scriptType,
          explanation: result.explanation,
          warning: `Test script generated but validation failed: ${validation.error}`
        };
      }

      console.log('ActionTestGenerator: Test script generated and validated successfully');
      return {
        success: true,
        script: result.script,
        scriptType,
        explanation: result.explanation,
        validationResult: validation.result
      };

    } catch (error) {
      console.error('ActionTestGenerator: Error:', error.message);
      return { success: false, error: error.message };
    } finally {
      // Clean up
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error('ActionTestGenerator: Error closing page:', e.message);
        }
      }
      if (browser) {
        this.browserPool.release(browser);
      }
    }
  }

  /**
   * Validate a test script based on its type
   * @param {Page} page - Puppeteer page instance
   * @param {string} script - Script code or JSON to validate
   * @param {string} scriptType - 'eval' or 'actions'
   * @returns {object} Validation result
   */
  async validateTestScript(page, script, scriptType) {
    try {
      if (scriptType === 'actions') {
        // Parse and validate action sequence structure
        const parseResult = parseActionSequence(script);
        if (!parseResult.success) {
          return { success: false, error: parseResult.error };
        }

        const validation = validateActionSequence(parseResult.sequence);
        if (!validation.valid) {
          return { success: false, error: validation.errors.join('; ') };
        }

        // Check that there's at least one assertion action
        const hasAssertions = parseResult.sequence.steps.some(step => 
          step.action.startsWith('assert')
        );
        
        if (!hasAssertions) {
          console.warn('ActionTestGenerator: Test has no assertion steps');
        }

        return { success: true, result: { hasAssertions } };
      } else {
        // Eval mode - check syntax and execute
        new Function(script);

        // Execute the test script in page context
        const result = await page.evaluate(script);

        // Verify the result has the expected structure
        if (typeof result !== 'object' || result === null) {
          return { 
            success: false, 
            error: 'Test script must return an object with { passed, message }' 
          };
        }

        if (typeof result.passed !== 'boolean') {
          return { 
            success: false, 
            error: 'Test script must return { passed: boolean, message: string }' 
          };
        }

        return { success: true, result };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ActionTestGenerator;
