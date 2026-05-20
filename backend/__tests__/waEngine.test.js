const { connectToWhatsApp } = require('../src/services/waEngine');
const baileys = require('@whiskeysockets/baileys');

jest.mock('@whiskeysockets/baileys', () => ({
    default: jest.fn(),
    useMultiFileAuthState: jest.fn().mockResolvedValue({
        state: { creds: {} },
        saveCreds: jest.fn()
    }),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 2311, 5] }),
    DisconnectReason: { loggedOut: 401 }
}));

jest.mock('pino', () => jest.fn(() => ({ level: 'silent' })));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    rmSync: jest.fn(),
    writeFileSync: jest.fn()
}));
jest.mock('../src/config/database', () => ({
    prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([])
    })
}));

describe('waEngine Connection Logs', () => {
    let consoleSpy;

    beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        jest.clearAllMocks();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should log "✅ Mantap! Berhasil terhubung." when connection is open', async () => {
        let connectionUpdateHandler;
        const mockSock = {
            ev: {
                on: jest.fn((event, handler) => {
                    if (event === 'connection.update') {
                        connectionUpdateHandler = handler;
                    }
                })
            }
        };
        baileys.default.mockReturnValue(mockSock);

        await connectToWhatsApp('test-api-key', null);

        // Simulate connection opening
        if (connectionUpdateHandler) {
            await connectionUpdateHandler({ connection: 'open' });
        }

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Mantap! Berhasil terhubung.'));
    });

    it('should block purge for non-test keys when NODE_ENV is test', async () => {
        const { purgeDevice } = require('../src/services/waEngine');
        process.env.NODE_ENV = 'test';
        
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        await purgeDevice('real-api-key', 'some-path', null);
        
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[SAFETY] 🛡️ Blokir penghapusan data non-test key'));
        
        consoleWarnSpy.mockRestore();
    });

    it('should allow purge for test- keys when NODE_ENV is test', async () => {
        const { purgeDevice } = require('../src/services/waEngine');
        process.env.NODE_ENV = 'test';
        
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        await purgeDevice('test-api-key', 'some-path', null);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('💀 DEVICE DIHAPUS'));
        
        consoleLogSpy.mockRestore();
    });
});
