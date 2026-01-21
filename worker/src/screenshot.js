const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/app/screenshots';
const THUMBNAIL_WIDTH = 400;

// Default viewports (fallback when no user settings exist)
const DEFAULT_VIEWPORTS = [1920, 768, 375];

/**
 * Get viewport category name based on width
 * @param {number} width - Viewport width in pixels
 * @returns {string} Viewport category name
 */
function getViewportName(width) {
  if (width <= 480) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

/**
 * Get viewport height based on category
 * @param {string} name - Viewport category name
 * @returns {number} Viewport height
 */
function getViewportHeight(name) {
  switch (name) {
    case 'mobile': return 812;
    case 'tablet': return 1024;
    default: return 1080;
  }
}

/**
 * Capture screenshots for all viewports
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} page - Page object from database (includes instructions array and effective_viewports)
 * @returns {Object} Object containing screenshot results and instruction execution results
 */
async function captureScreenshots(browser, page) {
  const screenshotResults = [];
  const instructionResults = [];
  
  // Get viewports from page settings (effective_viewports is resolved by scheduler)
  const viewportWidths = page.effective_viewports || DEFAULT_VIEWPORTS;
  
  // Sort widths descending (desktop first) for consistent ordering
  const sortedWidths = [...viewportWidths].sort((a, b) => b - a);
  
  let isFirstViewport = true;
  for (const width of sortedWidths) {
    const viewportName = getViewportName(width);
    const viewport = {
      name: viewportName,
      width: width,
      height: getViewportHeight(viewportName)
    };
    
    try {
      console.log(`Screenshot: Capturing ${viewport.name} viewport (${viewport.width}px) for ${page.url}`);
      const { screenshot, instructions } = await captureScreenshotForViewport(browser, page, viewport);
      screenshotResults.push(screenshot);
      
      // Collect instruction results (only from first viewport to avoid duplicates)
      if (isFirstViewport && instructions) {
        instructionResults.push(...instructions);
      }
      isFirstViewport = false;
    } catch (error) {
      console.error(`Screenshot: Failed to capture ${viewport.name} viewport (${width}px):`, error.message);
      // Continue with other viewports even if one fails
    }
  }
  
  return { screenshots: screenshotResults, instructionResults };
}

/**
 * Execute AI-generated instructions on the page
 * @param {Page} browserPage - Puppeteer page instance
 * @param {Array} instructions - Array of instruction objects with script property
 * @param {string} viewportName - Current viewport name for logging
 * @returns {Array} Array of execution results with success/error status for each instruction
 */
async function executeInstructions(browserPage, instructions, viewportName) {
  const results = [];
  
  if (!instructions || instructions.length === 0) {
    return results;
  }

  const activeInstructions = instructions.filter(i => i.is_active && i.script);
  
  if (activeInstructions.length === 0) {
    return results;
  }

  console.log(`Screenshot: Executing ${activeInstructions.length} instruction(s) (${viewportName})`);

  for (const instruction of activeInstructions) {
    const result = {
      instructionId: instruction.id,
      name: instruction.name,
      success: false,
      error: null
    };
    
    try {
      console.log(`Screenshot: Running instruction "${instruction.name}" (${viewportName})`);
      await browserPage.evaluate(instruction.script);
      // Wait for DOM updates after each instruction
      await sleep(500);
      console.log(`Screenshot: Instruction "${instruction.name}" completed (${viewportName})`);
      result.success = true;
    } catch (error) {
      const errorMessage = error.message || String(error);
      console.error(`Screenshot: Instruction "${instruction.name}" failed (${viewportName}):`, errorMessage);
      result.error = errorMessage;
      // Continue with other instructions even if one fails
    }
    
    results.push(result);
  }

  // Wait a bit more after all instructions for any animations/transitions
  await sleep(500);
  
  return results;
}

/**
 * Capture a single screenshot for a specific viewport
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} page - Page object from database
 * @param {Object} viewport - Viewport configuration
 * @returns {Object} Screenshot result with file paths and metadata
 */
async function captureScreenshotForViewport(browser, page, viewport) {
  const timestamp = Date.now();
  const pageId = page.id;
  
  // Create directory structure: pageId/year/month/
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dirPath = path.join(SCREENSHOTS_DIR, String(pageId), String(year), month);
  
  await fs.mkdir(dirPath, { recursive: true });

  // Generate filenames with viewport identifier
  const filename = `${timestamp}_${viewport.name}.png`;
  const thumbnailFilename = `${timestamp}_${viewport.name}_thumb.png`;
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
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1
    });

    // Set timeout
    browserPage.setDefaultNavigationTimeout(60000);
    browserPage.setDefaultTimeout(60000);

    // Navigate to URL
    console.log(`Screenshot: Navigating to ${page.url} (${viewport.name})`);
    await browserPage.goto(page.url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for initial content to render
    await sleep(1000);

    // Try to dismiss cookie consent dialogs (with retry for delayed dialogs)
    console.log(`Screenshot: Checking for cookie consent dialogs (${viewport.name})`);
    try {
      await dismissCookieConsent(browserPage);
      
      // Wait and retry - some sites show multiple dialogs or delayed consent popups
      await sleep(1000);
      await dismissCookieConsent(browserPage);
    } catch (consentError) {
      console.log(`Screenshot: Cookie consent handling completed (${viewport.name})`);
    }
    
    // Wait after dismissing consent
    await sleep(500);

    // Execute AI-generated instructions (if any)
    let instructionResults = [];
    if (page.instructions && page.instructions.length > 0) {
      instructionResults = await executeInstructions(browserPage, page.instructions, viewport.name);
    }

    // Scroll through entire page to trigger lazy loading
    console.log(`Screenshot: Scrolling to load lazy content... (${viewport.name})`);
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

    console.log(`Screenshot: Page dimensions: ${pageWidth}x${pageHeight} (${viewport.name})`);

    // Resize viewport to full page size for capture
    await browserPage.setViewport({
      width: Math.min(pageWidth, viewport.width),
      height: pageHeight,
      deviceScaleFactor: 1
    });

    // Wait for any reflow after viewport change
    await sleep(500);

    // Take full page screenshot
    console.log(`Screenshot: Capturing full page screenshot (${viewport.name})`);
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
    console.log(`Screenshot: Generating thumbnail (${viewport.name})`);
    await sharp(screenshotBuffer)
      .resize(THUMBNAIL_WIDTH, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .png({ quality: 80 })
      .toFile(thumbnailPath);

    console.log(`Screenshot: Saved to ${relativeFilePath}`);

    return {
      screenshot: {
        viewport: viewport.name,
        viewportWidth: viewport.width,
        filePath: relativeFilePath,
        thumbnailPath: relativeThumbnailPath,
        fileSize: stats.size,
        width: metadata.width,
        height: metadata.height
      },
      instructions: instructionResults
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
 * Try to dismiss cookie consent dialogs
 * @param {Page} page - Puppeteer page instance
 */
async function dismissCookieConsent(page) {
  // Common cookie consent button selectors for popular libraries
  const consentSelectors = [
    // OneTrust
    '#onetrust-accept-btn-handler',
    '.onetrust-accept-btn-handler',
    // Cookiebot
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    '[data-cookiebanner="accept_button"]',
    // Cookie Consent (Osano)
    '.cc-accept',
    '.cc-btn.cc-allow',
    // Generic common selectors
    '#cookie-consent-accept',
    '.cookie-consent-accept',
    '[data-consent="accept"]',
    '.js-cookie-consent-agree',
    '#accept-cookies',
    '.accept-cookies',
    '#gdpr-consent-accept',
    '.gdpr-consent-accept',
    '[aria-label="Accept cookies"]',
    '[aria-label="Accept all cookies"]',
    '.cookie-notice-accept',
    '#cookie_action_close_header',
    '.cookie-popup-accept',
    // EU Cookie Law
    '.eupopup-button',
    // Cookie Notice
    '#cn-accept-cookie',
    // CookieYes
    '.cli-plugin-button',
    '#wt-cli-accept-all-btn',
    // Complianz
    '.cmplz-accept',
    '#cmplz-cookiebanner-container .cmplz-accept',
    // Borlabs Cookie
    '.BorlabsCookie .brlbs-btn-accept-all',
    '#BorlabsCookieBox a[data-cookie-accept-all]',
    '[data-cookie-accept-all]',
    // Real Cookie Banner (WordPress plugin)
    '.rcb-btn-accept',
    '[data-rcb-accept="all"]',
    // Generic German consent patterns
    'button[aria-label*="akzeptiere"]',
    'button[aria-label*="Akzeptiere"]',
    '[role="alertdialog"] button:first-of-type',
    // Quantcast
    '.qc-cmp2-summary-buttons button[mode="primary"]',
    // Didomi
    '#didomi-notice-agree-button',
    // TrustArc
    '.truste-consent-button',
    '.trustarc-agree-btn',
    // Sourcepoint (used by heise.de and many German sites)
    'button[title="Agree"]',
    'button[title="Zustimmen"]',
    '.sp_choice_type_11',
    '.message-button[title*="Agree"]',
    '.message-button[title*="Accept"]',
    '[data-choice-type="11"]',
    // Usercentrics
    '#uc-btn-accept-banner',
    '.uc-accept-button',
    // Generic modal/dialog buttons
    '.modal button.primary',
    '.dialog button.primary',
    '[class*="consent"] button[class*="primary"]',
    '[class*="consent"] button[class*="accept"]',
  ];

  try {
    // Method 0: Handle iframes (many consent managers use iframes)
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        
        // Get frame URL to identify consent management platforms
        const frameUrl = frame.url() || '';
        const isConsentFrame = frameUrl.includes('cmp.') || 
                               frameUrl.includes('consent') ||
                               frameUrl.includes('sourcepoint') ||
                               frameUrl.includes('privacy') ||
                               frameUrl.includes('gdpr') ||
                               frameUrl.includes('cookie');
        
        try {
          const frameClicked = await Promise.race([
            frame.evaluate((isConsentFrame) => {
              // More specific patterns first, avoid false positives
              const acceptPatterns = [
                'ich akzeptiere alle', 'alle akzeptieren', 'einwilligung speichern',
                'accept all', 'accept cookies', 'allow all', 'i agree',
                'zustimmen', 'einverstanden', 'verstanden', 'got it', 'agree'
              ];
              
              // For consent frames, also try specific selectors
              if (isConsentFrame) {
                // Sourcepoint specific selectors
                const sourcepointBtn = document.querySelector('button[title="Zustimmen"], button[title="Agree"], button[title="Accept all"], .sp_choice_type_11');
                if (sourcepointBtn) {
                  sourcepointBtn.click();
                  return true;
                }
              }
              
              const buttons = [...document.querySelectorAll('button, [role="button"], a.button, .btn, [class*="button"]')];
              for (const acceptText of acceptPatterns) {
                for (const button of buttons) {
                  const text = (button.textContent || '').toLowerCase().trim();
                  const title = (button.getAttribute('title') || '').toLowerCase();
                  
                  if (text.includes(acceptText) || title.includes(acceptText)) {
                    const rect = button.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      button.click();
                      return true;
                    }
                  }
                }
              }
              return false;
            }, isConsentFrame),
            // Timeout after 3 seconds per frame
            new Promise(resolve => setTimeout(() => resolve(false), 3000))
          ]);
          
          if (frameClicked) {
            console.log('Screenshot: Cookie consent dismissed in iframe');
            await sleep(500);
            return true;
          }
        } catch (e) {
          // Frame may have navigated or been removed, continue silently
        }
      }
    } catch (e) {
      // Continue with main page methods
    }

    // Method 1: Try clicking buttons with common accept text
    const clicked = await page.evaluate(() => {
      // Patterns ordered from most specific to least specific
      // Avoid short words that could match parts of other words (e.g., "ok" in "cookie")
      const acceptPatterns = [
        // German - most specific first
        { text: 'ich akzeptiere alle', exact: false },
        { text: 'alle akzeptieren', exact: false },
        { text: 'alle cookies akzeptieren', exact: false },
        { text: 'einwilligung speichern', exact: false },
        { text: 'cookies akzeptieren', exact: false },
        { text: 'akzeptiere alle', exact: false },
        { text: 'alle zulassen', exact: false },
        { text: 'cookies zulassen', exact: false },
        { text: 'zustimmen', exact: false },
        { text: 'einverstanden', exact: false },
        { text: 'verstanden', exact: false },
        // English
        { text: 'accept all cookies', exact: false },
        { text: 'accept all', exact: false },
        { text: 'accept cookies', exact: false },
        { text: 'allow all cookies', exact: false },
        { text: 'allow all', exact: false },
        { text: 'allow cookies', exact: false },
        { text: 'i agree', exact: false },
        { text: 'agree', exact: true },  // exact to avoid "disagree"
        { text: 'got it', exact: false },
        { text: 'accept', exact: true }, // exact to avoid matching in other contexts
        // French
        { text: 'tout accepter', exact: false },
        { text: 'accepter tout', exact: false },
        { text: 'accepter', exact: true },
        // Spanish
        { text: 'aceptar todo', exact: false },
        { text: 'aceptar', exact: true },
        // Italian
        { text: 'accetta tutti', exact: false },
        { text: 'accetta', exact: true },
        // Short words - only match as standalone or at word boundaries
        { text: 'ok', exact: true },
        { text: 'okay', exact: true },
      ];
      
      // Helper function to check if pattern matches with word boundaries
      const matchesPattern = (text, pattern, exact) => {
        if (exact) {
          // For exact matches, check word boundaries
          const regex = new RegExp(`(^|\\s|[^a-zA-ZäöüÄÖÜß])${pattern}($|\\s|[^a-zA-ZäöüÄÖÜß])`, 'i');
          return regex.test(text) || text === pattern;
        }
        return text.includes(pattern);
      };
      
      // Find all buttons and clickable elements
      const buttons = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], .btn, [class*="button"]')];
      
      for (const { text: acceptText, exact } of acceptPatterns) {
        for (const button of buttons) {
          const text = (button.textContent || button.value || '').toLowerCase().trim();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          
          if (matchesPattern(text, acceptText, exact) || matchesPattern(ariaLabel, acceptText, exact)) {
            // Check if button is visible
            const rect = button.getBoundingClientRect();
            const style = window.getComputedStyle(button);
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden' &&
                style.opacity !== '0') {
              button.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (clicked) {
      console.log('Screenshot: Cookie consent dialog dismissed via text matching');
      await sleep(500); // Wait for dialog to close
      return true;
    }

    // Method 2: Try specific selectors for popular consent libraries
    for (const selector of consentSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && 
                   style.display !== 'none' && 
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
          }, element);
          
          if (isVisible) {
            await element.click();
            console.log(`Screenshot: Cookie consent dismissed via selector: ${selector}`);
            await sleep(500);
            return true;
          }
        }
      } catch (e) {
        // Selector didn't match, continue
      }
    }

    // Method 3: Hide any remaining cookie overlays via CSS
    await page.evaluate(() => {
      const overlaySelectors = [
        '#onetrust-banner-sdk',
        '#onetrust-consent-sdk',
        '#CybotCookiebotDialog',
        '#CybotCookiebotDialogBodyUnderlay',
        '.cc-window',
        '.cookie-consent',
        '.cookie-banner',
        '.cookie-notice',
        '.cookie-popup',
        '.cookie-modal',
        '.cookie-overlay',
        '.gdpr-banner',
        '.privacy-banner',
        '.consent-banner',
        '[class*="cookie-consent"]',
        '[class*="cookie-banner"]',
        '[class*="cookieconsent"]',
        '[id*="cookie-consent"]',
        '[id*="cookie-banner"]',
        '[id*="cookieconsent"]',
        '#didomi-popup',
        '.didomi-popup-container',
        '.qc-cmp2-container',
        '.truste-consent-content',
        '[class*="CookieConsent"]',
        '[id*="CookieConsent"]'
      ];
      
      let hidden = false;
      overlaySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          el.style.setProperty('display', 'none', 'important');
          hidden = true;
        });
      });
      
      // Also remove any body overflow hidden that might have been set
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
      
      return hidden;
    });

    console.log('Screenshot: Applied CSS hiding for potential cookie overlays');
    return false;

  } catch (error) {
    console.log('Screenshot: Cookie consent dismissal attempt completed:', error.message);
    return false;
  }
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

// Export functions
module.exports = { captureScreenshots, captureScreenshotForViewport, executeInstructions, getViewportName, DEFAULT_VIEWPORTS };
