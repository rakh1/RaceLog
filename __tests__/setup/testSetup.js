const fs = require('fs');
const path = require('path');

// Set up test data directory before any tests run
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'test-data');
process.env.RACELOG_DATA_DIR = TEST_DATA_DIR;

// Create clean test data directory before all tests
beforeAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DATA_DIR, 'sessions'), { recursive: true });
});

// Clean up test data directory after all tests
afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
});

// Reset test data between test files
beforeEach(() => {
  const files = ['users.json', 'cars.json', 'setups.json', 'tracks.json',
                 'sessions.json', 'corner-notes.json', 'track-notes.json', 'maintenance.json'];
  files.forEach(file => {
    const filepath = path.join(TEST_DATA_DIR, file);
    if (fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, '[]');
    }
  });
});
