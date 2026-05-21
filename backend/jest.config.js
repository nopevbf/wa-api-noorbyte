module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^cheerio$': '<rootDir>/node_modules/cheerio/dist/commonjs/index.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(cheerio|socks-proxy-agent|@whiskeysockets/baileys)/)'
  ]
};
