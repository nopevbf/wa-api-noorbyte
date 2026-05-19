/**
 * lcrEngine.test.js — TDD Tests for LCR Engine Refactoring
 * 
 * Focuses on:
 * 1. AbortController functionality (canceling operations gracefully)
 * 2. EventEmitter usage (replacing global.io)
 */
// Mock puppeteer and other heavy dependencies BEFORE requiring the module
const mockPage = {
    setUserAgent: jest.fn(),
    setExtraHTTPHeaders: jest.fn(),
    goto: jest.fn().mockResolvedValue(true),
    evaluate: jest.fn().mockResolvedValue('ready'),
    evaluateOnNewDocument: jest.fn(),
    exposeFunction: jest.fn(),
    keyboard: { press: jest.fn() },
    screenshot: jest.fn(),
    url: jest.fn().mockReturnValue('https://example.com'),
    cookies: jest.fn().mockResolvedValue([{ name: 'sessionid', value: 'fake-session' }]),
    bringToFront: jest.fn().mockResolvedValue(true)
};

jest.mock('puppeteer-extra', () => {
    return {
        use: jest.fn(),
        launch: jest.fn().mockResolvedValue({
            newPage: jest.fn().mockResolvedValue(mockPage),
            pages: jest.fn().mockResolvedValue([mockPage]),
            close: jest.fn(),
            process: jest.fn().mockReturnValue({ spawnargs: [] })
        })
    };
});

const { executeLCR, getLcrStatus } = require('../src/services/lcrEngine');
const EventEmitter = require('events');

describe('LCR Engine - AbortController & Event Emitter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // ensure global.io is undefined to prove we don't rely on it
        delete global.io;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should emit progress and log events via custom EventEmitter', async () => {
        const emitter = new EventEmitter();
        const logs = [];
        
        emitter.on('pulse_log', (log) => logs.push(log.message));

        const identity = { ig_email: 'test@ig.com', ig_password: 'pass' };
        const payload = { links: 'https://instagram.com/p/123\nhttps://tiktok.com/@user/video/123' };

        const execPromise = executeLCR(identity, payload, { eventEmitter: emitter, sessionId: 'test-session-1' });
        
        // Fast-forward timers to skip sleeps
        for(let i=0; i<100; i++) {
            await Promise.resolve(); // flush microtasks
            jest.advanceTimersByTime(5000);
        }
        
        await execPromise;

        expect(logs.length).toBeGreaterThan(0);
        expect(logs.some(m => m.includes('Engine AKTIF'))).toBe(true);
        expect(logs.some(m => m.includes('Misi Selesai'))).toBe(true);
    });

    it('should abort execution when abortSignal is triggered', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        const logs = [];
        
        emitter.on('pulse_log', (log) => logs.push(log.message));

        const identity = { ig_email: 'test@ig.com', ig_password: 'pass' };
        const payload = { links: 'https://instagram.com/p/123\nhttps://instagram.com/p/456\nhttps://instagram.com/p/789' };

        // Start execution but abort it immediately
        controller.abort();
        
        const execPromise = executeLCR(identity, payload, { 
            eventEmitter: emitter,
            abortSignal: controller.signal,
            sessionId: 'test-session-2'
        });

        // Fast-forward timers to skip sleeps
        for(let i=0; i<100; i++) {
            await Promise.resolve(); // flush microtasks
            jest.advanceTimersByTime(5000);
        }
        
        const result = await execPromise;

        expect(result.status).toBe(false); // execution aborted
        // It shouldn't have processed all links if aborted early
        expect(logs.some(m => m.includes('Misi Selesai'))).toBe(false);
        expect(logs.some(m => m.includes('Dibatalkan'))).toBe(true);
    });
});
