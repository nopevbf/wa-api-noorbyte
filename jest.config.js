module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/backend', '<rootDir>/frontend'],
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/backend/tests/jest.setup.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  transform: {}
};
