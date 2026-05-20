const request = require('supertest');
const express = require('express');
const router = require('../src/routes/apiRoutes');
const db = require('../src/config/database');
const { encrypt } = require('../src/helpers/security');

jest.mock('socks-proxy-agent', () => ({
    SocksProxyAgent: jest.fn()
}));
jest.mock('../src/config/database');
jest.mock('../src/helpers/security');
jest.mock('../src/middlewares/auth', () => (req, res, next) => {
    req.user = { api_key: 'test_api_key', role: 'user' };
    next();
});
jest.mock('../src/services/waEngine', () => ({
    sendMessageViaWa: jest.fn(),
    disconnectWa: jest.fn(),
    connectToWhatsApp: jest.fn(),
    fetchGroups: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/', router);

describe('POST /ai/save-settings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should save AI settings and encrypt API key', async () => {
        const mockRun = jest.fn();
        db.prepare.mockReturnValue({ run: mockRun });
        encrypt.mockReturnValue('encrypted_key');

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
            .send(settings);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(true);
        expect(encrypt).toHaveBeenCalledWith('secret_key');
        expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET'));
        expect(mockRun).toHaveBeenCalledWith(
            1, 'custom', 'openai', 'encrypted_key', 'You are an assistant', 'Some context', '62812345678', 'test_api_key'
        );
    });

    test('should handle encryption when ai_api_key is missing', async () => {
        const mockRun = jest.fn();
        db.prepare.mockReturnValue({ run: mockRun });

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
            .send(settings);

        expect(response.status).toBe(200);
        expect(mockRun).toHaveBeenCalledWith(
            0, 'system', 'gemini', null, '', '', '', 'test_api_key'
        );
    });
});
