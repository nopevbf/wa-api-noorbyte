jest.mock('../src/config/database');
jest.mock('../src/services/pulseWatcher', () => ({
    handleIncomingPulseMessage: jest.fn().mockResolvedValue({})
}));

// Unmock waEngine because we want to test its real logic
jest.unmock('../src/services/waEngine');

const mockSock = {
    ev: {
        on: jest.fn(),
        removeAllListeners: jest.fn(),
    },
    ws: { close: jest.fn() },
    user: { id: 'test_user' }
};

jest.mock('@whiskeysockets/baileys', () => ({
    default: jest.fn().mockReturnValue(mockSock),
    useMultiFileAuthState: jest.fn().mockResolvedValue({ state: {}, saveCreds: jest.fn() }),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: '1.0.0' }),
    DisconnectReason: { loggedOut: 401 },
    jidNormalizedUser: (jid) => jid?.split('@')[0].split(':')[0] + '@s.whatsapp.net',
}));

const { connectToWhatsApp } = jest.requireActual('../src/services/waEngine');
const { generateAiResponse } = require('../src/services/aiEngine');
const { processAiReply } = require('../src/services/aiProcessor');
const db = require('../src/config/database');

jest.mock('../src/services/aiEngine', () => {
    const actual = jest.requireActual('../src/services/aiEngine');
    return {
        ...actual,
        generateAiResponse: jest.fn(),
    };
});

describe('waEngine AI Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset shared mock methods
        mockSock.ev.on.mockReset();
        mockSock.ev.removeAllListeners.mockReset();
        mockSock.ws.close.mockReset();
    });

    test('should call generateAiResponse and sendMessage when AI is enabled', async () => {
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
        
        // Mock sendMessage
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
        expect(mockSock.sendMessage).toHaveBeenCalledWith('62812345678@s.whatsapp.net', { text: 'AI Response' }, {});
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
        expect(mockSock.sendMessage).toHaveBeenCalledWith('user1@s.whatsapp.net', { text: 'AI Response' }, {});
        expect(mockSock.sendMessage).toHaveBeenCalledWith('user2@s.whatsapp.net', { text: 'AI Response' }, {});
    });
});
