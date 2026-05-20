const db = require('../config/database');
const { normalizePhoneNumber } = require('../helpers/validators');
const { generateAiResponse } = require('./aiEngine');

/**
 * Core logic for processing an incoming message with AI.
 */
async function processAiReply(apiKey, msg, contactMap = new Map()) {
    // Lazy load to avoid circular dependency
    const { sendMessageViaWa, logAiActivity } = require('./waEngine');
    
    const remoteJid = msg.key?.remoteJid || msg.from;
    const participant = msg.key?.participant || remoteJid;
    const pushName = msg.pushName || participant?.split('@')[0] || 'Unknown';
    
    let text = '';
    if (msg.body) {
        text = msg.body;
    } else {
        let messageContent = msg.message;
        if (messageContent?.ephemeralMessage) messageContent = messageContent.ephemeralMessage.message;
        if (messageContent?.viewOnceMessage) messageContent = messageContent.viewOnceMessage.message;
        if (messageContent?.viewOnceMessageV2) messageContent = messageContent.viewOnceMessageV2.message;
        text = messageContent?.conversation || messageContent?.extendedTextMessage?.text || messageContent?.imageMessage?.caption || messageContent?.videoMessage?.caption || '';
    }

    if (!text) return;

    const user = db.prepare('SELECT ai_enabled, ai_source, ai_provider, ai_api_key, ai_system_prompt, ai_context_data, ai_target FROM users WHERE api_key = ?').get(apiKey);
    
    if (user && user.ai_enabled) {
        const targetSetting = user.ai_target ? user.ai_target.trim().toLowerCase() : '';
        let isTargetMatch = !targetSetting || targetSetting === 'all';

        if (!isTargetMatch && targetSetting) {
            const targets = targetSetting.split(',').map(t => normalizePhoneNumber(t.trim())).filter(t => t !== '');
            const senderNumbers = normalizePhoneNumber(participant);
            const groupNumbers = normalizePhoneNumber(remoteJid);
            const contact = contactMap.get(participant) || contactMap.get(remoteJid);
            const contactIdClean = contact ? normalizePhoneNumber(contact.id) : '';
            const contactNotifyClean = contact?.notify ? normalizePhoneNumber(contact.notify) : '';

            isTargetMatch = targets.some(t => {
                if (remoteJid.includes(t) || participant.includes(t)) return true;
                if (senderNumbers === t || groupNumbers === t) return true;
                if (contactIdClean === t || contactNotifyClean === t) return true;
                return false;
            });
        }

        if (isTargetMatch) {
            logAiActivity(apiKey, 'incoming', pushName, text);
            const aiConfig = {
                source: user.ai_source,
                provider: user.ai_provider,
                customKey: user.ai_api_key,
                systemPrompt: user.ai_system_prompt,
                contextData: user.ai_context_data
            };
            try {
                logAiActivity(apiKey, 'processing', pushName, 'Thinking...');
                const aiReply = await generateAiResponse(aiConfig, text);
                await sendMessageViaWa(apiKey, remoteJid, aiReply, 'text');
                logAiActivity(apiKey, 'outgoing', pushName, aiReply);
            } catch (e) {
                logAiActivity(apiKey, 'error', pushName, e.message);
            }
        }
    }
}

module.exports = { processAiReply };
