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
const mockGet = jest.fn();
const mockAll = jest.fn();
const mockRun = jest.fn();

jest.mock('../src/config/database', () => ({
  prepare: jest.fn().mockImplementation((query) => ({
    get: (...args) => mockGet(query, ...args),
    all: (...args) => mockAll(query, ...args),
    run: (...args) => mockRun(query, ...args),
  })),
  exec: jest.fn()
}));
const db = require('../src/config/database');

describe('Dashboard APIs for Admin', () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'master_key';
    jest.clearAllMocks();
    mockGet.mockReset();
    mockAll.mockReset();
    mockRun.mockReset();
  });

  it('GET /api/get-devices should fail if admin role but no api_key', async () => {
    mockGet.mockReturnValue({ count: 1 });
    const res = await request(app).get('/api/get-devices?role=admin');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe(false);
  });

  it('GET /api/get-devices should succeed if admin role and correct api_key', async () => {
    // Mock userCount and other gets
    mockGet.mockReturnValue({ count: 1 });
    // Mock users
    mockAll.mockReturnValue([{ username: 'Test', phone: '123' }]);

    const res = await request(app).get('/api/get-devices?role=admin&api_key=master_key');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/dashboard-stats should succeed for admin', async () => {
    // Mock for totalMsg, successMsg
    mockGet.mockImplementation((query) => {
        if (query.includes('WHERE status')) return { count: 8 };
        if (query.includes('message_logs')) return { count: 10 };
        return { count: 0 };
    });
    // Mock for recentLogs
    mockAll.mockReturnValue([{ target_number: '123', status: 'SUCCESS', message: 'Test' }]);

    const res = await request(app).get('/api/dashboard-stats?role=admin&api_key=master_key');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.data.totalMessages).toBe(10);
  });
});
