const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/app/screenshots';
const THUMBNAIL_WIDTH = 400;

async function captureScreenshot(browser, page) {
  const timestamp = Date.now();
  const pageId = page.id;
  
  // Create directory structure: pageId/year/month/
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dirPath = path.join(SCREENSHOTS_DIR, String(pageId), String(year), month);
  
  await fs.mkdir(dirPath, { recursive: true });

  // Generate filenames
  const filename = `${timestamp}.png`;
  const thumbnailFilename = `${timestamp}_thumb.png`;
  const fullPath = path.join(dirPath, filename);
  const thumbnailPath = path.join(dirPath, thumbnailFilename);
  
  // Relative paths for database storage
  const relativeFilePath = path.join(String(pageId), String(year), month, filename);
  const relativeThumbnailPath = path.join(String(pageId), String(year), month, thumbnailFilename);

  let browserPage = null;
  
  try {
    // Create new page
    browserPage = await browser.newPage();
    
    // Set viewport
    await browserPage.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });

    // Set timeout
    browserPage.setDefaultNavigationTimeout(60000);
    browserPage.setDefaultTimeout(60000);

    // Navigate to URL
    console.log(`Screenshot: Navigating to ${page.url}`);
    await browserPage.goto(page.url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for initial content
    await sleep(1000);

    // Scroll through entire page to trigger lazy loading
    console.log(`Screenshot: Scrolling to load lazy content...`);
    await autoScroll(browserPage);

    // Wait for any final content to load after scrolling
    await sleep(2000);

    // Scroll back to top
    await browserPage.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);

    // Get the full page dimensions
    const bodyHandle = await browserPage.$('body');
    const boundingBox = await bodyHandle.boundingBox();
    await bodyHandle.dispose();

    // Get full document height (more reliable than bounding box)
    const pageHeight = await browserPage.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
    });

    const pageWidth = await browserPage.evaluate(() => {
      return Math.max(
        document.body.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.clientWidth,
        document.documentElement.scrollWidth,
        document.documentElement.offsetWidth
      );
    });

    console.log(`Screenshot: Page dimensions: ${pageWidth}x${pageHeight}`);

    // Resize viewport to full page size for capture
    await browserPage.setViewport({
      width: Math.min(pageWidth, 1920),
      height: pageHeight,
      deviceScaleFactor: 1
    });

    // Wait for any reflow after viewport change
    await sleep(500);

    // Take full page screenshot
    console.log(`Screenshot: Capturing full page screenshot`);
    const screenshotBuffer = await browserPage.screenshot({
      fullPage: true,
      type: 'png'
    });

    // Save screenshot
    await fs.writeFile(fullPath, screenshotBuffer);
    const stats = await fs.stat(fullPath);

    // Get image dimensions
    const metadata = await sharp(screenshotBuffer).metadata();

    // Generate thumbnail
    console.log(`Screenshot: Generating thumbnail`);
    await sharp(screenshotBuffer)
      .resize(THUMBNAIL_WIDTH, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .png({ quality: 80 })
      .toFile(thumbnailPath);

    console.log(`Screenshot: Saved to ${relativeFilePath}`);

    return {
      filePath: relativeFilePath,
      thumbnailPath: relativeThumbnailPath,
      fileSize: stats.size,
      width: metadata.width,
      height: metadata.height
    };

  } finally {
    // Always close the page
    if (browserPage) {
      try {
        await browserPage.close();
      } catch (error) {
        console.error('Screenshot: Error closing page:', error.message);
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scroll through the entire page to trigger lazy-loaded content
 * @param {Page} page - Puppeteer page instance
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const scrollStep = 400; // Pixels to scroll each step
      const scrollDelay = 100; // Delay between scrolls (ms)
      let totalHeight = 0;
      let currentScroll = 0;
      
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        
        window.scrollBy(0, scrollStep);
        currentScroll += scrollStep;
        totalHeight = scrollHeight;
        
        // Stop when we've scrolled past the total height
        if (currentScroll >= totalHeight) {
          clearInterval(timer);
          resolve();
        }
      }, scrollDelay);
      
      // Safety timeout - max 30 seconds of scrolling
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 30000);
    });
  });
}

module.exports = { captureScreenshot };
