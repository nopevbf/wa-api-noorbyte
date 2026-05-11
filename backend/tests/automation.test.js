jest.mock("socks-proxy-agent", () => ({
  SocksProxyAgent: jest.fn()
}));
jest.mock("@whiskeysockets/baileys", () => ({
  makeWASocket: jest.fn(),
  useMultiFileAuthState: jest.fn(() => ({ state: {}, saveCreds: jest.fn() })),
  DisconnectReason: {},
  fetchLatestBaileysVersion: jest.fn(() => ({ version: [2, 0, 0], isLatest: true }))
}));

const router = require('../src/routes/apiRoutes');
const db = require('../src/config/database');

// Helper to find the route handler
function getHandler(method, path) {
  const route = router.stack.find(s => s.route && s.route.path === path && s.route.methods[method.toLowerCase()]);
  return route ? route.route.stack[route.route.stack.length - 1].handle : null;
}

describe('Automation API Persistence Logic', () => {
  const testApiKey = 'test_api_key_123';

  beforeAll(() => {
    db.prepare("DELETE FROM automation_schedules WHERE api_key = ?").run(testApiKey);
  });

  afterAll(() => {
    db.prepare("DELETE FROM automation_schedules WHERE api_key = ?").run(testApiKey);
  });

  test('should save automation settings correctly', async () => {
    const handler = getHandler('POST', '/automation/save-settings');
    expect(handler).toBeDefined();

    const req = {
      user: { api_key: testApiKey },
      body: {
        api_key: testApiKey,
        dp_api_url: 'https://api.test.com',
        dp_email: 'test@test.com',
        dp_password: 'password123',
        target_number: '628123456789',
        fetch_time: '10:00',
        frequency: 'daily',
        is_active: true,
        start_date: '2026-04-29',
        custom_days: [1, 2, 3],
        excluded_dates: ['2026-12-25']
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: true }));

    // Verify in DB
    const row = db.prepare("SELECT * FROM automation_schedules WHERE api_key = ?").get(testApiKey);
    expect(row).toBeDefined();
    expect(row.dp_api_url).toBe(req.body.dp_api_url);
    expect(row.is_active).toBe(1);
    expect(JSON.parse(row.custom_days)).toEqual(req.body.custom_days);
  });

  test('should retrieve automation status correctly', async () => {
    const handler = getHandler('GET', '/automation/status');
    expect(handler).toBeDefined();

    const req = {
      user: { api_key: testApiKey },
      query: { api_key: testApiKey }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: true,
      data: expect.objectContaining({
        api_key: testApiKey,
        is_active: 1,
        custom_days: [1, 2, 3]
      })
    }));
  });

  test('should return 400 if api_key is missing', async () => {
    const handler = getHandler('POST', '/automation/save-settings');
    const req = { user: {}, body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('should cancel manual automation schedule', async () => {
    // Setup a manual run
    db.prepare("UPDATE automation_schedules SET manual_run_time = '10:00', manual_run_status = 'waiting' WHERE api_key = ?").run(testApiKey);

    const handler = getHandler('POST', '/automation/cancel-manual');
    expect(handler).toBeDefined();

    const req = {
      user: { api_key: testApiKey },
      body: { api_key: testApiKey }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: true }));

    // Verify in DB
    const row = db.prepare("SELECT manual_run_time, manual_run_status FROM automation_schedules WHERE api_key = ?").get(testApiKey);
    expect(row.manual_run_time).toBeNull();
    expect(row.manual_run_status).toBeNull();
  });

  test('should return 400 if api_key is missing in cancel', async () => {
    const handler = getHandler('POST', '/automation/cancel-manual');
    const req = { user: {}, body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
