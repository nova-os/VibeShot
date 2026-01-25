const { generateActionScript } = require('./gemini');
const { validateActionSequence, parseActionSequence, generateValidationReport, getKnownActionTypes } = require('./action-executor');
const { createConversation, addMessage, completeConversation } = require('./conversation-logger');

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
   * @param {number} options.pageId - Page ID for logging context
   * @param {boolean} options.liveUpdates - Enable live conversation updates (default: true)
   * @returns {object} Generated script and metadata including scriptType and conversationId
   */
  async generate(pageUrl, prompt, options = {}) {
    const { viewport = 'desktop', pageId = null, liveUpdates = true } = options;
    
    console.log(`ActionScriptGenerator: Generating script for ${pageUrl}`);
    console.log(`ActionScriptGenerator: Prompt: "${prompt}"`);

    let browser = null;
    let page = null;
    let conversationId = null;
    const startTime = Date.now();

    try {
      // Create conversation record for live updates
      if (liveUpdates) {
        conversationId = await createConversation({
          contextType: 'instruction',
          pageId,
          pageUrl,
          prompt,
          systemPromptType: 'action',
          modelName: 'gemini-3-pro-preview'
        });
      }

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
      console.log(`ActionScriptGenerator: Navigating to ${pageUrl}`);
      if (liveUpdates && conversationId) {
        await addMessage(conversationId, {
          role: 'system',
          content: `Navigating to ${pageUrl}`,
          timestamp: new Date().toISOString(),
          type: 'navigation'
        }, 'Loading page...');
      }
      
      await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for initial content
      await this.sleep(1000);

      // Create onMessage callback for live updates
      const onMessage = liveUpdates && conversationId 
        ? async (message, currentStep) => {
            await addMessage(conversationId, message, currentStep);
          }
        : null;

      // Generate script using Gemini (may return eval or actions mode)
      console.log('ActionScriptGenerator: Calling Gemini for script generation');
      const result = await generateActionScript(page, prompt, pageUrl, { onMessage });

      if (result.error) {
        console.error('ActionScriptGenerator: Generation failed:', result.error);
        // Complete conversation with failure
        if (liveUpdates && conversationId) {
          await completeConversation(conversationId, {
            success: false,
            error: result.error,
            durationMs: Date.now() - startTime
          });
        }
        return { success: false, error: result.error, conversationId };
      }

      const scriptType = result.scriptType || 'eval';
      console.log(`ActionScriptGenerator: Generated ${scriptType} mode script`);

      // Validate the generated script
      console.log('ActionScriptGenerator: Validating generated script');
      if (liveUpdates && conversationId) {
        await addMessage(conversationId, {
          role: 'system',
          content: 'Validating generated script...',
          timestamp: new Date().toISOString(),
          type: 'validation'
        }, 'Validating script...');
      }
      
      const validation = await this.validateScript(page, result.script, scriptType);

      if (!validation.success) {
        console.error('ActionScriptGenerator: Script validation failed:', validation.error);
        const errorMsg = `Generated script failed validation: ${validation.error}`;
        // Complete conversation with validation failure
        if (liveUpdates && conversationId) {
          await completeConversation(conversationId, {
            success: false,
            scriptType,
            script: result.script,
            explanation: result.explanation,
            error: errorMsg,
            durationMs: Date.now() - startTime
          });
        }
        // Fail the generation when validation fails
        return {
          success: false,
          error: errorMsg,
          script: result.script,  // Include the script for debugging
          scriptType,
          explanation: result.explanation,
          conversationId
        };
      }

      console.log('ActionScriptGenerator: Script generated and validated successfully');
      
      // Complete conversation with success
      if (liveUpdates && conversationId) {
        await completeConversation(conversationId, {
          success: true,
          scriptType,
          script: result.script,
          explanation: result.explanation,
          durationMs: Date.now() - startTime
        });
      }
      
      return {
        success: true,
        script: result.script,
        scriptType,
        explanation: result.explanation,
        warnings: validation.warnings,  // Include any warnings
        conversationId
      };

    } catch (error) {
      console.error('ActionScriptGenerator: Error:', error.message);
      // Complete conversation with error
      if (liveUpdates && conversationId) {
        await completeConversation(conversationId, {
          success: false,
          error: error.message,
          durationMs: Date.now() - startTime
        });
      }
      return { success: false, error: error.message, conversationId };
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
        // Generate detailed validation report
        const report = generateValidationReport(script);
        
        if (report.parseError) {
          return { success: false, error: report.parseError };
        }

        // Log validation details
        console.log(`ActionScriptGenerator: Validation report - ${report.summary.total} steps, ${report.summary.valid} valid, ${report.summary.invalid} invalid`);
        
        if (!report.valid) {
          // Format detailed error message
          const errorDetails = report.errors.join('\n  - ');
          console.error(`ActionScriptGenerator: Validation errors:\n  - ${errorDetails}`);
          
          // Include hint about known action types if there's an unknown action
          const hasUnknownAction = report.errors.some(e => e.includes('Unknown action type'));
          let errorMsg = `Script validation failed with ${report.summary.invalid} error(s):\n${report.errors.join('; ')}`;
          
          if (hasUnknownAction) {
            const knownActions = getKnownActionTypes();
            errorMsg += `\n\nKnown action types: ${knownActions.join(', ')}`;
          }
          
          return { success: false, error: errorMsg };
        }

        // Log warnings if any
        if (report.warnings.length > 0) {
          console.warn(`ActionScriptGenerator: Validation warnings:`);
          report.warnings.forEach(w => console.warn(`  - ${w}`));
        }

        return { success: true, warnings: report.warnings };
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ActionScriptGenerator;
