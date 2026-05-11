const request = require('supertest');
const express = require('express');
const db = require('../src/config/database');
const apiRoutes = require('../src/routes/apiRoutes');
const { validateSaveSettings } = require('../src/helpers/validators');

jest.mock('../src/services/waEngine', () => ({
  sendMessageViaWa: jest.fn(),
  disconnectWa: jest.fn(),
  connectToWhatsApp: jest.fn(),
  fetchGroups: jest.fn(),
}));

jest.mock('socks-proxy-agent', () => ({
  SocksProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('OWASP Round 2 Fixes', () => {
  beforeEach(() => {
    db.exec('DELETE FROM users; DELETE FROM automation_schedules; DELETE FROM message_logs;');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User1', '111', 'token1', 'Connected', 'user');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User2', '222', 'token2', 'Connected', 'user');
  });

  // ============================================================
  // 1. Auth: req.user.role cannot be spoofed — body api_key is safe (DB-validated)
  // ============================================================
  describe('Auth: req.user.role comes from DB only', () => {
    it('should authenticate via body api_key (legacy channel, DB-validated — safe)', async () => {
      // body api_key is a legitimate fallback — it goes through DB validation
      // so req.user is always set from DB data, never from raw body values
      const res = await request(app)
        .post('/api/automation/cancel-manual')
        .send({ api_key: 'token1' }); // no Authorization header

      // token1 is a valid DB user — should authenticate (not 401)
      expect(res.statusCode).not.toBe(401);
    });

    it('should still reject query api_key (CSRF risk — URLs are logged in proxies)', async () => {
      const res = await request(app)
        .get('/api/automation/status')
        .query({ api_key: 'token1' }); // no Authorization header, no body, no x-api-key

      // query fallback is intentionally removed
      expect(res.statusCode).toBe(401);
    });

    it('should authenticate correctly via Authorization header', async () => {
      const res = await request(app)
        .post('/api/automation/cancel-manual')
        .set('Authorization', 'Bearer token1')
        .send({});

      expect(res.statusCode).not.toBe(401);
    });

    it('should reject an unknown api_key even in body (DB validation enforced)', async () => {
      const res = await request(app)
        .post('/api/automation/cancel-manual')
        .send({ api_key: 'made_up_key' });

      expect(res.statusCode).toBe(401);
    });
  });


  // ============================================================
  // 2. Mass Assignment: is_active and frequency validation
  // ============================================================
  describe('Mass Assignment: save-settings field validation', () => {
    it('should reject invalid frequency value (not in allowed list)', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          frequency: 'every_minute', // not allowed
          is_active: true,
          manual_tasks: []
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/frequency/i);
    });

    it('should reject non-boolean is_active', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          frequency: 'daily',
          is_active: 'yes_please', // not boolean
          manual_tasks: []
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/is_active/i);
    });

    it('should accept valid frequency values', async () => {
      for (const freq of ['daily', 'weekly', 'custom']) {
        const res = await request(app)
          .post('/api/automation/save-settings')
          .set('Authorization', 'Bearer token1')
          .send({
            fetch_time: '10:00',
            send_wa_time: '11:00',
            frequency: freq,
            is_active: false,
            manual_tasks: []
          });
        expect(res.statusCode).toBe(200);
      }
    });

    it('should accept boolean true/false for is_active', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          fetch_time: '10:00',
          send_wa_time: '11:00',
          is_active: false,
          manual_tasks: []
        });

      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // 3. JSON.parse safety: corrupt manual_tasks in DB
  // ============================================================
  describe('JSON.parse safety: corrupt manual_tasks from DB', () => {
    it('should not crash when manual_tasks in DB is corrupt JSON', async () => {
      // Insert a schedule with corrupt manual_tasks directly in DB
      db.prepare(`
        INSERT INTO automation_schedules (api_key, target_number, manual_tasks, manual_run_status)
        VALUES (?, ?, ?, ?)
      `).run('token1', '111', 'CORRUPT_NOT_JSON{{{{', 'idle');

      const res = await request(app)
        .get('/api/automation/status')
        .set('Authorization', 'Bearer token1');

      // Must NOT be 500. Should return 200 with empty or null manual_tasks
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe(true);
    });

    it('should not crash when custom_days in DB is corrupt JSON', async () => {
      db.prepare(`
        INSERT INTO automation_schedules (api_key, target_number, custom_days, manual_run_status)
        VALUES (?, ?, ?, ?)
      `).run('token1', '111', 'CORRUPT{{', 'idle');

      const res = await request(app)
        .get('/api/automation/status')
        .set('Authorization', 'Bearer token1');

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe(true);
    });
  });

  // ============================================================
  // 4. validators.js: strict schema — no extra fields allowed
  // ============================================================
  describe('validators: strict manual_tasks schema (no passthrough)', () => {
    it('should strip unknown fields from manual_tasks items', () => {
      const { validateManualTasks } = require('../src/helpers/validators');

      const result = validateManualTasks([
        { date: '2026-05-11', description: 'Check In', injected_field: 'evil_payload' }
      ]);

      expect(result.valid).toBe(true);
      // The injected_field must NOT appear in the output
      expect(result.data[0]).not.toHaveProperty('injected_field');
    });
  });
});
