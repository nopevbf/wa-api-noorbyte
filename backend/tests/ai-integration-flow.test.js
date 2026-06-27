const db = require('../src/config/database');

// Mock Baileys to avoid ESM issues in Jest
jest.mock('@whiskeysockets/baileys', () => ({
  jidNormalizedUser: (jid) => jid?.split('@')[0].split(':')[0] + '@s.whatsapp.net',
}));

jest.mock('../src/services/waEngine', () => {
  const activeSessions = new Map();
  return {
    sendMessageViaWa: jest.fn().mockResolvedValue({ status: 'success' }),
    logAiActivity: jest.fn(),
    activeSessions,
  };
});

const { processAiReply } = require('../src/services/aiProcessor');
const { sendMessageViaWa, logAiActivity } = require('../src/services/waEngine');

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
      'text',
      null,
      null,
      {}
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

  it('should skip AI if Human Takeover is active (paused)', async () => {
    const { pauseAiForChat, resumeAiForChat } = require('../src/helpers/humanTakeover');
    const remoteJid = '628999999999@s.whatsapp.net';
    
    // Activate human takeover
    pauseAiForChat(remoteJid, 15);
    
    const incomingMessage = {
      from: remoteJid,
      body: 'Halo, saya mau tanya',
      pushName: 'Customer'
    };

    jest.clearAllMocks();
    await processAiReply(testApiKey, incomingMessage);

    // AI should not send any message
    expect(sendMessageViaWa).not.toHaveBeenCalled();
    
    // Cleanup for next tests
    resumeAiForChat(remoteJid);
  });

  it('should NOT trigger Human Takeover when a non-owner sends a normal message', async () => {
    const { isAiPaused, resumeAiForChat } = require('../src/helpers/humanTakeover');
    const remoteJid = '628999999999@s.whatsapp.net';
    
    // Ensure AI is resumed
    resumeAiForChat(remoteJid);
    
    const incomingMessage = {
      key: { remoteJid, fromMe: false, id: 'user_msg_id' },
      from: remoteJid,
      body: 'Halo, saya mau tanya',
      pushName: 'Customer'
    };

    // We can't directly test waEngine listener here easily without a lot of mocking,
    // but we can verify our assumption that processAiReply doesn't trigger pause.
    // The actual fix is in the waEngine listener.
    
    await processAiReply(testApiKey, incomingMessage);

    // AI should NOT be paused by a normal user message
    expect(isAiPaused(remoteJid)).toBe(false);
  });
});
