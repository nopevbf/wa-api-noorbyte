const { getMessageContent, extractText } = require('./aiUtils');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// State management
const botSentMessageIds = new Set();
const pausedChats = new Map(); // chatJid -> resumeTimestamp (null for indefinite)
const processedMessageIds = new Map(); // messageId -> expiryTimestamp

const OWNER_ALLOWED_JIDS = [
    '217166666317835@lid',
    '6285173370796@s.whatsapp.net'
];

/**
 * Normalizes a JID by removing device identifiers and ensuring standard domain.
 */
function normalizeJid(jid) {
    if (!jid) return null;
    try {
        // 1. Remove device ID if present (e.g., :40)
        let mainPart = jid.split(':')[0];
        
        // 2. Remove domain if already present to avoid double domain
        let idOnly = mainPart.split('@')[0];

        // 3. Re-append correct domain based on original input
        if (jid.includes('@lid')) return idOnly + '@lid';
        if (jid.includes('@s.whatsapp.net') || !jid.includes('@')) return idOnly + '@s.whatsapp.net';
        
        return mainPart;
    } catch (e) {
        return jid;
    }
}

/**
 * Extracts sender JID from message.
 */
function getSenderJid(msg) {
    return normalizeJid(msg.key?.participant || msg.key?.remoteJid);
}

/**
 * Mendapatkan teks dari pesan.
 */
function getMessageText(msg) {
    const content = getMessageContent(msg);
    return extractText(msg, content);
}

/**
 * Verifies if message is truly from a hardcoded owner identity.
 */
function isRealOwnerMessage(msg) {
    if (msg.key?.fromMe !== true) return false;
    
    const senderJid = getSenderJid(msg);
    return OWNER_ALLOWED_JIDS.includes(senderJid);
}

/**
 * Checks if message is duplicate within 5 minutes.
 */
function isDuplicateMessage(msg) {
    const msgId = msg.key?.id;
    if (!msgId) return false;

    const now = Date.now();
    if (processedMessageIds.has(msgId)) {
        const expiry = processedMessageIds.get(msgId);
        if (now < expiry) return true;
    }

    // Track it with 5 mins expiry
    processedMessageIds.set(msgId, now + (5 * 60 * 1000));
    
    // Background Cleanup (once size > 1000)
    if (processedMessageIds.size > 1000) {
        for (const [id, exp] of processedMessageIds.entries()) {
            if (now > exp) processedMessageIds.delete(id);
        }
    }

    return false;
}

/**
 * Mengecek apakah pesan dikirim oleh bot.
 */
function isBotGeneratedMessage(msg) {
    const msgId = msg.key?.id;
    return botSentMessageIds.has(msgId);
}

/**
 * Mengecek apakah pesan dikirim manual oleh owner.
 * Syarat: isRealOwnerMessage true dan bukan buatan bot.
 */
function isManualOwnerMessage(msg) {
    if (!isRealOwnerMessage(msg)) return false;
    return !isBotGeneratedMessage(msg);
}

/**
 * Menghentikan AI untuk chat tertentu (Temporary).
 */
function pauseAiForChat(chatJid, minutes = 1) {
    if (!chatJid) return;
    const resumeTimestamp = Date.now() + (minutes * 60 * 1000);
    pausedChats.set(chatJid, resumeTimestamp);
    console.log(`[HUMAN TAKEOVER] AI paused for ${chatJid} until ${new Date(resumeTimestamp).toLocaleTimeString()}`);
}

/**
 * Menghentikan AI untuk chat tertentu selamanya (Manual Off).
 */
function pauseAiForever(chatJid) {
    if (!chatJid) return;
    pausedChats.set(chatJid, null);
    console.log(`[HUMAN TAKEOVER] AI paused FOREVER for ${chatJid} (Manual Off)`);
}

/**
 * Mengaktifkan kembali AI untuk chat tertentu.
 */
function resumeAiForChat(chatJid) {
    if (pausedChats.has(chatJid)) {
        pausedChats.delete(chatJid);
        console.log(`[HUMAN TAKEOVER] AI resumed for ${chatJid}`);
    }
}

/**
 * Mengecek apakah AI sedang dipause untuk chat tertentu.
 */
function isAiPaused(chatJid) {
    if (!pausedChats.has(chatJid)) return false;

    const resumeTimestamp = pausedChats.get(chatJid);
    if (resumeTimestamp === null) return true; // Indefinite pause

    if (Date.now() > resumeTimestamp) {
        pausedChats.delete(chatJid);
        console.log(`[HUMAN TAKEOVER] AI resumed automatically for ${chatJid} (timeout)`);
        return false;
    }

    return true;
}

/**
 * Wrapper untuk mengirim pesan AI agar ID-nya tercatat.
 */
async function sendBotMessage(sock, jid, content, options = {}) {
    const result = await sock.sendMessage(jid, content, options);
    if (result?.key?.id) {
        botSentMessageIds.add(result.key.id);
        console.log(`[BOT MESSAGE TRACKED] ID: ${result.key.id}`);

        // Limit Set size
        if (botSentMessageIds.size > 1000) {
            const firstItem = botSentMessageIds.values().next().value;
            botSentMessageIds.delete(firstItem);
        }
    }
    return result;
}

module.exports = {
    normalizeJid,
    getSenderJid,
    getMessageText,
    isRealOwnerMessage,
    isDuplicateMessage,
    isBotGeneratedMessage,
    isManualOwnerMessage,
    pauseAiForChat,
    pauseAiForever,
    resumeAiForChat,
    isAiPaused,
    sendBotMessage,
    botSentMessageIds,
    pausedChats,
    processedMessageIds,
    OWNER_ALLOWED_JIDS
};
