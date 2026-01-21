const Scheduler = require('./scheduler');
const BrowserPool = require('./browser-pool');
const WorkerApi = require('./api');

const POOL_SIZE = parseInt(process.env.BROWSER_POOL_SIZE) || 4;
const API_PORT = parseInt(process.env.WORKER_API_PORT) || 3001;

async function main() {
  console.log('AIShot Worker starting...');
  console.log(`Browser pool size: ${POOL_SIZE}`);

  // Initialize browser pool
  const browserPool = new BrowserPool(POOL_SIZE);
  await browserPool.initialize();
  console.log('Browser pool initialized');

  // Initialize and start Worker API
  const workerApi = new WorkerApi(browserPool);
  await workerApi.start(API_PORT);
  console.log(`Worker API started on port ${API_PORT}`);

  // Initialize scheduler
  const scheduler = new Scheduler(browserPool);
  
  // Start the scheduling loop
  scheduler.start();
  console.log('Scheduler started');

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    scheduler.stop();
    await workerApi.stop();
    await browserPool.shutdown();
    console.log('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep process running
  console.log('Worker is running. Press Ctrl+C to stop.');
}

main().catch(err => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
