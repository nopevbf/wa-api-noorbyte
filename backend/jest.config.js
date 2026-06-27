module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {},
  transformIgnorePatterns: [
    '/node_modules/(?!(socks-proxy-agent|@whiskeysockets/baileys)/)'
  ]
};
