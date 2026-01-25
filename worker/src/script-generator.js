const { generateScript } = require('./gemini');

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
   * @returns {object} Generated script and metadata
   */
  async generate(pageUrl, prompt, options = {}) {
    const { viewport = 'desktop', pageId = null } = options;
    
    console.log(`ScriptGenerator: Generating script for ${pageUrl}`);
    console.log(`ScriptGenerator: Prompt: "${prompt}"`);

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
      console.log(`ScriptGenerator: Navigating to ${pageUrl}`);
      
      await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for initial content
      await this.sleep(1000);

      // Generate script using Gemini
      console.log('ScriptGenerator: Calling Gemini for script generation');
      const result = await generateScript(page, prompt, pageUrl);

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
          explanation: result.explanation,
          warning: `Script generated but validation failed: ${validation.error}`
        };
      }

      console.log('ScriptGenerator: Script generated and validated successfully');
      
      return {
        success: true,
        script: result.script,
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ScriptGenerator;
