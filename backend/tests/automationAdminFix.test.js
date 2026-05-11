const request = require('supertest');
const express = require('express');

// Dummy DB mock
jest.mock('../src/config/database', () => {
    const mockGet = jest.fn((val) => {
        // Return a dummy user if we are checking for existence in users table
        return { api_key: 'TARGET_DEVICE_123' };
    });
    return {
        prepare: jest.fn(() => ({
            get: mockGet,
            run: jest.fn(),
        })),
    };
});

const db = require('../src/config/database');

// Mock auth middleware
const checkApiKey = (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (authHeader === 'Bearer ADMIN123') {
        req.user = { username: 'Admin', role: 'admin' };
        return next();
    } else if (authHeader === 'Bearer USER123') {
        req.user = { username: 'User1', role: 'user', api_key: 'USER123' };
        return next();
    }
    return res.status(401).json({ status: false, message: 'Unauthorized' });
};

jest.mock('../src/middlewares/auth', () => checkApiKey);

// Mock socks-proxy-agent
jest.mock('socks-proxy-agent', () => {
    return {
        SocksProxyAgent: jest.fn().mockImplementation(() => ({}))
    };
});

// Mock waEngine to avoid Baileys ES module errors
jest.mock('../src/services/waEngine', () => ({
    connectToWhatsApp: jest.fn(),
    sendMessageViaWa: jest.fn(),
    disconnectWa: jest.fn(),
    fetchGroups: jest.fn()
}));

// Dummy automation engine mock
jest.mock('../src/services/automationEngine', () => ({
    getScheduleLogs: jest.fn(() => []),
    clearScheduleLogs: jest.fn(),
}));

const apiRoutes = require('../src/routes/apiRoutes');
const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('Automation Admin Privilege', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Admin can schedule automation using api_key from body', async () => {
        const response = await request(app)
            .post('/api/automation/run-manual')
            .set('Authorization', 'Bearer ADMIN123')
            .send({
                api_key: 'TARGET_DEVICE_123',
                run_time: '14:00',
                dp_api_url: 'http://test.com',
                dp_email: 'test@test.com',
                dp_password: 'pass',
                target_number: '1234567890',
                manual_tasks: []
            });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(true);
        expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id FROM automation_schedules'));
    });

    it('User can schedule automation using api_key from session', async () => {
        const response = await request(app)
            .post('/api/automation/run-manual')
            .set('Authorization', 'Bearer USER123')
            .send({
                run_time: '14:00',
                dp_api_url: 'http://test.com',
                dp_email: 'test@test.com',
                dp_password: 'pass',
                target_number: '1234567890',
                manual_tasks: []
            });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(true);
    });
});
