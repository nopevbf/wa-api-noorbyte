const axios = require('axios');
const { decrypt, maskSensitiveData } = require('../helpers/security');

async function generateAiResponse(config, userMessage) {
    const { source, provider: dbProvider, customKey, systemPrompt, contextData } = config;
    
    // Ambil API Key dan Provider dari ENV jika source adalah system
    const apiKey = source === 'system' ? process.env.AI_SYSTEM_API_KEY : decrypt(customKey);
    const provider = source === 'system' ? (process.env.AI_SYSTEM_PROVIDER || dbProvider) : dbProvider;
    
    if (!apiKey) throw new Error('API Key tidak ditemukan.');

    const fullPrompt = `${systemPrompt || 'Anda adalah asisten AI.'}\n\nKonteks Tambahan:\n${contextData || '-'}\n\nUser: ${userMessage}`;

    try {
        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: fullPrompt }] }]
            });
            return response.data.candidates[0].content.parts[0].text;
        } else if (provider === 'openai') {
            const url = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(url, {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: fullPrompt }]
            }, { headers: { Authorization: `Bearer ${apiKey}` } });
            return response.data.choices[0].message.content;
        }
    } catch (error) {
        const maskedMsg = maskSensitiveData(error.message, apiKey);
        throw new Error(maskedMsg);
    }
    throw new Error('Provider tidak didukung.');
}

module.exports = { generateAiResponse };
