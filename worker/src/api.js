const express = require('express');
const ScriptGenerator = require('./script-generator');
const PageDiscovery = require('./page-discovery');

/**
 * Worker HTTP API - Provides endpoints for script generation and page discovery
 * This API is internal and should only be called by the main API server.
 */
class WorkerApi {
  constructor(browserPool) {
    this.browserPool = browserPool;
    this.scriptGenerator = new ScriptGenerator(browserPool);
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

    // Generate script endpoint
    this.app.post('/generate-script', async (req, res) => {
      const { pageUrl, prompt, viewport } = req.body;

      if (!pageUrl || !prompt) {
        return res.status(400).json({ 
          error: 'Missing required fields: pageUrl and prompt' 
        });
      }

      try {
        const result = await this.scriptGenerator.generate(pageUrl, prompt, { viewport });
        
        if (result.success) {
          res.json({
            success: true,
            script: result.script,
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

        const viewportSizes = {
          mobile: { width: 375, height: 812 },
          tablet: { width: 768, height: 1024 },
          desktop: { width: 1920, height: 1080 }
        };
        
        await page.setViewport(viewportSizes[viewport] || viewportSizes.desktop);
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for page to stabilize
        await new Promise(r => setTimeout(r, 1000));

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
