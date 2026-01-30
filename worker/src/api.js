const express = require('express');
const ScriptGenerator = require('./script-generator');
const TestGenerator = require('./test-generator');
const ActionScriptGenerator = require('./action-script-generator');
const ActionTestGenerator = require('./action-test-generator');
const PageDiscovery = require('./page-discovery');
const { preparePage } = require('./browser-helpers');

/**
 * Worker HTTP API - Provides endpoints for script generation, test generation, and page discovery
 * This API is internal and should only be called by the main API server.
 */
class WorkerApi {
  constructor(browserPool) {
    this.browserPool = browserPool;
    this.scriptGenerator = new ScriptGenerator(browserPool);
    this.testGenerator = new TestGenerator(browserPool);
    this.actionScriptGenerator = new ActionScriptGenerator(browserPool);
    this.actionTestGenerator = new ActionTestGenerator(browserPool);
    this.pageDiscovery = new PageDiscovery(browserPool);
    this.app = express();
    this.server = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`WorkerAPI: ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        poolStatus: this.browserPool.getStatus()
      });
    });

    // Generate script endpoint (for instructions/actions - simple eval mode)
    this.app.post('/generate-script', async (req, res) => {
      const { pageUrl, prompt, viewport, sessionId } = req.body;

      if (!pageUrl || !prompt) {
        return res.status(400).json({ 
          error: 'Missing required fields: pageUrl and prompt' 
        });
      }

      try {
        const result = await this.scriptGenerator.generate(pageUrl, prompt, { viewport, sessionId });
        
        if (result.success) {
          res.json({
            success: true,
            script: result.script,
            scriptType: result.scriptType || 'eval',
            explanation: result.explanation,
            warning: result.warning
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('WorkerAPI: Generate script error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Generate test endpoint (for assertions/tests)
    this.app.post('/generate-test', async (req, res) => {
      const { pageUrl, prompt, viewport, sessionId } = req.body;

      if (!pageUrl || !prompt) {
        return res.status(400).json({ 
          error: 'Missing required fields: pageUrl and prompt' 
        });
      }

      try {
        const result = await this.testGenerator.generate(pageUrl, prompt, { viewport, sessionId });
        
        if (result.success) {
          res.json({
            success: true,
            script: result.script,
            scriptType: result.scriptType || 'eval',
            explanation: result.explanation,
            warning: result.warning,
            validationResult: result.validationResult
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('WorkerAPI: Generate test error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Generate action script endpoint (supports both eval and action DSL modes)
    // AI decides which mode to use based on instruction complexity
    this.app.post('/generate-action-script', async (req, res) => {
      const { pageUrl, prompt, viewport, sessionId } = req.body;

      if (!pageUrl || !prompt) {
        return res.status(400).json({ 
          error: 'Missing required fields: pageUrl and prompt' 
        });
      }

      try {
        const result = await this.actionScriptGenerator.generate(pageUrl, prompt, { viewport, sessionId });
        
        if (result.success) {
          res.json({
            success: true,
            script: result.script,
            scriptType: result.scriptType || 'eval',
            explanation: result.explanation,
            warning: result.warning
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('WorkerAPI: Generate action script error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Generate action test endpoint (supports both eval and action DSL modes)
    // AI decides which mode to use based on test complexity
    this.app.post('/generate-action-test', async (req, res) => {
      const { pageUrl, prompt, viewport, sessionId } = req.body;

      if (!pageUrl || !prompt) {
        return res.status(400).json({ 
          error: 'Missing required fields: pageUrl and prompt' 
        });
      }

      try {
        const result = await this.actionTestGenerator.generate(pageUrl, prompt, { viewport, sessionId });
        
        if (result.success) {
          res.json({
            success: true,
            script: result.script,
            scriptType: result.scriptType || 'eval',
            explanation: result.explanation,
            warning: result.warning,
            validationResult: result.validationResult
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('WorkerAPI: Generate action test error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Discover pages endpoint
    this.app.post('/discover-pages', async (req, res) => {
      const { domain, maxPages } = req.body;

      if (!domain) {
        return res.status(400).json({ 
          error: 'Missing required field: domain' 
        });
      }

      try {
        const result = await this.pageDiscovery.discover(domain, { 
          maxPages: maxPages || 10 
        });
        
        if (result.success) {
          res.json({
            success: true,
            pages: result.pages,
            totalFound: result.totalFound
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('WorkerAPI: Discover pages error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Test script endpoint (validates without generating)
    this.app.post('/test-script', async (req, res) => {
      const { pageUrl, script, viewport } = req.body;

      if (!pageUrl || !script) {
        return res.status(400).json({ 
          error: 'Missing required fields: pageUrl and script' 
        });
      }

      let browser = null;
      let page = null;

      try {
        browser = await this.browserPool.acquire();
        page = await browser.newPage();

        // Prepare page with viewport, navigation, and cookie consent handling
        // Uses same setup as screenshot capture for consistent page state
        await preparePage(page, pageUrl, { 
          viewport, 
          timeout: 60000,
          logPrefix: 'WorkerAPI[test-script]'
        });

        // Execute the script
        await page.evaluate(script);

        res.json({ success: true, message: 'Script executed successfully' });

      } catch (error) {
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      } finally {
        if (page) {
          try { await page.close(); } catch (e) {}
        }
        if (browser) {
          this.browserPool.release(browser);
        }
      }
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('WorkerAPI error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  start(port = 3001) {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, '0.0.0.0', () => {
        console.log(`WorkerAPI: Listening on port ${port}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('WorkerAPI: Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = WorkerApi;
