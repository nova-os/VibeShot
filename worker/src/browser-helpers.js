/**
 * Browser Helpers - Shared functions for page preparation before screenshots or script generation
 * 
 * These helpers ensure consistent browser setup between:
 * - Screenshot capture (worker/src/screenshot.js)
 * - Script generation (worker/src/script-generator.js, action-script-generator.js)
 * - Test generation (worker/src/test-generator.js, action-test-generator.js)
 */

/**
 * Standard viewport configurations
 */
const VIEWPORT_SIZES = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 }
};

/**
 * Simple sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Set up a Puppeteer page with viewport and timeouts
 * @param {Page} page - Puppeteer page instance
 * @param {Object} options - Setup options
 * @param {string|Object} options.viewport - Viewport name ('mobile', 'tablet', 'desktop') or custom {width, height}
 * @param {number} options.timeout - Navigation/default timeout in ms (default: 60000)
 * @returns {Promise<void>}
 */
async function setupPage(page, options = {}) {
  const { viewport = 'desktop', timeout = 60000 } = options;
  
  // Determine viewport dimensions
  let viewportConfig;
  if (typeof viewport === 'string') {
    viewportConfig = VIEWPORT_SIZES[viewport] || VIEWPORT_SIZES.desktop;
  } else if (typeof viewport === 'object' && viewport.width && viewport.height) {
    viewportConfig = viewport;
  } else {
    viewportConfig = VIEWPORT_SIZES.desktop;
  }
  
  // Set viewport
  await page.setViewport({
    width: viewportConfig.width,
    height: viewportConfig.height,
    deviceScaleFactor: 1
  });
  
  // Set timeouts
  page.setDefaultNavigationTimeout(timeout);
  page.setDefaultTimeout(timeout);
}

/**
 * Navigate to URL and wait for initial content
 * @param {Page} page - Puppeteer page instance
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @param {number} options.timeout - Navigation timeout in ms (default: 60000)
 * @param {string} options.waitUntil - Navigation wait condition (default: 'networkidle2')
 * @param {number} options.initialWait - Wait time after navigation in ms (default: 1000)
 * @returns {Promise<void>}
 */
async function navigateToPage(page, url, options = {}) {
  const { 
    timeout = 60000, 
    waitUntil = 'networkidle2',
    initialWait = 1000 
  } = options;
  
  await page.goto(url, {
    waitUntil,
    timeout
  });
  
  // Wait for initial content to render
  await sleep(initialWait);
}

/**
 * Try to dismiss cookie consent dialogs
 * Supports multiple consent management platforms and generic patterns
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<boolean>} True if a dialog was dismissed
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
            console.log('BrowserHelpers: Cookie consent dismissed in iframe');
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
      console.log('BrowserHelpers: Cookie consent dialog dismissed via text matching');
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
            console.log(`BrowserHelpers: Cookie consent dismissed via selector: ${selector}`);
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

    console.log('BrowserHelpers: Applied CSS hiding for potential cookie overlays');
    return false;

  } catch (error) {
    console.log('BrowserHelpers: Cookie consent dismissal attempt completed:', error.message);
    return false;
  }
}

/**
 * Full page preparation: navigate, wait, and dismiss cookie consent
 * This is the standard setup used before screenshot capture AND script generation
 * to ensure consistent page state.
 * 
 * @param {Page} page - Puppeteer page instance
 * @param {string} url - URL to navigate to
 * @param {Object} options - Options
 * @param {string|Object} options.viewport - Viewport name or custom {width, height}
 * @param {number} options.timeout - Timeout in ms (default: 60000)
 * @param {boolean} options.dismissCookies - Whether to dismiss cookie dialogs (default: true)
 * @param {string} options.logPrefix - Prefix for log messages (default: 'BrowserHelpers')
 * @returns {Promise<void>}
 */
async function preparePage(page, url, options = {}) {
  const { 
    viewport = 'desktop',
    timeout = 60000,
    dismissCookies = true,
    logPrefix = 'BrowserHelpers'
  } = options;
  
  // Setup viewport and timeouts
  await setupPage(page, { viewport, timeout });
  
  // Navigate to page
  console.log(`${logPrefix}: Navigating to ${url}`);
  await navigateToPage(page, url, { timeout });
  
  // Dismiss cookie consent dialogs if requested
  if (dismissCookies) {
    console.log(`${logPrefix}: Checking for cookie consent dialogs`);
    try {
      await dismissCookieConsent(page);
      
      // Wait and retry - some sites show multiple dialogs or delayed consent popups
      await sleep(1000);
      await dismissCookieConsent(page);
    } catch (consentError) {
      console.log(`${logPrefix}: Cookie consent handling completed`);
    }
    
    // Wait after dismissing consent
    await sleep(500);
  }
}

/**
 * Scroll through the entire page to trigger lazy-loaded content
 * @param {Page} page - Puppeteer page instance
 * @param {number} maxDuration - Maximum scroll duration in ms (default: 30000)
 */
async function autoScroll(page, maxDuration = 30000) {
  await page.evaluate(async (maxDuration) => {
    await new Promise((resolve) => {
      const scrollStep = 400; // Pixels to scroll each step
      const scrollDelay = 100; // Delay between scrolls (ms)
      let totalHeight = 0;
      let currentScroll = 0;

      let timer = null;
      timer = setInterval(() => {
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
      
      // Safety timeout - max scroll duration
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, maxDuration);
    });
  }, maxDuration);
}

// Export all helpers
module.exports = {
  VIEWPORT_SIZES,
  sleep,
  setupPage,
  navigateToPage,
  dismissCookieConsent,
  preparePage,
  autoScroll
};
