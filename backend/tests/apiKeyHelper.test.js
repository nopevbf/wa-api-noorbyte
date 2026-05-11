const db = require('../src/config/database');

// The helper we will build
const { getTargetApiKey } = require('../src/helpers/apiKeyHelper');

describe('getTargetApiKey', () => {
  beforeEach(() => {
    db.exec('DELETE FROM users;');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User1', '111', 'token1', 'Connected', 'user');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User2', '222', 'token2', 'Connected', 'user');
  });

  // --- Happy Path ---
  it('should return req.user.api_key for a non-admin user', () => {
    const req = {
      user: { username: 'User1', role: 'user', api_key: 'token1' },
      body: { api_key: 'token2' }, // malicious override attempt
      query: {}
    };

    const result = getTargetApiKey(req, 'body');
    expect(result.apiKey).toBe('token1'); // must use own key, ignore body
    expect(result.error).toBeNull();
  });

  it('should return req.body.api_key for admin when targeting a valid user', () => {
    const req = {
      user: { username: 'Admin', role: 'admin' },
      body: { api_key: 'token2' },
      query: {}
    };

    const result = getTargetApiKey(req, 'body');
    expect(result.apiKey).toBe('token2');
    expect(result.error).toBeNull();
  });

  it('should return req.query.api_key for admin when source is query', () => {
    const req = {
      user: { username: 'Admin', role: 'admin' },
      body: {},
      query: { api_key: 'token1' }
    };

    const result = getTargetApiKey(req, 'query');
    expect(result.apiKey).toBe('token1');
    expect(result.error).toBeNull();
  });

  // --- Edge Case: Admin targets non-existent api_key ---
  it('should return error when admin targets a non-existent api_key', () => {
    const req = {
      user: { username: 'Admin', role: 'admin' },
      body: { api_key: 'non_existent_key' },
      query: {}
    };

    const result = getTargetApiKey(req, 'body');
    expect(result.apiKey).toBeNull();
    expect(result.error).toMatch(/tidak ditemukan/i);
  });

  // --- Edge Case: Admin without providing target api_key ---
  it('should return error when admin does not provide a target api_key', () => {
    const req = {
      user: { username: 'Admin', role: 'admin' },
      body: {},
      query: {}
    };

    const result = getTargetApiKey(req, 'body');
    expect(result.apiKey).toBeNull();
    expect(result.error).toMatch(/wajib/i);
  });

  // --- Edge Case: Non-admin with no api_key on req.user ---
  it('should return error when non-admin user has no api_key', () => {
    const req = {
      user: { username: 'Guest', role: 'guest' },
      body: { api_key: 'token2' },
      query: {}
    };

    const result = getTargetApiKey(req, 'body');
    expect(result.apiKey).toBeNull();
    expect(result.error).toMatch(/API Key/i);
  });
});
