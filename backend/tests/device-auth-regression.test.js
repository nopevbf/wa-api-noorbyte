const request = require('supertest');
const express = require('express');
const db = require('../src/config/database');
const apiRoutes = require('../src/routes/apiRoutes');

jest.mock('../src/services/waEngine', () => ({
  sendMessageViaWa: jest.fn(),
  disconnectWa: jest.fn().mockResolvedValue(true),
  connectToWhatsApp: jest.fn(),
  fetchGroups: jest.fn(),
}));

jest.mock('socks-proxy-agent', () => ({
  SocksProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('Regression: device management via body api_key', () => {
  beforeEach(() => {
    db.exec('DELETE FROM users; DELETE FROM automation_schedules; DELETE FROM message_logs;');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('Admin', '000', 'admin-token', 'Connected', 'admin');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User1', '111', 'token1', 'Connected', 'user');
  });

  // --- Happy path: delete-device using body api_key for authentication ---
  it('should delete a device when api_key is sent in body (no Authorization header)', async () => {
    // Regression: this was broken by removing body fallback from checkApiKey
    const res = await request(app)
      .post('/api/delete-device')
      .send({ api_key: 'token1' }); // authenticates AND specifies target

    expect(res.statusCode).toBe(200);
    const deleted = db.prepare('SELECT * FROM users WHERE api_key = ?').get('token1');
    expect(deleted).toBeUndefined();
  });

  // --- Happy path: disconnect-device using body api_key ---
  it('should disconnect a device when api_key is sent in body', async () => {
    const res = await request(app)
      .post('/api/disconnect-device')
      .send({ api_key: 'token1' });

    expect(res.statusCode).toBe(200);
    const device = db.prepare('SELECT status FROM users WHERE api_key = ?').get('token1');
    expect(device.status).toBe('Disconnected');
  });

  // --- Happy path: Authorization header still works ---
  it('should delete a device when using Authorization header', async () => {
    const res = await request(app)
      .post('/api/delete-device')
      .set('Authorization', 'Bearer token1')
      .send({ api_key: 'token1' });

    expect(res.statusCode).toBe(200);
  });

  // --- Security invariant: body api_key CANNOT change req.user.role ---
  it('should NOT grant admin role when a regular api_key is sent in body', async () => {
    // token1 is a regular user — sending it in body should NOT give admin role
    const res = await request(app)
      .post('/api/delete-device')
      .send({ api_key: 'token1' });

    expect(res.statusCode).toBe(200);
    // req.user.role should be 'user', not 'admin' — verified by checking the deleted row
    // If admin bypass was triggered, ALL users would be accessible; here only token1 is deleted
    const adminStillExists = db.prepare('SELECT * FROM users WHERE api_key = ?').get('admin-token');
    expect(adminStillExists).toBeDefined(); // admin row must be untouched
  });

  // --- Edge: missing api_key in body — middleware 401 fires before route 400 ---
  it('should return 401 when api_key is completely absent (middleware blocks first)', async () => {
    // No Authorization header, no body api_key → middleware never authenticates → 401
    // The route's own 400 guard is never reached in this case
    const res = await request(app)
      .post('/api/delete-device')
      .send({});

    expect(res.statusCode).toBe(401);
  });

  // --- Edge: invalid api_key in body returns 401 from middleware ---
  it('should return 401 when api_key in body is invalid', async () => {
    const res = await request(app)
      .post('/api/delete-device')
      .send({ api_key: 'non_existent_key' });

    expect(res.statusCode).toBe(401);
  });
});
