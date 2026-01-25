const { generateTestScript } = require('./gemini');

/**
 * Test Generator - Orchestrates the generation of page test scripts
 * using Puppeteer for page inspection and Gemini for code generation.
 */
class TestGenerator {
  constructor(browserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Generate a test script for a page based on a natural language prompt
   * @param {string} pageUrl - URL of the page to analyze
   * @param {string} prompt - User's test description in natural language
   * @param {object} options - Additional options
   * @param {number} options.pageId - Page ID for logging context
   * @param {number} options.sessionId - AI session ID for logging
   * @returns {object} Generated test script and metadata
   */
  async generate(pageUrl, prompt, options = {}) {
    const { viewport = 'desktop', pageId = null, sessionId = null } = options;
    
    console.log(`TestGenerator: Generating test for ${pageUrl}`);
    console.log(`TestGenerator: Prompt: "${prompt}"`);

    let browser = null;
    let page = null;

    try {
      // Acquire browser from pool
      browser = await this.browserPool.acquire();
      
      // Create new page
      page = await browser.newPage();

      // Set viewport based on option
      const viewportSizes = {
        mobile: { width: 375, height: 812 },
        tablet: { width: 768, height: 1024 },
        desktop: { width: 1920, height: 1080 }
      };
      
      await page.setViewport(viewportSizes[viewport] || viewportSizes.desktop);

      // Set timeouts
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(30000);

      // Navigate to the page
      console.log(`TestGenerator: Navigating to ${pageUrl}`);
      
      await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for initial content
      await this.sleep(1000);

      // Generate test script using Gemini
      console.log('TestGenerator: Calling Gemini for test generation');
      const result = await generateTestScript(page, prompt, pageUrl, sessionId);

      if (result.error) {
        console.error('TestGenerator: Generation failed:', result.error);
        return { success: false, error: result.error };
      }

      // Validate the generated test script by executing it
      console.log('TestGenerator: Validating generated test script');
      
      const validation = await this.validateTestScript(page, result.script);

      if (!validation.success) {
        console.warn('TestGenerator: Test script validation failed:', validation.error);
        // Return the script anyway but with a warning
        return {
          success: true,
          script: result.script,
          scriptType: result.scriptType || 'eval',
          explanation: result.explanation,
          warning: `Test script generated but validation failed: ${validation.error}`
        };
      }

      console.log('TestGenerator: Test script generated and validated successfully');
      
      return {
        success: true,
        script: result.script,
        scriptType: result.scriptType || 'eval',
        explanation: result.explanation,
        validationResult: validation.result
      };

    } catch (error) {
      console.error('TestGenerator: Error:', error.message);
      return { success: false, error: error.message };
    } finally {
      // Clean up
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error('TestGenerator: Error closing page:', e.message);
        }
      }
      if (browser) {
        this.browserPool.release(browser);
      }
    }
  }

  /**
   * Validate a test script by executing it in the page context
   * @param {Page} page - Puppeteer page instance
   * @param {string} script - JavaScript test code to validate
   * @returns {object} Validation result
   */
  async validateTestScript(page, script) {
    try {
      // First, check for syntax errors by trying to parse it
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
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TestGenerator;
