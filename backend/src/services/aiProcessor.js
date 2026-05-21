const db = require('../config/database');
const { normalizePhoneNumber } = require('../helpers/validators');
const { generateAiResponse } = require('./aiEngine');
const { 
    getBotPossibleJids, 
    getMessageContent, 
    extractText, 
    shouldBotReplyInGroup 
} = require('../helpers/aiUtils');

/**
 * Checks if the incoming message matches any of the target settings or monitor targets.
 */
function isTargetMatch(user, incomingJid, remoteJid, isGroup, apiKey) {
    const { findResolvedTarget, tryResolveWaitingTarget } = require('./monitorService');
    const targetSetting = user.ai_target ? user.ai_target.trim().toLowerCase() : '';
    const isAllTarget = !targetSetting || targetSetting === 'all';

    if (isAllTarget) return true;

    const targets = targetSetting.split(',').map(t => t.trim().toLowerCase());
    const normIncoming = normalizePhoneNumber(incomingJid);
    const normRemote = normalizePhoneNumber(remoteJid);

    const matchDirect = targets.some(t => {
        const normT = normalizePhoneNumber(t);
        if (t === incomingJid || t === remoteJid) return true;
        if (normT && (normT === normIncoming || normT === normRemote)) return true;
        return false;
    });

    if (matchDirect) return true;

    // Fallback to monitor_targets table
    let resolvedTarget = null;
    if (isGroup) {
        resolvedTarget = findResolvedTarget(apiKey, remoteJid);
    } else {
        resolvedTarget = findResolvedTarget(apiKey, incomingJid);
        if (!resolvedTarget) {
            resolvedTarget = tryResolveWaitingTarget(apiKey, incomingJid, remoteJid);
        }
    }
    return !!resolvedTarget;
}

/**
 * Core logic for processing an incoming message with AI.
 */
async function processAiReply(apiKey, msg, contactMap = new Map(), botIdentities = { id: null, lid: null }) {
    const { sendMessageViaWa, logAiActivity } = require('./waEngine');
    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    
    const remoteJid = msg.key?.remoteJid || msg.from;
    const participant = msg.key?.participant || remoteJid;
    const incomingJid = jidNormalizedUser(participant);
    const pushName = msg.pushName || participant?.split('@')[0] || 'Unknown';
    
    if (msg.key?.fromMe) return;

    const user = db.prepare('SELECT ai_enabled, ai_source, ai_provider, ai_api_key, ai_system_prompt, ai_context_data, ai_target FROM users WHERE api_key = ?').get(apiKey);
    if (!user || !user.ai_enabled) return;

    const isGroup = remoteJid.endsWith('@g.us');
    
    if (!isTargetMatch(user, incomingJid, remoteJid, isGroup, apiKey)) return;

    let replyOptions = {};
    if (isGroup) {
        const botPossibleJids = getBotPossibleJids(botIdentities);
        if (!shouldBotReplyInGroup(msg, botPossibleJids)) return;
        replyOptions = { quoted: msg };
    }

    const content = getMessageContent(msg);
    const text = extractText(msg, content);
    if (!text) return;

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
        await sendMessageViaWa(apiKey, remoteJid, aiReply, 'text', null, null, replyOptions);
        logAiActivity(apiKey, 'outgoing', pushName, aiReply);
    } catch (e) {
        console.error(`[AI-Processor] Error:`, e.message);
        logAiActivity(apiKey, 'error', pushName, e.message);
    }
}

module.exports = { processAiReply, isTargetMatch };
