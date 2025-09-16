#!/usr/bin/env node

/**
 * Command-line test to verify runtime VivafolioBlock output for all supported languages
 *
 * This test runs each language's test program and validates that the expected
 * VivafolioBlock notifications are emitted to stdout.
 */

const { spawn } = require('child_process');
const path = require('path');

const testPrograms = [
  {
    name: 'Python',
    file: path.join(__dirname, 'runtime-path/python/two_blocks.py'),
    command: 'python3',
    args: [path.join(__dirname, 'runtime-path/python/two_blocks.py')]
  },
  {
    name: 'Ruby',
    file: path.join(__dirname, 'runtime-path/ruby/two_blocks.rb'),
    command: 'ruby',
    args: [path.join(__dirname, 'runtime-path/ruby/two_blocks.rb')]
  },
  {
    name: 'Julia',
    file: path.join(__dirname, 'runtime-path/julia/two_blocks.jl'),
    command: 'julia',
    args: [path.join(__dirname, 'runtime-path/julia/two_blocks.jl')]
  },
  {
    name: 'R',
    file: path.join(__dirname, 'runtime-path/r/two_blocks.R'),
    command: 'Rscript',
    args: [path.join(__dirname, 'runtime-path/r/two_blocks.R')]
  },
  {
    name: 'JavaScript',
    file: path.join(__dirname, 'runtime-path/javascript/two_blocks.js'),
    command: 'node',
    args: [path.join(__dirname, 'runtime-path/javascript/two_blocks.js')]
  }
];

/**
 * Expected VivafolioBlock notifications for two_blocks programs
 */
const expectedNotifications = [
  {
    blockId: 'picker-123',
    blockType: 'https://blockprotocol.org/@blockprotocol/types/block-type/color-picker/',
    displayMode: 'multi-line',
    entityId: 'entity-picker-123',
    supportsHotReload: false,
    initialHeight: 200,
    hasInitialGraph: true,
    hasResources: true
  },
  {
    blockId: 'square-456',
    blockType: 'https://blockprotocol.org/@blockprotocol/types/block-type/color-square/',
    displayMode: 'multi-line',
    entityId: 'entity-square-456',
    supportsHotReload: false,
    initialHeight: 200,
    hasInitialGraph: true,
    hasResources: true
  }
];

/**
 * Run a test program and validate its output
 */
function runTest(testProgram) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing ${testProgram.name}...`);

    const child = spawn(testProgram.command, testProgram.args, {
      cwd: path.dirname(testProgram.file),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${testProgram.name} execution failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse JSON lines from stdout
        const lines = stdout.split('\n').filter(line => line.trim());
        const notifications = [];

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.trim());
            if (isValidVivafolioBlockNotification(parsed)) {
              notifications.push(parsed);
            }
          } catch (e) {
            // Skip non-JSON lines (like regular output)
          }
        }

        // Validate notifications
        const validationResult = validateNotifications(notifications, testProgram.name);
        resolve(validationResult);

      } catch (error) {
        reject(new Error(`${testProgram.name} validation failed: ${error.message}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Check if a parsed object is a valid VivafolioBlock notification
 */
function isValidVivafolioBlockNotification(obj) {
  return obj &&
         typeof obj === 'object' &&
         obj.blockId &&
         obj.blockType &&
         obj.initialGraph &&
         obj.entityId &&
         obj.displayMode &&
         typeof obj.supportsHotReload === 'boolean' &&
         typeof obj.initialHeight === 'number';
}

/**
 * Validate that notifications match expected structure
 */
function validateNotifications(notifications, languageName) {
  const results = {
    language: languageName,
    totalNotifications: notifications.length,
    validNotifications: 0,
    errors: []
  };

  // Check if we have the expected number of notifications
  if (notifications.length !== expectedNotifications.length) {
    results.errors.push(`Expected ${expectedNotifications.length} notifications, got ${notifications.length}`);
    return results;
  }

  // Validate each notification
  for (let i = 0; i < notifications.length; i++) {
    const notification = notifications[i];
    const expected = expectedNotifications[i];

    let isValid = true;
    const errors = [];

    // Check required fields
    if (notification.blockId !== expected.blockId) {
      isValid = false;
      errors.push(`blockId: expected "${expected.blockId}", got "${notification.blockId}"`);
    }

    if (notification.blockType !== expected.blockType) {
      isValid = false;
      errors.push(`blockType: expected "${expected.blockType}", got "${notification.blockType}"`);
    }

    if (notification.displayMode !== expected.displayMode) {
      isValid = false;
      errors.push(`displayMode: expected "${expected.displayMode}", got "${notification.displayMode}"`);
    }

    if (notification.entityId !== expected.entityId) {
      isValid = false;
      errors.push(`entityId: expected "${expected.entityId}", got "${notification.entityId}"`);
    }

    if (notification.supportsHotReload !== expected.supportsHotReload) {
      isValid = false;
      errors.push(`supportsHotReload: expected ${expected.supportsHotReload}, got ${notification.supportsHotReload}`);
    }

    if (notification.initialHeight !== expected.initialHeight) {
      isValid = false;
      errors.push(`initialHeight: expected ${expected.initialHeight}, got ${notification.initialHeight}`);
    }

    // Check for initialGraph structure
    if (!notification.initialGraph || !Array.isArray(notification.initialGraph.entities)) {
      isValid = false;
      errors.push('initialGraph missing or invalid entities array');
    } else if (notification.initialGraph.entities.length === 0) {
      isValid = false;
      errors.push('initialGraph.entities is empty');
    }

    // Check for resources (optional but expected for these tests)
    if (expected.hasResources && (!notification.resources || !Array.isArray(notification.resources))) {
      isValid = false;
      errors.push('resources missing or not an array');
    }

    if (isValid) {
      results.validNotifications++;
    } else {
      results.errors.push(`Notification ${i}: ${errors.join(', ')}`);
    }
  }

  return results;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting Vivafolio Runtime VivafolioBlock Validation Tests\n');
  console.log('=' * 60);

  const results = [];
  let totalPassed = 0;

  for (const testProgram of testPrograms) {
    try {
      const result = await runTest(testProgram);
      results.push(result);

      if (result.errors.length === 0 && result.validNotifications === result.totalNotifications) {
        console.log(`✅ ${result.language}: PASSED (${result.validNotifications}/${result.totalNotifications} notifications)`);
        totalPassed++;
      } else {
        console.log(`❌ ${result.language}: FAILED`);
        result.errors.forEach(error => console.log(`   - ${error}`));
      }
    } catch (error) {
      console.log(`❌ ${testProgram.name}: ERROR - ${error.message}`);
      results.push({
        language: testProgram.name,
        totalNotifications: 0,
        validNotifications: 0,
        errors: [error.message]
      });
    }
  }

  console.log('\n' + '=' * 60);
  console.log(`📊 SUMMARY: ${totalPassed}/${testPrograms.length} languages passed`);

  if (totalPassed === testPrograms.length) {
    console.log('🎉 All runtime VivafolioBlock tests PASSED!');
    process.exit(0);
  } else {
    console.log('💥 Some tests FAILED. Check the output above for details.');
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runTest, validateNotifications, isValidVivafolioBlockNotification };
