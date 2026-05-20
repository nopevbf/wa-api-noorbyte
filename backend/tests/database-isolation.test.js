const path = require('path');

describe('Database Isolation', () => {
  let originalNodeEnv;
  let originalDbPath;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalDbPath = process.env.DB_PATH;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalDbPath;
    }
  });

  beforeEach(() => {
    // Reset Jest's module cache so require() re-evaluates the files
    jest.resetModules();
  });

  // 1. Happy Path: NODE_ENV = 'test' uses database_test.db
  it('should use database_test.db when NODE_ENV is test and DB_PATH is not set', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.DB_PATH;

    const db = require('../src/config/database');
    expect(db.name).toContain('database_test.db');
  });

  // 2. Edge Case 1: NODE_ENV = 'production' or 'development' uses database.db
  it('should use database.db when NODE_ENV is production and DB_PATH is not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_PATH;

    const db = require('../src/config/database');
    expect(db.name).toContain('database.db');
    db.close();
  });

  // 3. Edge Case 2: DB_PATH overrides everything
  it('should use the custom DB_PATH when explicitly set', () => {
    process.env.NODE_ENV = 'test';
    const customPath = path.join(__dirname, 'custom_fixture.db');
    process.env.DB_PATH = customPath;

    const db = require('../src/config/database');
    expect(db.name).toBe(customPath);
    
    // Clean up created file
    try {
      db.close();
      const fs = require('fs');
      if (fs.existsSync(customPath)) {
        fs.unlinkSync(customPath);
      }
    } catch (e) {
      // ignore
    }
  });
});
