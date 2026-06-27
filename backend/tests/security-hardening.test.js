const request = require('supertest');
const express = require('express');
const router = require('../src/routes/apiRoutes');
const db = require('../src/config/database');

// Mock @whiskeysockets/baileys
jest.mock('@whiskeysockets/baileys', () => ({
    default: jest.fn(),
    useMultiFileAuthState: jest.fn().mockResolvedValue({ state: {}, saveCreds: jest.fn() }),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: '1.0.0' }),
    DisconnectReason: { loggedOut: 401 },
    jidNormalizedUser: (jid) => jid
}));

// Mock waEngine
jest.mock('../src/services/waEngine', () => ({
    sendMessageViaWa: jest.fn(),
    disconnectWa: jest.fn(),
    connectToWhatsApp: jest.fn(),
    fetchGroups: jest.fn(),
    resolveTargets: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api', router);

describe('Security Hardening: Error Handling', () => {
    const testApiKey = 'security_test_key';

    beforeAll(() => {
        db.prepare("DELETE FROM users WHERE api_key = ?").run(testApiKey);
        db.prepare("INSERT INTO users (username, phone, api_key, role) VALUES (?, ?, ?, ?)").run('SecUser', '123', testApiKey, 'user');
    });

    afterAll(() => {
        db.prepare("DELETE FROM users WHERE api_key = ?").run(testApiKey);
    });

    test('POST /api/add-device should NOT return raw error message on failure', async () => {
        // Force a DB error by mocking prepare to throw
        const originalPrepare = db.prepare;
        db.prepare = jest.fn().mockImplementation((query) => {
            if (query.includes('INSERT INTO users')) {
                return {
                    run: () => { throw new Error('RAW_DB_ERROR_SENSITIVE_DETAILS'); }
                };
            }
            return originalPrepare.call(db, query);
        });

        const response = await request(app)
            .post('/api/add-device')
            .set('Authorization', `Bearer ${testApiKey}`)
            .send({ name: 'FailDevice', phone: '123' });

        expect(response.status).toBe(500);
        expect(response.body.status).toBe(false);
        // The fix should ensure 'error' field is NOT present or does not contain technical details
        expect(response.body.error).toBeUndefined();
        expect(response.body.message).not.toContain('RAW_DB_ERROR');
        
        // Restore
        db.prepare = originalPrepare;
    });

    test('POST /api/ai/save-settings should NOT return raw error message on failure', async () => {
        const originalPrepare = db.prepare;
        db.prepare = jest.fn().mockImplementation((query) => {
            if (query.includes('UPDATE users SET')) {
                return {
                    run: () => { throw new Error('DB_QUERY_FAILURE_XYZ'); }
                };
            }
            return originalPrepare.call(db, query);
        });

        const response = await request(app)
            .post('/api/ai/save-settings')
            .set('Authorization', `Bearer ${testApiKey}`)
            .send({ ai_enabled: true, ai_source: 'system' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBeUndefined();
        expect(response.body.message).not.toContain('DB_QUERY_FAILURE');

        db.prepare = originalPrepare;
    });
});
