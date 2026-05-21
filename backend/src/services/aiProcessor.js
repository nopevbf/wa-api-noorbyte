const db = require('../config/database');
const { normalizePhoneNumber } = require('../helpers/validators');
const { generateAiResponse } = require('./aiEngine');

/**
 * Core logic for processing an incoming message with AI.
 */
async function processAiReply(apiKey, msg, contactMap = new Map(), botIdentities = { id: null, lid: null }) {
    // Lazy load to avoid circular dependency
    const { sendMessageViaWa, logAiActivity } = require('./waEngine');
    const { findResolvedTarget, tryResolveWaitingTarget } = require('./monitorService');
    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    
    const remoteJid = msg.key?.remoteJid || msg.from;
    const participant = msg.key?.participant || remoteJid;
    const incomingJid = jidNormalizedUser(participant);
    const pushName = msg.pushName || participant?.split('@')[0] || 'Unknown';
    
    // Skip messages from the bot itself
    if (msg.key?.fromMe) return;

    // --- HELPER FUNCTIONS FOR MENTIONS & QUOTES ---
    const normalizeJid = (jid) => jid ? jidNormalizedUser(jid) : null;

    const getBotPossibleJids = (identities) => {
        const jids = new Set();
        if (identities.id) {
            jids.add(identities.id);
            jids.add(normalizeJid(identities.id));
        }
        if (identities.lid) {
            jids.add(identities.lid);
            jids.add(normalizeJid(identities.lid));
        }
        return Array.from(jids).filter(Boolean);
    };

    const getContextInfo = (m) => {
        let content = m.message || {};
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        return content.extendedTextMessage?.contextInfo || {};
    };

    const getMentionedJids = (m) => {
        return getContextInfo(m).mentionedJid || [];
    };

    const isBotMentioned = (m, botPossibleJids) => {
        const mentionedJids = getMentionedJids(m);
        return mentionedJids.some(mjid => 
            botPossibleJids.some(bjid => normalizeJid(mjid) === normalizeJid(bjid))
        );
    };

    const isReplyToBot = (m, botPossibleJids) => {
        const ctx = getContextInfo(m);
        const quotedParticipant = normalizeJid(ctx.participant);
        const hasQuotedMessage = !!ctx.quotedMessage;
        
        const matched = hasQuotedMessage && botPossibleJids.some(bjid => normalizeJid(bjid) === quotedParticipant);

        console.log('[REPLY CHECK]', {
            quotedParticipant,
            stanzaId: ctx.stanzaId,
            hasQuotedMessage,
            botPossibleJids,
            matched
        });

        return matched;
    };

    const shouldBotReplyInGroup = (m, botPossibleJids) => {
        const ctx = getContextInfo(m);
        
        console.log('[DEBUG CONTEXT INFO]', {
            remoteJid: m.key?.remoteJid,
            participant: m.key?.participant,
            contextParticipant: ctx.participant,
            stanzaId: ctx.stanzaId,
            mentionedJids: ctx.mentionedJid || [],
            hasQuotedMessage: !!ctx.quotedMessage
        });

        const mentioned = isBotMentioned(m, botPossibleJids);
        const repliedToBot = isReplyToBot(m, botPossibleJids);
        const shouldReply = mentioned || repliedToBot;

        console.log('[GROUP TRIGGER CHECK]', {
            mentioned,
            repliedToBot,
            shouldReply
        });

        return shouldReply;
    };

    // Extract actual message content
    const getMessageContent = (m) => {
        let content = m.message || {};
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        return content;
    };

    const content = getMessageContent(msg);
    const isGroup = remoteJid.endsWith('@g.us');
    let replyOptions = {};

    // --- GROUP CHAT LOGIC ---
    if (isGroup) {
        // Check if group is a resolved target
        const resolvedGroup = findResolvedTarget(apiKey, remoteJid);
        if (!resolvedGroup) return; // Silent if group not monitored

        // Get all possible bot identities
        const botPossibleJids = getBotPossibleJids(botIdentities);
        
        if (!shouldBotReplyInGroup(msg, botPossibleJids)) return;

        // Use quoted reply for group context
        replyOptions = { quoted: msg };
    }

    let text = msg.body || content.conversation || content.extendedTextMessage?.text || 
               content.imageMessage?.caption || content.videoMessage?.caption || '';

    if (!text) return;

    const user = db.prepare('SELECT ai_enabled, ai_source, ai_provider, ai_api_key, ai_system_prompt, ai_context_data, ai_target FROM users WHERE api_key = ?').get(apiKey);
    
    if (user && user.ai_enabled) {
        // --- PERSONAL CHAT LOGIC (Target Matching / First Message Sync) ---
        let resolvedTarget = null;
        if (isGroup) {
            resolvedTarget = true; // Already checked group above
        } else {
            resolvedTarget = findResolvedTarget(apiKey, incomingJid);
            if (!resolvedTarget) {
                resolvedTarget = tryResolveWaitingTarget(apiKey, incomingJid, remoteJid, participant);
            }
        }

        // Special case for 'all' or empty target setting (legacy support)
        const targetSetting = user.ai_target ? user.ai_target.trim().toLowerCase() : '';
        const isAllTarget = !targetSetting || targetSetting === 'all';
        
        if (resolvedTarget || isAllTarget) {
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
                logAiActivity(apiKey, 'error', pushName, e.message);
            }
        }
    }
}

module.exports = { processAiReply };
