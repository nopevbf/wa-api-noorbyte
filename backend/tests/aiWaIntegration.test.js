const { connectToWhatsApp } = require('../src/services/waEngine');
const { generateAiResponse } = require('../src/services/aiEngine');
const db = require('../src/config/database');
const { handleIncomingPulseMessage } = require('../src/services/pulseWatcher');

jest.mock('../src/services/aiEngine');
jest.mock('../src/config/database');
jest.mock('../src/services/pulseWatcher', () => ({
    handleIncomingPulseMessage: jest.fn().mockResolvedValue({})
}));
jest.mock('@whiskeysockets/baileys', () => ({
    default: jest.fn().mockReturnValue({
        ev: {
            on: jest.fn(),
            removeAllListeners: jest.fn(),
        },
        ws: { close: jest.fn() },
    }),
    useMultiFileAuthState: jest.fn().mockResolvedValue({ state: {}, saveCreds: jest.fn() }),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: '1.0.0' }),
    DisconnectReason: { loggedOut: 401 }
}));

describe('waEngine AI Integration', () => {
    let mockSock;

    beforeEach(() => {
        jest.clearAllMocks();
        const makeWASocket = require('@whiskeysockets/baileys').default;
        mockSock = makeWASocket();
        mockSock.user = { id: 'test_user' };
    });

    test('should call generateAiResponse and sendMessage when AI is enabled', async () => {
        // This is tricky because connectToWhatsApp sets up listeners
        // We need to capture the 'messages.upsert' listener and trigger it manually
        
        let messageListener;
        mockSock.ev.on.mockImplementation((event, listener) => {
            if (event === 'messages.upsert') {
                messageListener = listener;
            }
        });

        await connectToWhatsApp('test_api_key', null);

        expect(messageListener).toBeDefined();

        // Mock DB
        db.prepare.mockImplementation((query) => {
            if (query.includes('FROM users')) {
                return {
                    get: jest.fn().mockReturnValue({
                        ai_enabled: 1,
                        ai_source: 'custom',
                        ai_provider: 'openai',
                        ai_api_key: 'encrypted_key',
                        ai_system_prompt: 'prompt',
                        ai_context_data: 'context'
                    })
                };
            }
            return { run: jest.fn(), get: jest.fn(), all: jest.fn() };
        });

        generateAiResponse.mockResolvedValue('AI Response');
        
        // Mock sendMessage on mockSock
        mockSock.sendMessage = jest.fn().mockResolvedValue({});

        // Simulate incoming message
        const m = {
            messages: [{
                key: { remoteJid: '62812345678@s.whatsapp.net', fromMe: false },
                message: { conversation: 'Hello AI' }
            }]
        };

        await messageListener(m);

        expect(generateAiResponse).toHaveBeenCalledWith(expect.objectContaining({
            source: 'custom',
            provider: 'openai'
        }), 'Hello AI');
        expect(mockSock.sendMessage).toHaveBeenCalledWith('62812345678@s.whatsapp.net', { text: 'AI Response' });
    });

    test('should NOT call generateAiResponse if sender does not match ai_target', async () => {
        let messageListener;
        mockSock.ev.on.mockImplementation((event, listener) => {
            if (event === 'messages.upsert') messageListener = listener;
        });

        await connectToWhatsApp('test_api_key', null);

        db.prepare.mockImplementation((query) => {
            if (query.includes('FROM users')) {
                return {
                    get: jest.fn().mockReturnValue({
                        ai_enabled: 1,
                        ai_target: '62811111111' // Different target
                    })
                };
            }
            return { run: jest.fn(), get: jest.fn(), all: jest.fn() };
        });

        const m = {
            messages: [{
                key: { remoteJid: '62899999999@s.whatsapp.net', fromMe: false },
                message: { conversation: 'Hello' }
            }]
        };

        await messageListener(m);
        expect(generateAiResponse).not.toHaveBeenCalled();
    });

    test('should process multiple messages in batch', async () => {
        let messageListener;
        mockSock.ev.on.mockImplementation((event, listener) => {
            if (event === 'messages.upsert') messageListener = listener;
        });

        await connectToWhatsApp('test_api_key', null);

        db.prepare.mockImplementation((query) => {
            if (query.includes('FROM users')) {
                return {
                    get: jest.fn().mockReturnValue({
                        ai_enabled: 1,
                        ai_target: '' // Match all
                    })
                };
            }
            return { run: jest.fn(), get: jest.fn(), all: jest.fn() };
        });

        generateAiResponse.mockResolvedValue('AI Response');
        mockSock.sendMessage = jest.fn().mockResolvedValue({});

        const m = {
            messages: [
                {
                    key: { remoteJid: 'user1@s.whatsapp.net', fromMe: false },
                    message: { conversation: 'Msg 1' }
                },
                {
                    key: { remoteJid: 'user2@s.whatsapp.net', fromMe: false },
                    message: { conversation: 'Msg 2' }
                }
            ]
        };

        await messageListener(m);

        expect(generateAiResponse).toHaveBeenCalledTimes(2);
        expect(mockSock.sendMessage).toHaveBeenCalledTimes(2);
    });
});
