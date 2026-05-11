const request = require('supertest');
const express = require('express');
const db = require('../src/config/database');
const apiRoutes = require('../src/routes/apiRoutes');

jest.mock('../src/services/waEngine', () => ({
  sendMessageViaWa: jest.fn(),
  disconnectWa: jest.fn(),
  connectToWhatsApp: jest.fn(),
  fetchGroups: jest.fn(),
}));

jest.mock('socks-proxy-agent', () => {
  return {
    SocksProxyAgent: jest.fn().mockImplementation(() => ({}))
  };
});

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('Security Fixes Integration', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM users;
      DELETE FROM automation_schedules;
    `);

    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User1', '111', 'token1', 'Connected', 'user');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User2', '222', 'token2', 'Connected', 'user');
  });

  // ===========================================================
  // AuthZ: Non-admin cannot override api_key
  // ===========================================================
  describe('AuthZ: Non-admin api_key override prevention', () => {
    it('should ignore body api_key for non-admin on /automation/save-settings', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          api_key: 'token2', // malicious override
          fetch_time: '10:00',
          send_wa_time: '11:00',
          is_active: true,
          manual_tasks: []
        });

      expect(res.statusCode).toBe(200);

      // Should save for token1 (the authenticated user), NOT token2
      const schedule1 = db.prepare('SELECT * FROM automation_schedules WHERE api_key = ?').get('token1');
      const schedule2 = db.prepare('SELECT * FROM automation_schedules WHERE api_key = ?').get('token2');
      expect(schedule1).toBeDefined();
      expect(schedule2).toBeUndefined();
    });

    it('should ignore body api_key for non-admin on /automation/cancel-manual', async () => {
      // Setup: User1 has a schedule with manual_run_time
      db.prepare("INSERT INTO automation_schedules (api_key, target_number, manual_run_time, manual_run_status) VALUES (?, ?, ?, ?)").run('token1', '111', '12:00', 'waiting');
      db.prepare("INSERT INTO automation_schedules (api_key, target_number, manual_run_time, manual_run_status) VALUES (?, ?, ?, ?)").run('token2', '222', '13:00', 'waiting');

      const res = await request(app)
        .post('/api/automation/cancel-manual')
        .set('Authorization', 'Bearer token1')
        .send({ api_key: 'token2' }); // trying to cancel User2's

      expect(res.statusCode).toBe(200);

      // User1's schedule should be cancelled, User2's should remain
      const s1 = db.prepare('SELECT manual_run_time FROM automation_schedules WHERE api_key = ?').get('token1');
      const s2 = db.prepare('SELECT manual_run_time FROM automation_schedules WHERE api_key = ?').get('token2');
      expect(s1.manual_run_time).toBeNull();
      expect(s2.manual_run_time).toBe('13:00');
    });

    it('should ignore query api_key for non-admin on /automation/kpi', async () => {
      // Insert logs for token2
      db.prepare("INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)").run('token2', '222', 'msg', 'SUCCESS');

      const res = await request(app)
        .get('/api/automation/kpi?api_key=token2')
        .set('Authorization', 'Bearer token1');

      expect(res.statusCode).toBe(200);
      // User1 has no logs, so total_sent should be 0
      expect(res.body.data.total_sent).toBe(0);
    });
  });

  // ===========================================================
  // Zod: manual_tasks schema validation
  // ===========================================================
  describe('Zod: manual_tasks schema validation', () => {
    it('should reject manual_tasks with invalid task structure in /automation/save-settings', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          is_active: true,
          manual_tasks: [{ invalid_field: true }] // missing required fields
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/manual_tasks/i);
    });

    it('should reject manual_tasks with invalid task structure in /automation/run-manual', async () => {
      const res = await request(app)
        .post('/api/automation/run-manual')
        .set('Authorization', 'Bearer token1')
        .send({
          run_time: '12:00',
          manual_tasks: [{ invalid_field: true }] // missing required fields
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/manual_tasks/i);
    });

    it('should accept valid manual_tasks structure', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          is_active: true,
          manual_tasks: [
            { date: '2026-05-11', description: 'Check In' }
          ]
        });

      expect(res.statusCode).toBe(200);
    });

    it('should accept empty manual_tasks array', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          is_active: true,
          manual_tasks: []
        });

      expect(res.statusCode).toBe(200);
    });

    it('should accept undefined manual_tasks (optional)', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          is_active: true
          // no manual_tasks
        });

      expect(res.statusCode).toBe(200);
    });
  });
});
