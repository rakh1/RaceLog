module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/testSetup.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['server.js'],
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 10000,
  // Run test suites sequentially — they share a filesystem-based data directory
  maxWorkers: 1
};
