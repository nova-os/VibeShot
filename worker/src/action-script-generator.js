const { generateActionScript } = require('./gemini');
const { validateActionSequence, parseActionSequence, executeActionSequence } = require('./action-executor');
const { preparePage } = require('./browser-helpers');

/**
 * Action Script Generator - Orchestrates the generation of page interaction scripts
 * that can use either eval mode (page.evaluate) or action DSL (Puppeteer API).
 * 
 * The AI decides which mode to use based on the complexity of the instruction.
 */
class ActionScriptGenerator {
  constructor(browserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Generate a script for a page based on a natural language prompt
   * @param {string} pageUrl - URL of the page to analyze
   * @param {string} prompt - User's instruction in natural language
   * @param {object} options - Additional options
   * @param {number} options.sessionId - AI session ID for logging
   * @returns {object} Generated script and metadata including scriptType
   */
  async generate(pageUrl, prompt, options = {}) {
    const { viewport = 'desktop', sessionId = null } = options;
    
    console.log(`ActionScriptGenerator: Generating script for ${pageUrl}`);
    console.log(`ActionScriptGenerator: Prompt: "${prompt}"`);

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
        logPrefix: 'ActionScriptGenerator'
      });

      // Generate script using Gemini (may return eval or actions mode)
      console.log('ActionScriptGenerator: Calling Gemini for script generation');
      const result = await generateActionScript(page, prompt, pageUrl, sessionId);

      if (result.error) {
        console.error('ActionScriptGenerator: Generation failed:', result.error);
        return { success: false, error: result.error };
      }

      const scriptType = result.scriptType || 'eval';
      console.log(`ActionScriptGenerator: Generated ${scriptType} mode script`);

      // Validate the generated script
      console.log('ActionScriptGenerator: Validating generated script');
      const validation = await this.validateScript(page, result.script, scriptType);

      if (!validation.success) {
        console.warn('ActionScriptGenerator: Script validation failed:', validation.error);
        // Return the script anyway but with a warning
        return {
          success: true,
          script: result.script,
          scriptType,
          explanation: result.explanation,
          warning: `Script generated but validation failed: ${validation.error}`
        };
      }

      console.log('ActionScriptGenerator: Script generated and validated successfully');
      return {
        success: true,
        script: result.script,
        scriptType,
        explanation: result.explanation
      };

    } catch (error) {
      console.error('ActionScriptGenerator: Error:', error.message);
      return { success: false, error: error.message };
    } finally {
      // Clean up
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error('ActionScriptGenerator: Error closing page:', e.message);
        }
      }
      if (browser) {
        this.browserPool.release(browser);
      }
    }
  }

  /**
   * Validate a script based on its type
   * @param {Page} page - Puppeteer page instance
   * @param {string} script - Script code or JSON to validate
   * @param {string} scriptType - 'eval' or 'actions'
   * @returns {object} Validation result
   */
  async validateScript(page, script, scriptType) {
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

        // Optionally do a dry run of the first few non-destructive steps
        // For now, just validate the structure
        return { success: true };
      } else {
        // Eval mode - check syntax and execute
        new Function(script);
        await page.evaluate(script);
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ActionScriptGenerator;
