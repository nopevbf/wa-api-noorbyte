const { generateAiResponse } = require('../src/services/aiEngine');
const axios = require('axios');

jest.mock('axios');

describe('AI Engine', () => {
    beforeEach(() => {
        process.env.AI_SYSTEM_API_KEY = 'test_key';
        delete process.env.AI_SYSTEM_PROVIDER;
        jest.clearAllMocks();
    });

    test('should call Gemini API correctly', async () => {
        axios.post.mockResolvedValue({
            data: { candidates: [{ content: { parts: [{ text: 'Gemini Reply' }] } }] }
        });

        const config = { source: 'system', provider: 'gemini' };
        const reply = await generateAiResponse(config, 'Hello');
        
        expect(reply).toBe('Gemini Reply');
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('generativelanguage.googleapis.com'),
            expect.any(Object)
        );
    });

    test('should call OpenAI API correctly', async () => {
        axios.post.mockResolvedValue({
            data: { choices: [{ message: { content: 'OpenAI Reply' } }] }
        });

        const config = { source: 'system', provider: 'openai' };
        const reply = await generateAiResponse(config, 'Hello');
        
        expect(reply).toBe('OpenAI Reply');
        expect(axios.post).toHaveBeenCalledWith(
            'https://api.openai.com/v1/chat/completions',
            expect.any(Object),
            expect.any(Object)
        );
    });

    test('should prioritize AI_SYSTEM_PROVIDER from env if source is system', async () => {
        process.env.AI_SYSTEM_PROVIDER = 'openai';
        axios.post.mockResolvedValue({
            data: { choices: [{ message: { content: 'Env Provider Reply' } }] }
        });

        // Di DB diset gemini, tapi di env diset openai
        const config = { source: 'system', provider: 'gemini' };
        const reply = await generateAiResponse(config, 'Hello');

        expect(reply).toBe('Env Provider Reply');
        expect(axios.post).toHaveBeenCalledWith(
            'https://api.openai.com/v1/chat/completions',
            expect.any(Object),
            expect.any(Object)
        );
        delete process.env.AI_SYSTEM_PROVIDER;
    });

    test('should throw error if API key is missing', async () => {
        delete process.env.AI_SYSTEM_API_KEY;
        const config = { source: 'system', provider: 'gemini' };
        await expect(generateAiResponse(config, 'Hello')).rejects.toThrow('API Key tidak ditemukan.');
    });

    test('should throw error for unsupported provider', async () => {
        const config = { source: 'system', provider: 'invalid' };
        await expect(generateAiResponse(config, 'Hello')).rejects.toThrow('Provider tidak didukung.');
    });

    test('should mask API Key in error messages', async () => {
        const secretKey = 'secret-1234567890-xyz';
        process.env.AI_SYSTEM_API_KEY = secretKey;
        
        // Simulate axios error that might contain the key in message or URL
        const error = new Error(`Request failed with status 403: Forbidden for key ${secretKey}`);
        axios.post.mockRejectedValue(error);

        const config = { source: 'system', provider: 'gemini' };
        
        try {
            await generateAiResponse(config, 'Hello');
            fail('Should have thrown an error');
        } catch (e) {
            expect(e.message).not.toContain(secretKey);
            expect(e.message).toContain('***');
        }
    });
});
