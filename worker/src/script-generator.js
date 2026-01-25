const { generateScript } = require('./gemini');
const { preparePage } = require('./browser-helpers');

/**
 * Script Generator - Orchestrates the generation of page interaction scripts
 * using Puppeteer for page inspection and Gemini for code generation.
 */
class ScriptGenerator {
  constructor(browserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Generate a script for a page based on a natural language prompt
   * @param {string} pageUrl - URL of the page to analyze
   * @param {string} prompt - User's instruction in natural language
   * @param {object} options - Additional options
   * @param {number} options.pageId - Page ID for logging context
   * @param {number} options.sessionId - AI session ID for logging
   * @returns {object} Generated script and metadata
   */
  async generate(pageUrl, prompt, options = {}) {
    const { viewport = 'desktop', pageId = null, sessionId = null } = options;
    
    console.log(`ScriptGenerator: Generating script for ${pageUrl}`);
    console.log(`ScriptGenerator: Prompt: "${prompt}"`);

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
        logPrefix: 'ScriptGenerator'
      });

      // Generate script using Gemini
      console.log('ScriptGenerator: Calling Gemini for script generation');
      const result = await generateScript(page, prompt, pageUrl, sessionId);

      if (result.error) {
        console.error('ScriptGenerator: Generation failed:', result.error);
        return { success: false, error: result.error };
      }

      // Validate the generated script by executing it
      console.log('ScriptGenerator: Validating generated script');
      
      const validation = await this.validateScript(page, result.script);

      if (!validation.success) {
        console.warn('ScriptGenerator: Script validation failed:', validation.error);
        // Return the script anyway but with a warning
        return {
          success: true,
          script: result.script,
          scriptType: result.scriptType || 'eval',
          explanation: result.explanation,
          warning: `Script generated but validation failed: ${validation.error}`
        };
      }

      console.log('ScriptGenerator: Script generated and validated successfully');
      
      return {
        success: true,
        script: result.script,
        scriptType: result.scriptType || 'eval',
        explanation: result.explanation
      };

    } catch (error) {
      console.error('ScriptGenerator: Error:', error.message);
      return { success: false, error: error.message };
    } finally {
      // Clean up
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error('ScriptGenerator: Error closing page:', e.message);
        }
      }
      if (browser) {
        this.browserPool.release(browser);
      }
    }
  }

  /**
   * Validate a script by executing it in the page context
   * @param {Page} page - Puppeteer page instance
   * @param {string} script - JavaScript code to validate
   * @returns {object} Validation result
   */
  async validateScript(page, script) {
    try {
      // First, check for syntax errors by trying to parse it
      new Function(script);

      // Execute the script in page context
      await page.evaluate(script);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ScriptGenerator;
