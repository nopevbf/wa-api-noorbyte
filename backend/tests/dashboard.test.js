const request = require('supertest');
const express = require('express');

// Mock external modules that might use ES syntax
jest.mock('socks-proxy-agent', () => ({
  SocksProxyAgent: jest.fn()
}));
jest.mock('../src/services/waEngine', () => ({
  sendMessageViaWa: jest.fn(),
  disconnectWa: jest.fn(),
  connectToWhatsApp: jest.fn(),
  fetchGroups: jest.fn()
}));

const apiRoutes = require('../src/routes/apiRoutes');

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

// Mock database
jest.mock('../src/config/database', () => ({
  prepare: jest.fn().mockReturnThis(),
  get: jest.fn(),
  all: jest.fn(),
  exec: jest.fn()
}));
const db = require('../src/config/database');

describe('Dashboard APIs for Admin', () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'master_key';
    jest.clearAllMocks();
  });

  it('GET /api/get-devices should fail if admin role but no api_key', async () => {
    db.get.mockReturnValueOnce({ count: 1 });
    const res = await request(app).get('/api/get-devices?role=admin');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe(false);
  });

  it('GET /api/get-devices should succeed if admin role and correct api_key', async () => {
    // Mock userCount
    db.get.mockReturnValueOnce({ count: 1 });
    // Mock users
    db.all.mockReturnValueOnce([{ username: 'Test', phone: '123' }]);

    const res = await request(app).get('/api/get-devices?role=admin&api_key=master_key');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/dashboard-stats should succeed for admin', async () => {
    // Mock for totalMsg
    db.get.mockReturnValueOnce({ count: 10 });
    // Mock for successMsg
    db.get.mockReturnValueOnce({ count: 8 });
    // Mock for recentLogs
    db.all.mockReturnValueOnce([{ target_number: '123', status: 'SUCCESS', message: 'Test' }]);

    const res = await request(app).get('/api/dashboard-stats?role=admin&api_key=master_key');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.data.totalMessages).toBe(10);
  });
});
