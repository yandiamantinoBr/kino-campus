module.exports = {
  testEnvironment: 'jsdom',
  verbose: true,
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: [
    '<rootDir>/\\.claude/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/\\.claude/',
    '<rootDir>/docs/legacy/backend-placeholder/',
  ],
  collectCoverage: true,
  coverageDirectory: 'output/coverage',
  coverageReporters: ['text', 'text-summary'],
  collectCoverageFrom: [
    'assets/js/kc-constants.js',
    'assets/js/kc-utils.js',
    'assets/js/kc-api.client.js',
    'assets/js/kc-filters.js',
    'assets/js/kc-ranking.js',
    'assets/js/kc-comments.shared.js',
    'assets/js/kc-search.shared.js',
    'assets/js/*.shared.js',
    'assets/js/adapters/local.notifications.adapter.js',
    'assets/js/adapters/local.adapter.js',
  ],
};
