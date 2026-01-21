const puppeteer = require('puppeteer');

class BrowserPool {
  constructor(size = 4) {
    this.size = size;
    this.browsers = [];
    this.availableBrowsers = [];
    this.waitingQueue = [];
    this.isShuttingDown = false;
  }

  async initialize() {
    console.log(`BrowserPool: Initializing ${this.size} browsers...`);
    
    const launchPromises = [];
    for (let i = 0; i < this.size; i++) {
      launchPromises.push(this.createBrowser(i));
    }

    const results = await Promise.allSettled(launchPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const browser = result.value;
        this.browsers.push(browser);
        this.availableBrowsers.push(browser);
      } else {
        console.error('BrowserPool: Failed to launch browser:', result.reason);
      }
    }

    if (this.browsers.length === 0) {
      throw new Error('BrowserPool: Failed to launch any browsers');
    }

    console.log(`BrowserPool: ${this.browsers.length}/${this.size} browsers initialized`);
  }

  async createBrowser(index) {
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    // Handle browser disconnect
    browser.on('disconnected', () => {
      if (!this.isShuttingDown) {
        console.log(`BrowserPool: Browser ${index} disconnected, respawning...`);
        this.handleBrowserCrash(browser, index);
      }
    });

    browser._poolIndex = index;
    console.log(`BrowserPool: Browser ${index} launched`);
    return browser;
  }

  async handleBrowserCrash(crashedBrowser, index) {
    // Remove crashed browser from arrays
    this.browsers = this.browsers.filter(b => b !== crashedBrowser);
    this.availableBrowsers = this.availableBrowsers.filter(b => b !== crashedBrowser);

    // Try to respawn
    try {
      const newBrowser = await this.createBrowser(index);
      this.browsers.push(newBrowser);
      
      // If there are waiting requests, fulfill them
      if (this.waitingQueue.length > 0) {
        const { resolve } = this.waitingQueue.shift();
        resolve(newBrowser);
      } else {
        this.availableBrowsers.push(newBrowser);
      }
      
      console.log(`BrowserPool: Browser ${index} respawned successfully`);
    } catch (error) {
      console.error(`BrowserPool: Failed to respawn browser ${index}:`, error.message);
    }
  }

  async acquire() {
    if (this.isShuttingDown) {
      throw new Error('BrowserPool: Pool is shutting down');
    }

    // If there's an available browser, return it immediately
    if (this.availableBrowsers.length > 0) {
      const browser = this.availableBrowsers.shift();
      return browser;
    }

    // Otherwise, wait for one to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('BrowserPool: Timeout waiting for available browser'));
      }, 300000); // 5 minute timeout

      this.waitingQueue.push({
        resolve: (browser) => {
          clearTimeout(timeout);
          resolve(browser);
        },
        reject
      });
    });
  }

  release(browser) {
    if (this.isShuttingDown) return;

    // Check if browser is still connected
    if (!browser.isConnected()) {
      console.log('BrowserPool: Released browser is disconnected, will be respawned');
      return;
    }

    // If there are waiting requests, give browser to next in queue
    if (this.waitingQueue.length > 0) {
      const { resolve } = this.waitingQueue.shift();
      resolve(browser);
    } else {
      this.availableBrowsers.push(browser);
    }
  }

  async shutdown() {
    console.log('BrowserPool: Shutting down...');
    this.isShuttingDown = true;

    // Reject all waiting requests
    for (const { reject } of this.waitingQueue) {
      reject(new Error('BrowserPool: Pool is shutting down'));
    }
    this.waitingQueue = [];

    // Close all browsers
    const closePromises = this.browsers.map(async (browser, index) => {
      try {
        await browser.close();
        console.log(`BrowserPool: Browser ${index} closed`);
      } catch (error) {
        console.error(`BrowserPool: Error closing browser ${index}:`, error.message);
      }
    });

    await Promise.all(closePromises);
    
    this.browsers = [];
    this.availableBrowsers = [];
    
    console.log('BrowserPool: Shutdown complete');
  }

  getStats() {
    return {
      total: this.browsers.length,
      available: this.availableBrowsers.length,
      inUse: this.browsers.length - this.availableBrowsers.length,
      waiting: this.waitingQueue.length
    };
  }

  // Alias for API compatibility
  getStatus() {
    return this.getStats();
  }
}

module.exports = BrowserPool;
