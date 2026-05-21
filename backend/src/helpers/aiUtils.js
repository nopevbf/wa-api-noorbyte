const { jidNormalizedUser } = require('@whiskeysockets/baileys');

/**
 * Normalizes a JID.
 */
function normalizeJid(jid) {
    return jid ? jidNormalizedUser(jid) : null;
}

/**
 * Gets all possible JIDs for a bot identity (PN and LID).
 */
function getBotPossibleJids(identities) {
    const jids = new Set();
    if (identities.id) {
        jids.add(identities.id);
        const normId = normalizeJid(identities.id);
        if (normId) jids.add(normId);
    }
    if (identities.lid) {
        jids.add(identities.lid);
        const normLid = normalizeJid(identities.lid);
        if (normLid) jids.add(normLid);
    }
    return Array.from(jids).filter(Boolean);
}

/**
 * Extracts contextInfo from a message.
 */
function getContextInfo(m) {
    let content = m.message || {};
    if (content.ephemeralMessage) content = content.ephemeralMessage.message;
    if (content.viewOnceMessage) content = content.viewOnceMessage.message;
    if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
    return content.extendedTextMessage?.contextInfo || {};
}

/**
 * Extracts actual message content (conversation, text, caption).
 */
function getMessageContent(m) {
    let content = m.message || {};
    if (content.ephemeralMessage) content = content.ephemeralMessage.message;
    if (content.viewOnceMessage) content = content.viewOnceMessage.message;
    if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
    return content;
}

/**
 * Extracts text from various message types.
 */
function extractText(msg, content) {
    return msg.body || 
           content.conversation || 
           content.extendedTextMessage?.text || 
           content.imageMessage?.caption || 
           content.videoMessage?.caption || 
           '';
}

/**
 * Checks if the bot is mentioned in a message.
 */
function isBotMentioned(m, botPossibleJids) {
    const ctx = getContextInfo(m);
    const mentionedJids = ctx.mentionedJid || [];
    return mentionedJids.some(mjid => 
        botPossibleJids.some(bjid => normalizeJid(mjid) === normalizeJid(bjid))
    );
}

/**
 * Checks if a message is a reply to the bot.
 */
function isReplyToBot(m, botPossibleJids) {
    const ctx = getContextInfo(m);
    const quotedParticipant = normalizeJid(ctx.participant);
    const hasQuotedMessage = !!ctx.quotedMessage;
    
    return hasQuotedMessage && botPossibleJids.some(bjid => normalizeJid(bjid) === quotedParticipant);
}

/**
 * Core decision logic for group replies.
 */
function shouldBotReplyInGroup(m, botPossibleJids) {
    return isBotMentioned(m, botPossibleJids) || isReplyToBot(m, botPossibleJids);
}

module.exports = {
    normalizeJid,
    getBotPossibleJids,
    getContextInfo,
    getMessageContent,
    extractText,
    isBotMentioned,
    isReplyToBot,
    shouldBotReplyInGroup
};
