const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { executeActionSequence, parseActionSequence, collectAssertionResults } = require('./action-executor');
const { 
  sleep, 
  setupPage, 
  navigateToPage, 
  dismissCookieConsent, 
  autoScroll 
} = require('./browser-helpers');

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
  return captureScreenshotsWithProgress(browser, page, null);
}

/**
 * Capture screenshots for all viewports with progress callback
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} page - Page object from database (includes instructions array, tests array, and effective_viewports)
 * @param {Function|null} onProgress - Callback function(viewportName, completed, total) called after each viewport
 * @returns {Object} Object containing screenshot results, instruction execution results, and test results
 */
async function captureScreenshotsWithProgress(browser, page, onProgress) {
  const screenshotResults = [];
  const instructionResults = [];
  // testResultsByViewport: { 'desktop': [...], 'tablet': [...], 'mobile': [...] }
  const testResultsByViewport = {};
  
  // Get viewports from page settings (effective_viewports is resolved by scheduler)
  const viewportWidths = page.effective_viewports || DEFAULT_VIEWPORTS;
  
  // Sort widths descending (desktop first) for consistent ordering
  const sortedWidths = [...viewportWidths].sort((a, b) => b - a);
  const totalViewports = sortedWidths.length;
  
  let isFirstViewport = true;
  let completedViewports = 0;
  
  for (const width of sortedWidths) {
    const viewportName = getViewportName(width);
    const viewport = {
      name: viewportName,
      width: width,
      height: getViewportHeight(viewportName)
    };
    
    // Report progress at start of viewport capture
    if (onProgress) {
      try {
        await onProgress(viewportName, completedViewports, totalViewports);
      } catch (e) {
        // Ignore progress callback errors
      }
    }
    
    try {
      console.log(`Screenshot: Capturing ${viewport.name} viewport (${viewport.width}px) for ${page.url}`);
      const { screenshot, instructions, tests } = await captureScreenshotForViewport(browser, page, viewport);
      screenshotResults.push(screenshot);
      completedViewports++;
      
      // Collect instruction results (only from first viewport to avoid duplicates)
      if (isFirstViewport && instructions) {
        instructionResults.push(...instructions);
      }
      
      // Collect test results for each viewport (tests can be viewport-specific)
      if (tests && tests.length > 0) {
        testResultsByViewport[viewportName] = tests;
      }
      
      isFirstViewport = false;
      
      // Report progress after viewport complete
      if (onProgress) {
        try {
          await onProgress(viewportName, completedViewports, totalViewports);
        } catch (e) {
          // Ignore progress callback errors
        }
      }
    } catch (error) {
      console.error(`Screenshot: Failed to capture ${viewport.name} viewport (${width}px):`, error.message);
      // Continue with other viewports even if one fails
    }
  }
  
  return { screenshots: screenshotResults, instructionResults, testResultsByViewport };
}

/**
 * Execute AI-generated instructions on the page
 * Supports two modes:
 * - 'eval': Runs script in page context using page.evaluate()
 * - 'actions': Executes structured action sequence using Puppeteer API
 * 
 * @param {Page} browserPage - Puppeteer page instance
 * @param {Array} instructions - Array of instruction objects with script and script_type properties
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
      scriptType: instruction.script_type || 'eval',
      success: false,
      error: null,
      actionResults: null
    };
    
    try {
      console.log(`Screenshot: Running instruction "${instruction.name}" [${result.scriptType}] (${viewportName})`);
      
      if (instruction.script_type === 'actions') {
        // Action DSL mode - parse and execute action sequence
        const parseResult = parseActionSequence(instruction.script);
        if (!parseResult.success) {
          throw new Error(`Failed to parse action sequence: ${parseResult.error}`);
        }
        
        const execResult = await executeActionSequence(browserPage, parseResult.sequence, {
          stopOnError: true,
          logPrefix: `Screenshot[${instruction.name}]`
        });
        
        result.actionResults = execResult.results;
        
        if (!execResult.success) {
          const failedStep = execResult.results.find(r => !r.success);
          throw new Error(`Action sequence failed at step ${failedStep?.stepIndex + 1}: ${failedStep?.error}`);
        }
        
        result.success = true;
      } else {
        // Eval mode (default) - run script in page context
        await browserPage.evaluate(instruction.script);
        result.success = true;
      }
      
      // Wait for DOM updates after each instruction
      await sleep(500);
      console.log(`Screenshot: Instruction "${instruction.name}" completed (${viewportName})`);
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
 * Check if a test should run on a given viewport
 * @param {Object} test - Test object with optional viewports array
 * @param {string} viewportName - Current viewport name (desktop, tablet, mobile)
 * @returns {boolean} Whether the test should run on this viewport
 */
function shouldRunTestOnViewport(test, viewportName) {
  // If no viewports specified (null or empty), run on all viewports
  if (!test.viewports || test.viewports.length === 0) {
    return true;
  }
  
  // Parse viewports if it's a string (JSON from database)
  let viewports = test.viewports;
  if (typeof viewports === 'string') {
    try {
      viewports = JSON.parse(viewports);
    } catch (e) {
      return true; // If parsing fails, run on all viewports
    }
  }
  
  // Check if current viewport is in the list
  return Array.isArray(viewports) && viewports.includes(viewportName);
}

/**
 * Execute AI-generated tests on the page
 * Supports two modes:
 * - 'eval': Runs script in page context using page.evaluate(), expects { passed, message }
 * - 'actions': Executes action sequence with assertion steps
 * 
 * @param {Page} browserPage - Puppeteer page instance
 * @param {Array} tests - Array of test objects with script and script_type properties
 * @param {string} viewportName - Current viewport name for logging
 * @returns {Array} Array of test results with passed/failed status and messages
 */
async function executeTests(browserPage, tests, viewportName) {
  const results = [];
  
  if (!tests || tests.length === 0) {
    return results;
  }

  // Filter tests that are active, have a script, and should run on this viewport
  const activeTests = tests.filter(t => 
    t.is_active && 
    t.script && 
    shouldRunTestOnViewport(t, viewportName)
  );
  
  if (activeTests.length === 0) {
    return results;
  }

  console.log(`Screenshot: Running ${activeTests.length} test(s) (${viewportName})`);

  for (const test of activeTests) {
    const startTime = Date.now();
    const result = {
      testId: test.id,
      name: test.name,
      scriptType: test.script_type || 'eval',
      passed: false,
      message: null,
      executionTimeMs: 0,
      actionResults: null
    };
    
    try {
      console.log(`Screenshot: Running test "${test.name}" [${result.scriptType}] (${viewportName})`);
      
      if (test.script_type === 'actions') {
        // Action DSL mode - parse and execute action sequence
        const parseResult = parseActionSequence(test.script);
        if (!parseResult.success) {
          throw new Error(`Failed to parse action sequence: ${parseResult.error}`);
        }
        
        // Log the parsed sequence for debugging
        console.log(`Screenshot: Test "${test.name}" has ${parseResult.sequence.steps?.length || 0} steps (${viewportName})`);
        
        const execResult = await executeActionSequence(browserPage, parseResult.sequence, {
          stopOnError: false, // Run all assertions even if some fail
          logPrefix: `Screenshot[${test.name}]`
        });
        
        // Check for validation error (no steps were executed)
        if (execResult.error && execResult.results.length === 0) {
          throw new Error(execResult.error);
        }
        
        result.executionTimeMs = Date.now() - startTime;
        result.actionResults = execResult.results;
        
        // Log execution summary for debugging
        console.log(`Screenshot: Test "${test.name}" execution summary (${viewportName}):`);
        console.log(`  Total steps: ${execResult.totalSteps}, Completed: ${execResult.completedSteps}`);
        console.log(`  Overall success: ${execResult.success}`);
        
        // Check for ANY failed steps (both assertion and non-assertion)
        const allFailedSteps = execResult.results.filter(r => !r.success);
        const failedNonAssertSteps = allFailedSteps.filter(r => !r.action.startsWith('assert'));
        const failedAssertSteps = allFailedSteps.filter(r => r.action.startsWith('assert'));
        
        if (allFailedSteps.length > 0) {
          console.log(`  Failed steps: ${allFailedSteps.length} (${failedNonAssertSteps.length} action, ${failedAssertSteps.length} assertion)`);
        }
        
        // Check for failed non-assertion steps first (e.g., click failed, navigation timeout)
        if (failedNonAssertSteps.length > 0) {
          // Log detailed error info for each failed step
          for (const failedStep of failedNonAssertSteps) {
            console.error(`Screenshot: Test "${test.name}" step failed (${viewportName}):`);
            console.error(`  Step ${failedStep.stepIndex + 1}: ${failedStep.label || failedStep.action}`);
            console.error(`  Action: ${failedStep.action}`);
            console.error(`  Error: ${failedStep.error || 'Unknown error'}`);
          }
          
          // Build detailed error message
          const errorDetails = failedNonAssertSteps.map(s => 
            `Step ${s.stepIndex + 1} (${s.label || s.action}): ${s.error || 'Unknown error'}`
          ).join('; ');
          
          result.passed = false;
          result.message = `Action sequence failed: ${errorDetails}`;
        } else if (failedAssertSteps.length > 0) {
          // Assertion steps threw errors (different from assertion returning passed=false)
          for (const failedStep of failedAssertSteps) {
            console.error(`Screenshot: Test "${test.name}" assertion error (${viewportName}):`);
            console.error(`  Step ${failedStep.stepIndex + 1}: ${failedStep.label || failedStep.action}`);
            console.error(`  Error: ${failedStep.error || 'Unknown error'}`);
          }
          
          const errorDetails = failedAssertSteps.map(s => 
            `${s.label || s.action}: ${s.error || 'Unknown error'}`
          ).join('; ');
          
          result.passed = false;
          result.message = `Assertion error: ${errorDetails}`;
        } else {
          // All steps executed successfully (success=true), now check assertion results
          const assertionResults = collectAssertionResults(execResult.results);
          
          console.log(`  Assertions found: ${assertionResults.totalAssertions}, Passed: ${assertionResults.passed}, Failed: ${assertionResults.failed}`);
          
          if (assertionResults.totalAssertions > 0) {
            // Use assertion results to determine pass/fail
            result.passed = assertionResults.allPassed;
            
            if (assertionResults.allPassed) {
              result.message = `All ${assertionResults.totalAssertions} assertion(s) passed`;
            } else {
              const failedAssertions = assertionResults.results.filter(a => !a.passed);
              // Log detailed assertion failures
              for (const failed of failedAssertions) {
                console.error(`Screenshot: Test "${test.name}" assertion failed (${viewportName}):`);
                console.error(`  ${failed.label || failed.action}: ${failed.message || 'No message'}`);
              }
              result.message = failedAssertions.map(a => `${a.label || a.action}: ${a.message || 'Failed'}`).join('; ');
            }
          } else {
            // No assertions found - this might indicate a problem
            if (!execResult.success) {
              // Something failed but we don't know what
              const anyFailed = execResult.results.find(r => !r.success);
              const errorMsg = anyFailed 
                ? `Step ${anyFailed.stepIndex + 1} (${anyFailed.label || anyFailed.action}): ${anyFailed.error || 'Unknown error'}`
                : 'Unknown failure';
              console.error(`Screenshot: Test "${test.name}" failed with no assertions (${viewportName}): ${errorMsg}`);
              result.passed = false;
              result.message = `Action sequence failed: ${errorMsg}`;
            } else {
              // All steps completed but no assertions were found
              console.warn(`Screenshot: Test "${test.name}" has no assertions (${viewportName})`);
              result.passed = true;
              result.message = 'Action sequence completed successfully (no assertions found)';
            }
          }
        }
      } else {
        // Eval mode (default) - run script in page context
        const testResult = await browserPage.evaluate(test.script);
        result.executionTimeMs = Date.now() - startTime;
        
        // Validate the test result structure
        if (typeof testResult === 'object' && testResult !== null && typeof testResult.passed === 'boolean') {
          result.passed = testResult.passed;
          result.message = testResult.message || (testResult.passed ? 'Test passed' : 'Test failed');
        } else {
          result.passed = false;
          result.message = 'Test script did not return { passed: boolean, message: string }';
        }
      }
      
      const status = result.passed ? 'PASSED' : 'FAILED';
      console.log(`Screenshot: Test "${test.name}" ${status}: ${result.message} (${viewportName})`);
    } catch (error) {
      result.executionTimeMs = Date.now() - startTime;
      const errorMessage = error.message || String(error);
      const errorStack = error.stack || '';
      result.passed = false;
      result.message = `Script error: ${errorMessage}`;
      
      // Log detailed error information
      console.error(`Screenshot: Test "${test.name}" ERROR (${viewportName}):`);
      console.error(`  Script type: ${result.scriptType}`);
      console.error(`  Error: ${errorMessage}`);
      if (errorStack && errorStack !== errorMessage) {
        // Log first few lines of stack trace
        const stackLines = errorStack.split('\n').slice(0, 5).join('\n');
        console.error(`  Stack trace:\n${stackLines}`);
      }
      
      // If there were partial action results, log them too
      if (result.actionResults && result.actionResults.length > 0) {
        const completedSteps = result.actionResults.length;
        const failedStep = result.actionResults.find(r => !r.success);
        console.error(`  Completed ${completedSteps} step(s) before error`);
        if (failedStep) {
          console.error(`  Failed at step ${failedStep.stepIndex + 1}: ${failedStep.label || failedStep.action}`);
        }
      }
      
      // Continue with other tests even if one fails
    }
    
    results.push(result);
  }
  
  // Log summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log(`Screenshot: Tests completed - ${passed} passed, ${failed} failed (${viewportName})`);
  
  return results;
}

/**
 * Capture a single screenshot for a specific viewport
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} page - Page object from database
 * @param {Object} viewport - Viewport configuration
 * @returns {Object} Screenshot result with file paths, metadata, and captured errors
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
  
  // Collect JS and network errors during page load
  const jsErrors = [];
  const networkErrors = [];
  
  try {
    // Create new page
    browserPage = await browser.newPage();
    
    // Set up JS error listener (console errors and uncaught exceptions)
    browserPage.on('console', msg => {
      if (msg.type() === 'error') {
        const location = msg.location();
        jsErrors.push({
          type: 'js',
          message: msg.text(),
          source: location.url || null,
          lineNumber: location.lineNumber || null,
          columnNumber: location.columnNumber || null,
          stack: null
        });
      }
    });
    
    browserPage.on('pageerror', error => {
      jsErrors.push({
        type: 'js',
        message: error.message,
        source: null,
        lineNumber: null,
        columnNumber: null,
        stack: error.stack || null
      });
    });
    
    // Set up network error listener
    browserPage.on('requestfailed', request => {
      const failure = request.failure();
      // Only capture actual failures, not aborted requests (like canceled XHR)
      if (failure && failure.errorText !== 'net::ERR_ABORTED') {
        networkErrors.push({
          type: 'network',
          message: failure.errorText || 'Request failed',
          requestUrl: request.url(),
          requestMethod: request.method(),
          statusCode: null,
          resourceType: request.resourceType()
        });
      }
    });
    
    // Also capture HTTP errors (4xx, 5xx responses)
    browserPage.on('response', response => {
      const status = response.status();
      if (status >= 400) {
        networkErrors.push({
          type: 'network',
          message: `HTTP ${status} ${response.statusText()}`,
          requestUrl: response.url(),
          requestMethod: response.request().method(),
          statusCode: status,
          resourceType: response.request().resourceType()
        });
      }
    });
    
    // Set viewport and timeouts using shared helper
    await setupPage(browserPage, { 
      viewport: { width: viewport.width, height: viewport.height }, 
      timeout: 60000 
    });

    // Navigate to URL using shared helper
    console.log(`Screenshot: Navigating to ${page.url} (${viewport.name})`);
    await navigateToPage(browserPage, page.url, { timeout: 60000 });

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

    // Execute AI-generated tests (if any)
    let testResults = [];
    if (page.tests && page.tests.length > 0) {
      testResults = await executeTests(browserPage, page.tests, viewport.name);
    }

    // Scroll through entire page to trigger lazy loading
    console.log(`Screenshot: Scrolling to load lazy content... (${viewport.name})`);
    await autoScroll(browserPage);

    // Wait for any final content to load after scrolling
    await sleep(2000);

    // Scroll back to top
    await browserPage.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);

    console.log(`Screenshot: Setting viewport to ${viewport.width}x${viewport.height} (${viewport.name})`);
    // Resize viewport to full page size for capture
    await browserPage.setViewport({
      width: viewport.width,
      height: viewport.height,
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
    
    // Log error counts if any
    const totalErrors = jsErrors.length + networkErrors.length;
    if (totalErrors > 0) {
      console.log(`Screenshot: Captured ${jsErrors.length} JS errors and ${networkErrors.length} network errors (${viewport.name})`);
    }

    return {
      screenshot: {
        viewport: viewport.name,
        viewportWidth: viewport.width,
        filePath: relativeFilePath,
        thumbnailPath: relativeThumbnailPath,
        fileSize: stats.size,
        width: metadata.width,
        height: metadata.height,
        errors: [...jsErrors, ...networkErrors]
      },
      instructions: instructionResults,
      tests: testResults
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

// Export functions
module.exports = { captureScreenshots, captureScreenshotsWithProgress, captureScreenshotForViewport, executeInstructions, executeTests, getViewportName, DEFAULT_VIEWPORTS };
