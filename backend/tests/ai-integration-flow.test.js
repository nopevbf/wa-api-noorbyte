const { sendMessageViaWa } = require('../src/services/waEngine');
const { processAiReply } = require('../src/services/aiProcessor');
const db = require('../src/config/database');

jest.mock('../src/services/waEngine', () => ({
  sendMessageViaWa: jest.fn().mockResolvedValue({ status: 'success' }),
  logAiActivity: jest.fn(),
}));

// Mock AI service to avoid real API calls
jest.mock('../src/services/aiEngine', () => {
  const actual = jest.requireActual('../src/services/aiEngine');
  return {
    ...actual,
    generateAiResponse: jest.fn().mockResolvedValue('Halo! Ada yang bisa saya bantu?'),
  };
});

describe('AI Auto-Reply Integration Flow', () => {
  const testApiKey = 'test_integration_key';

  beforeAll(() => {
    // Setup test user with AI enabled
    db.prepare("DELETE FROM users WHERE api_key = ?").run(testApiKey);
    db.prepare(`
      INSERT INTO users (username, phone, api_key, status, role, ai_enabled, ai_target) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('TestUser', '628123456789', testApiKey, 'Connected', 'user', 1, 'all');
  });

  afterAll(() => {
    db.prepare("DELETE FROM users WHERE api_key = ?").run(testApiKey);
  });

  it('should trigger AI and send reply when a message is processed', async () => {
    const incomingMessage = {
      from: '628999999999@s.whatsapp.net',
      body: 'Tanya dong',
      pushName: 'Customer'
    };

    // Simulate the event that would be triggered by waEngine when a message arrives
    await processAiReply(testApiKey, incomingMessage);

    // Verify AI was called (mocked)
    // Verify sendMessageViaWa was called with some string response from AI
    expect(sendMessageViaWa).toHaveBeenCalledWith(
      testApiKey,
      '628999999999@s.whatsapp.net',
      expect.any(String),
      'text'
    );
  });

  it('should NOT trigger AI if ai_enabled is 0', async () => {
    db.prepare("UPDATE users SET ai_enabled = 0 WHERE api_key = ?").run(testApiKey);
    
    const incomingMessage = {
      from: '628999999999@s.whatsapp.net',
      body: 'Halo',
    };

    jest.clearAllMocks();
    await processAiReply(testApiKey, incomingMessage);

    expect(sendMessageViaWa).not.toHaveBeenCalled();
  });
});
