const fs = require('fs');
const path = require('path');

// Set up test data directory before any tests run
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'test-data');
process.env.RACELOG_DATA_DIR = TEST_DATA_DIR;

function ensureTestDirs() {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  const sessionsDir = path.join(TEST_DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
}

// Create clean test data directory before all tests
beforeAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
  ensureTestDirs();
});

// Clean up test data directory after all tests
afterAll(() => {
  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
  } catch (e) {
    // Ignore cleanup errors (another test suite may have already removed it)
  }
});

// Reset test data between tests
beforeEach(() => {
  // Ensure directories exist (may have been removed by another suite's afterAll)
  ensureTestDirs();

  const files = ['users.json', 'cars.json', 'setups.json', 'tracks.json',
                 'sessions.json', 'corner-notes.json', 'track-notes.json', 'maintenance.json'];
  files.forEach(file => {
    const filepath = path.join(TEST_DATA_DIR, file);
    fs.writeFileSync(filepath, '[]');
  });
});
