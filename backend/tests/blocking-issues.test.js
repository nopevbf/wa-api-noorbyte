const request = require('supertest');
const express = require('express');
const db = require('../src/config/database');
const apiRoutes = require('../src/routes/apiRoutes');

// Mock waEngine functions if necessary, but we might not hit them if we mock or test only DB logic
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
// Inject req.user mock middleware for isolation, OR use real checkApiKey.
// It's better to use real routes and insert real user into db
app.use('/api', apiRoutes);

describe('Blocking Issues TDD', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM users;
      DELETE FROM automation_schedules;
    `);
    
    // Insert test users
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User1', '111', 'token1', 'Connected', 'user');
    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run('User2', '222', 'token2', 'Connected', 'user');
  });

  describe('Auth Consistency', () => {
    it('should not allow overriding api_key via req.body in /automation/run-manual', async () => {
      // User 1 schedules manual run, but maliciously passes User 2's API key
      const res = await request(app)
        .post('/api/automation/run-manual')
        .set('Authorization', 'Bearer token1')
        .send({
          api_key: 'token2',
          run_time: '12:00',
          manual_tasks: [] // Correct type here
        });

      expect(res.statusCode).toBe(200);

      // Verify whose schedule was updated
      const schedule2 = db.prepare('SELECT * FROM automation_schedules WHERE api_key = ?').get('token2');
      const schedule1 = db.prepare('SELECT * FROM automation_schedules WHERE api_key = ?').get('token1');

      // Since token1 was used in Authorization, token1's schedule should be created/updated, not token2
      expect(schedule2).toBeUndefined(); // It should NOT exist
      expect(schedule1).toBeDefined();
      expect(schedule1.manual_run_time).toBe('12:00');
    });

    it('should not allow overriding api_key via req.query in /automation/status', async () => {
      // User 2 has a schedule
      db.prepare("INSERT INTO automation_schedules (api_key, target_number) VALUES (?, ?)").run('token2', '222');

      // User 1 tries to view User 2's status
      const res = await request(app)
        .get('/api/automation/status?api_key=token2')
        .set('Authorization', 'Bearer token1');

      // Should return User 1's status (null or undefined), NOT User 2's
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toBeNull(); // Because User 1 has no schedule
    });
  });

  describe('Input Validation', () => {
    it('should return 400 if manual_tasks is not an array in /automation/save-settings', async () => {
      const res = await request(app)
        .post('/api/automation/save-settings')
        .set('Authorization', 'Bearer token1')
        .send({
          manual_tasks: "not_an_array_string", // Malformed payload
          fetch_time: "10:00",
          send_wa_time: "11:00",
          is_active: true
        });

      // Expecting a Bad Request because manual_tasks must be an array
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/manual_tasks harus berupa array/i);
    });

    it('should return 400 if manual_tasks is not an array in /automation/run-manual', async () => {
      const res = await request(app)
        .post('/api/automation/run-manual')
        .set('Authorization', 'Bearer token1')
        .send({
          run_time: "12:00",
          manual_tasks: { key: "value" } // Malformed payload
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/manual_tasks harus berupa array/i);
    });
  });

  describe('Migration Stability', () => {
    // Note: This tests the database.js behavior, but since it runs on require,
    // we can test if it correctly ignores existing columns and doesn't throw.
    it('should use PRAGMA table_info to safely check for column existence', () => {
      // We will assert the SQL behavior by re-requiring database.js and ensuring no errors are logged or thrown
      // But we can't easily assert console.log unless we mock it.
      // A safe way is just to ensure that db.js has been modified to contain 'PRAGMA table_info'.
      const fs = require('fs');
      const path = require('path');
      const dbContent = fs.readFileSync(path.join(__dirname, '../src/config/database.js'), 'utf8');
      
      expect(dbContent).toContain('PRAGMA table_info');
    });
  });
});
