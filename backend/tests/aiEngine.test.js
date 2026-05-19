const { generateAiResponse } = require('../src/services/aiEngine');
const axios = require('axios');

jest.mock('axios');

describe('AI Engine', () => {
    beforeEach(() => {
        process.env.AI_SYSTEM_API_KEY = 'test_key';
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

    test('should throw error if API key is missing', async () => {
        delete process.env.AI_SYSTEM_API_KEY;
        const config = { source: 'system', provider: 'gemini' };
        await expect(generateAiResponse(config, 'Hello')).rejects.toThrow('API Key tidak ditemukan.');
    });

    test('should throw error for unsupported provider', async () => {
        const config = { source: 'system', provider: 'invalid' };
        await expect(generateAiResponse(config, 'Hello')).rejects.toThrow('Provider tidak didukung.');
    });
});
