process.env.ENCRYPTION_KEY = 'f3e1c9b2d5a8e7f6g5h4i3j2k1l0m9n8';
process.env.NODE_ENV = 'test';

// Polyfill for TextEncoder/TextDecoder (needed for some packages in jsdom environment)
if (typeof global.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util');
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
}

// Global mock for socks-proxy-agent (ESM module that causes issues in CJS tests)
jest.mock('socks-proxy-agent', () => ({
    SocksProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

// Global mock for baileys (ESM module)
jest.mock('@whiskeysockets/baileys', () => ({
    default: jest.fn(),
    useMultiFileAuthState: jest.fn().mockReturnValue({ state: {}, saveCreds: jest.fn() }),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 0, 0], isLatest: true }),
    DisconnectReason: {},
    makeWASocket: jest.fn(),
}));

// Global mock for waEngine
jest.mock('../src/services/waEngine', () => ({
    sendMessageViaWa: jest.fn(),
    disconnectWa: jest.fn(),
    connectToWhatsApp: jest.fn(),
    fetchGroups: jest.fn(),
}));
