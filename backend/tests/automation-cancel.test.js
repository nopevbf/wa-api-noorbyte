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

describe('Automation Cancel API', () => {
  const testApiKey = 'test_cancel_api_key';

  beforeAll(() => {
    db.prepare("INSERT OR IGNORE INTO automation_schedules (api_key, manual_run_time, manual_run_status) VALUES (?, '10:00', 'waiting')").run(testApiKey);
  });

  afterAll(() => {
    db.prepare("DELETE FROM automation_schedules WHERE api_key = ?").run(testApiKey);
  });

  test('should cancel manual automation schedule', async () => {
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
    expect(handler).toBeDefined();

    const req = { user: {}, body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
