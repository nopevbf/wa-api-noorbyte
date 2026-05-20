const request = require('supertest');
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// Mock dependencies to avoid importing/parsing ES modules or hitting live services
jest.mock('../src/services/waEngine', () => ({
  sendMessageViaWa: jest.fn(),
  disconnectWa: jest.fn().mockResolvedValue(true),
  connectToWhatsApp: jest.fn(),
  fetchGroups: jest.fn(),
}));

jest.mock('socks-proxy-agent', () => ({
  SocksProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

const db = require('../src/config/database');
const apiRoutes = require('../src/routes/apiRoutes');

// Load environment variables exactly as the server does (two directories up from tests)
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Ensure ADMIN_API_KEY is defined for tests
if (!process.env.ADMIN_API_KEY) {
  process.env.ADMIN_API_KEY = 'admin_master_key_123';
}

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('Admin API Key Bypass and Environment Verification', () => {
  beforeEach(() => {
    db.exec('DELETE FROM users;');
    // Add a default user to ensure userCount > 0
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('AdminUser', '000', 'admin-token', 'Connected', 'admin');
  });

  // 1. Regression/Happy Path: check that ADMIN_API_KEY env value is clean (no quotes, no backticks)
  it('should load ADMIN_API_KEY cleanly from .env without quotes or backticks', () => {
    const key = process.env.ADMIN_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toContain('`');
    expect(key).not.toContain('"');
    expect(key).toBe('admin_master_key_123');
  });

  // 2. Edge Case 1: Bypass works with a clean header
  it('should authenticate and allow adding a device when Authorization header has the clean admin API key', async () => {
    const res = await request(app)
      .post('/api/add-device')
      .set('Authorization', 'Bearer admin_master_key_123')
      .send({ name: 'Valid Device', phone: '08123456789' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe(true);
  });

  // 3. Edge Case 2: Unauthorized if authorization header is missing or malformed
  it('should deny access if Authorization header is missing', async () => {
    const res = await request(app)
      .post('/api/add-device')
      .send({ name: 'Valid Device', phone: '08123456789' });

    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe(false);
  });

  // 4. Edge Case 3: Unauthorized if Authorization header has a different key
  it('should deny access if Authorization header has an invalid key', async () => {
    const res = await request(app)
      .post('/api/add-device')
      .set('Authorization', 'Bearer wrong_key')
      .send({ name: 'Valid Device', phone: '08123456789' });

    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe(false);
  });
});
