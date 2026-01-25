/**
 * Integration tests for the test generation feature
 * 
 * These tests call the worker API to generate test scripts using AI (Gemini).
 * 
 * Prerequisites:
 * - Docker services must be running (./scripts/start.sh)
 * - GEMINI_API_KEY must be configured in .env
 * 
 * Usage:
 *   # Run from project root
 *   node worker/tests/test-generation.test.js
 * 
 *   # Or with custom worker URL
 *   WORKER_API_URL=http://localhost:3001 node worker/tests/test-generation.test.js
 */

const WORKER_API_URL = process.env.WORKER_API_URL || 'http://localhost:3001';

// Test utilities
let passedTests = 0;
let failedTests = 0;

function log(message) {
  console.log(`[TEST] ${message}`);
}

function success(testName) {
  passedTests++;
  console.log(`  ✓ ${testName}`);
}

function fail(testName, error) {
  failedTests++;
  console.error(`  ✗ ${testName}`);
  console.error(`    Error: ${error}`);
}

async function callWorkerApi(endpoint, body) {
  const response = await fetch(`${WORKER_API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    data: await response.json()
  };
}

// ============================================
// Test Cases
// ============================================

/**
 * Test: Health check endpoint
 */
async function testHealthCheck() {
  const testName = 'Worker API health check';
  try {
    const response = await fetch(`${WORKER_API_URL}/health`);
    const data = await response.json();
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    if (data.status !== 'ok') {
      throw new Error(`Expected status 'ok', got '${data.status}'`);
    }
    if (!data.poolStatus) {
      throw new Error('Missing poolStatus in health response');
    }
    
    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

/**
 * Test: Generate test validation - missing required fields
 */
async function testGenerateTestMissingFields() {
  const testName = 'Generate test - missing required fields returns 400';
  try {
    // Missing both pageUrl and prompt
    const result1 = await callWorkerApi('/generate-test', {});
    if (result1.status !== 400) {
      throw new Error(`Expected status 400, got ${result1.status}`);
    }

    // Missing prompt
    const result2 = await callWorkerApi('/generate-test', { pageUrl: 'https://example.com' });
    if (result2.status !== 400) {
      throw new Error(`Expected status 400 for missing prompt, got ${result2.status}`);
    }

    // Missing pageUrl
    const result3 = await callWorkerApi('/generate-test', { prompt: 'Check something' });
    if (result3.status !== 400) {
      throw new Error(`Expected status 400 for missing pageUrl, got ${result3.status}`);
    }

    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

/**
 * Test: Generate simple eval mode test script
 * Uses a simple prompt to verify a basic page element exists
 */
async function testGenerateEvalModeTest() {
  const testName = 'Generate eval mode test script';
  try {
    log('Generating eval mode test (this may take 10-30 seconds)...');
    
    const result = await callWorkerApi('/generate-test', {
      pageUrl: 'https://example.com',
      prompt: 'Verify that the page has an h1 heading element',
      viewport: 'desktop'
    });

    if (result.status !== 200) {
      throw new Error(`Expected status 200, got ${result.status}: ${JSON.stringify(result.data)}`);
    }

    const { data } = result;
    
    if (!data.success) {
      throw new Error(`Generation failed: ${data.error}`);
    }
    
    if (!data.script) {
      throw new Error('No script returned in response');
    }
    
    if (data.scriptType !== 'eval') {
      throw new Error(`Expected scriptType 'eval', got '${data.scriptType}'`);
    }
    
    if (!data.explanation) {
      throw new Error('No explanation returned in response');
    }

    // Validate script looks like a test (should contain passed/message)
    if (!data.script.includes('passed') || !data.script.includes('message')) {
      throw new Error('Script does not appear to be a valid test (missing passed/message)');
    }

    log(`  Generated script (${data.script.length} chars): ${data.explanation}`);
    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

/**
 * Test: Generate action DSL mode test script
 * Uses a prompt that should trigger action sequence generation
 */
async function testGenerateActionModeTest() {
  const testName = 'Generate action DSL mode test script';
  try {
    log('Generating action mode test (this may take 10-30 seconds)...');
    
    const result = await callWorkerApi('/generate-action-test', {
      pageUrl: 'https://example.com',
      prompt: 'Verify that the page title contains "Example" and there is a link to IANA',
      viewport: 'desktop'
    });

    if (result.status !== 200) {
      throw new Error(`Expected status 200, got ${result.status}: ${JSON.stringify(result.data)}`);
    }

    const { data } = result;
    
    if (!data.success) {
      throw new Error(`Generation failed: ${data.error}`);
    }
    
    if (!data.script) {
      throw new Error('No script returned in response');
    }
    
    // Action mode should return 'actions' scriptType
    if (data.scriptType !== 'actions') {
      throw new Error(`Expected scriptType 'actions', got '${data.scriptType}'`);
    }
    
    if (!data.explanation) {
      throw new Error('No explanation returned in response');
    }

    // Validate script is valid JSON with steps
    let parsed;
    try {
      parsed = JSON.parse(data.script);
    } catch (e) {
      throw new Error(`Script is not valid JSON: ${e.message}`);
    }

    if (!Array.isArray(parsed.steps)) {
      throw new Error('Script does not contain steps array');
    }

    if (parsed.steps.length === 0) {
      throw new Error('Script has empty steps array');
    }

    // Check that there's at least one assertion
    const hasAssertion = parsed.steps.some(step => step.action && step.action.startsWith('assert'));
    if (!hasAssertion) {
      log('  Warning: Generated test has no assertion steps');
    }

    log(`  Generated ${parsed.steps.length} action steps: ${data.explanation}`);
    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

/**
 * Test: Generate test with invalid URL
 */
async function testGenerateTestInvalidUrl() {
  const testName = 'Generate test - handles invalid URL gracefully';
  try {
    log('Testing with invalid URL (this may take a few seconds)...');
    
    const result = await callWorkerApi('/generate-test', {
      pageUrl: 'https://this-domain-definitely-does-not-exist-12345.com',
      prompt: 'Check if page loads',
      viewport: 'desktop'
    });

    // Should return 500 with error (navigation failure)
    if (result.status !== 500) {
      throw new Error(`Expected status 500 for invalid URL, got ${result.status}`);
    }

    if (result.data.success !== false) {
      throw new Error('Expected success: false for invalid URL');
    }

    if (!result.data.error) {
      throw new Error('Expected error message for invalid URL');
    }

    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

/**
 * Test: Generate test with different viewports
 */
async function testGenerateTestViewports() {
  const testName = 'Generate test - supports different viewports';
  try {
    log('Testing viewport parameter (this may take 10-30 seconds)...');
    
    // Test with mobile viewport
    const result = await callWorkerApi('/generate-test', {
      pageUrl: 'https://example.com',
      prompt: 'Check that the page has a heading',
      viewport: 'mobile'
    });

    if (result.status !== 200) {
      throw new Error(`Expected status 200, got ${result.status}: ${JSON.stringify(result.data)}`);
    }

    if (!result.data.success) {
      throw new Error(`Generation failed: ${result.data.error}`);
    }

    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

/**
 * Test: Test script endpoint validates scripts
 */
async function testTestScriptEndpoint() {
  const testName = 'Test script endpoint executes scripts';
  try {
    log('Testing script execution endpoint...');
    
    // Valid script that should execute successfully
    const validResult = await callWorkerApi('/test-script', {
      pageUrl: 'https://example.com',
      script: 'document.querySelector("h1")',
      viewport: 'desktop'
    });

    if (validResult.status !== 200) {
      throw new Error(`Expected status 200 for valid script, got ${validResult.status}`);
    }

    if (!validResult.data.success) {
      throw new Error(`Expected success for valid script: ${validResult.data.error}`);
    }

    // Invalid script that should fail
    const invalidResult = await callWorkerApi('/test-script', {
      pageUrl: 'https://example.com',
      script: 'this is not valid javascript {{{{',
      viewport: 'desktop'
    });

    if (invalidResult.status !== 400) {
      throw new Error(`Expected status 400 for invalid script, got ${invalidResult.status}`);
    }

    success(testName);
    return true;
  } catch (error) {
    fail(testName, error.message);
    return false;
  }
}

// ============================================
// Test Runner
// ============================================

async function runTests() {
  console.log('');
  console.log('='.repeat(60));
  console.log('Test Generation Feature - Integration Tests');
  console.log('='.repeat(60));
  console.log(`Worker API URL: ${WORKER_API_URL}`);
  console.log('');

  // Check if worker is reachable
  log('Checking worker API connectivity...');
  const healthOk = await testHealthCheck();
  
  if (!healthOk) {
    console.error('');
    console.error('Worker API is not reachable. Make sure:');
    console.error('  1. Docker services are running (./scripts/start.sh)');
    console.error('  2. Worker API is exposed on port 3001');
    console.error('');
    process.exit(1);
  }
  console.log('');

  // Run validation tests (fast)
  log('Running validation tests...');
  await testGenerateTestMissingFields();
  console.log('');

  // Run generation tests (slow - involve AI)
  log('Running test generation tests (these use AI and may take time)...');
  console.log('');

  await testGenerateEvalModeTest();
  console.log('');

  await testGenerateActionModeTest();
  console.log('');

  await testGenerateTestViewports();
  console.log('');

  // Run error handling tests
  log('Running error handling tests...');
  await testGenerateTestInvalidUrl();
  console.log('');

  // Run script execution tests
  log('Running script execution tests...');
  await testTestScriptEndpoint();
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${failedTests}`);
  console.log(`  Total:  ${passedTests + failedTests}`);
  console.log('');

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
