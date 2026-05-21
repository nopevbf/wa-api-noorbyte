/**
 * @jest-environment node
 */
const request = require('supertest');
const express = require('express');

// Mock @whiskeysockets/baileys BEFORE requiring apiRoutes to prevent ESM error
jest.mock('@whiskeysockets/baileys', () => ({
    default: jest.fn(),
    useMultiFileAuthState: jest.fn().mockResolvedValue({
        state: { creds: {} },
        saveCreds: jest.fn()
    }),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 2311, 5] }),
    DisconnectReason: { loggedOut: 401 }
}));

// We must also mock pino, qrcode since waEngine requires them and they might clutter logs
jest.mock('pino', () => jest.fn(() => ({ level: 'silent' })));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

const router = require('../src/routes/apiRoutes');
const db = require('../src/config/database');
const { encrypt } = require('../src/helpers/security');

// Ensure ENCRYPTION_KEY is set for tests
if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'f3e1c9b2d5a8e7f6g5h4i3j2k1l0m9n8';
}

// We use the real database for integration testing
// jest.mock('../src/config/database'); 

const app = express();
app.use(express.json());
app.use('/', router);

describe('AI Routes Integration', () => {
    const testApiKey = 'test_api_key_ai_route';

    beforeAll(() => {
        // Setup a test user
        db.prepare("DELETE FROM users WHERE api_key = ?").run(testApiKey);
        db.prepare("DELETE FROM users WHERE api_key = ?").run('default-token');
        db.prepare("INSERT INTO users (username, phone, api_key, role) VALUES (?, ?, ?, ?)").run('TestUser', '123', testApiKey, 'user');
    });

    afterAll(() => {
        db.prepare("DELETE FROM users WHERE api_key = ?").run(testApiKey);
        db.prepare("DELETE FROM users WHERE api_key = ?").run('default-token');
    });

    describe('POST /ai/save-settings', () => {
        test('should save AI settings correctly', async () => {
            const settings = {
                ai_enabled: true,
                ai_source: 'custom',
                ai_provider: 'openai',
                ai_api_key: 'secret_key',
                ai_system_prompt: 'You are an assistant',
                ai_context_data: 'Some context',
                ai_target: '62812345678'
            };

            const response = await request(app)
                .post('/ai/save-settings')
                .set('Authorization', `Bearer ${testApiKey}`)
                .send(settings);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);

            // Verify in database
            const user = db.prepare("SELECT * FROM users WHERE api_key = ?").get(testApiKey);
            expect(user.ai_enabled).toBe(1);
            expect(user.ai_source).toBe('custom');
            expect(user.ai_provider).toBe('openai');
            expect(user.ai_api_key).not.toBe('secret_key'); // Should be encrypted
            expect(user.ai_system_prompt).toBe('You are an assistant');
        });

        test('should handle missing ai_api_key', async () => {
            const settings = {
                ai_enabled: false,
                ai_source: 'system',
                ai_provider: 'gemini',
                ai_system_prompt: '',
                ai_context_data: '',
                ai_target: ''
            };

            const response = await request(app)
                .post('/ai/save-settings')
                .set('Authorization', `Bearer ${testApiKey}`)
                .send(settings);

            expect(response.status).toBe(200);
            
            const user = db.prepare("SELECT * FROM users WHERE api_key = ?").get(testApiKey);
            expect(user.ai_enabled).toBe(0);
            expect(user.ai_api_key).toBeNull();
        });
    });

    describe('GET /ai/settings', () => {
        it('should have ai_enabled set to false by default for new users', async () => {
            // Simulasi insert user baru tanpa field AI
            db.prepare("INSERT INTO users (username, phone, api_key) VALUES (?, ?, ?)").run('TestDefault', '999', 'default-token');
            
            const res = await request(app)
                .get('/ai/settings')
                .set('Authorization', 'Bearer default-token');
            
            expect(res.status).toBe(200);
            expect(res.body.status).toBe(true);
            expect(res.body.data.ai_enabled).toBe(false);
            expect(res.body.data.ai_source).toBe('system'); // Default from DB/Route
        });

        it('should return all saved settings including ai_target', async () => {
            // Setup data
            const settings = {
                ai_enabled: true,
                ai_source: 'system',
                ai_provider: null,
                ai_api_key: null,
                ai_system_prompt: 'Test prompt',
                ai_context_data: 'Test context',
                ai_target: '08123456789'
            };

            await request(app)
                .post('/ai/save-settings')
                .set('Authorization', `Bearer ${testApiKey}`)
                .send(settings);

            // Fetch data
            const res = await request(app)
                .get('/ai/settings')
                .set('Authorization', `Bearer ${testApiKey}`);
            
            expect(res.status).toBe(200);
            expect(res.body.data.ai_target).toBe('08123456789');
            expect(res.body.data.ai_system_prompt).toBe('Test prompt');
        });
    });
});
