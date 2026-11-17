// jest.config.js
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/src/tests/**/*.test.js'],
  globalSetup: './src/tests/jest.globalSetup.js',
  globalTeardown: './src/tests/jest.globalTeardown.js',
};
