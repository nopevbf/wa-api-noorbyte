const { connectToWhatsApp, logAiActivity } = require('../src/services/waEngine');
const db = require('../src/config/database');
const { generateAiResponse } = require('../src/services/aiEngine');

jest.mock('../src/config/database');
jest.mock('../src/services/aiEngine');
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

describe('Diagnostic: AI Target Matching', () => {
    let messageListener;

    beforeEach(async () => {
        jest.clearAllMocks();
        global.io = { emit: jest.fn() };
        
        const makeWASocket = require('@whiskeysockets/baileys').default;
        const mockSock = makeWASocket();
        mockSock.ev.on.mockImplementation((event, listener) => {
            if (event === 'messages.upsert') messageListener = listener;
        });

        await connectToWhatsApp('test_api_key', global.io);
    });

    test('should match target number 0851... with incoming 62851...', async () => {
        const targetNum = '085173370796';
        const incomingJid = '6285173370796@s.whatsapp.net';

        db.prepare.mockImplementation((query) => {
            if (query.includes('FROM users')) {
                return {
                    get: jest.fn().mockReturnValue({
                        ai_enabled: 1,
                        ai_target: targetNum,
                        ai_source: 'system',
                        ai_provider: 'gemini'
                    })
                };
            }
            return { run: jest.fn(), get: jest.fn(), all: jest.fn() };
        });

        const m = {
            messages: [{
                key: { remoteJid: incomingJid, fromMe: false },
                message: { conversation: 'Hello Bot' }
            }]
        };

        await messageListener(m);

        // Check if logAiActivity was called (via socket emit)
        expect(global.io.emit).toHaveBeenCalledWith('ai_activity_log', expect.objectContaining({
            type: 'incoming',
            sender: '6285173370796'
        }));
        
        expect(generateAiResponse).toHaveBeenCalled();
    });

    test('should match multiple targets including target number', async () => {
        const targetSetting = '0812345678, 085173370796, 12036302839485726@g.us';
        const incomingJid = '6285173370796@s.whatsapp.net';

        db.prepare.mockImplementation((query) => {
            if (query.includes('FROM users')) {
                return {
                    get: jest.fn().mockReturnValue({
                        ai_enabled: 1,
                        ai_target: targetSetting,
                        ai_source: 'system',
                        ai_provider: 'gemini'
                    })
                };
            }
            return { run: jest.fn(), get: jest.fn(), all: jest.fn() };
        });

        const m = {
            messages: [{
                key: { remoteJid: incomingJid, fromMe: false },
                message: { conversation: 'Hello Bot Multi' }
            }]
        };

        await messageListener(m);

        expect(generateAiResponse).toHaveBeenCalled();
    });
});
