const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { handleIncomingPulseMessage } = require('./pulseWatcher');
const { generateAiResponse } = require('./aiEngine');
const { normalizePhoneNumber } = require('../helpers/validators');

const activeSessions = new Map();
const contactMappings = new Map(); // apiKey -> Map(jid -> info)

// 🔴 MAP: Lacak jumlah percobaan reconnect yang GAGAL berturut-turut per device
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Hapus semua jejak device dari sistem + database.
 * Dipanggil saat device sudah melewati batas reconnect.
 */
async function purgeDevice(apiKey, sessionDir, io) {
    // 🛡️ SAFETY LOCK: Jangan hapus data asli kalau lagi di mode TEST
    // Kecuali kalau API Key nya memang diawali dengan 'test'
    if (process.env.NODE_ENV === 'test' && !apiKey.startsWith('test')) {
        console.warn(`[SAFETY] 🛡️ Blokir penghapusan data non-test key: ${apiKey} di lingkungan pengujian.`);
        return;
    }

    console.log(`\n[${apiKey}] 💀 ====================================`);
    console.log(`[${apiKey}] 💀 DEVICE DIHAPUS setelah ${MAX_RECONNECT_ATTEMPTS}x reconnect gagal!`);
    console.log(`[${apiKey}] 💀 ====================================\n`);

    if (activeSessions.has(apiKey)) {
        const oldSocket = activeSessions.get(apiKey);
        try {
            oldSocket.ev.removeAllListeners();
            oldSocket.ws.close();
        } catch (e) { }
        activeSessions.delete(apiKey);
    }
    reconnectAttempts.delete(apiKey);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    try {
        db.prepare('DELETE FROM automation_schedules WHERE api_key = ?').run(apiKey);
        db.prepare('DELETE FROM message_logs WHERE api_key = ?').run(apiKey);
        db.prepare('DELETE FROM users WHERE api_key = ?').run(apiKey);
    } catch (dbErr) {
        console.error(`[${apiKey}] ❌ Gagal hapus data:`, dbErr);
    }
    if (io) {
        io.emit(`status-${apiKey}`, { apiKey, status: 'Purged' });
    }
}

function formatNumber(number) {
    if (number.endsWith('@g.us')) return number;
    let formatted = number.replace(/\D/g, '');
    if (formatted.startsWith('0')) formatted = '62' + formatted.substring(1);
    if (!formatted.endsWith('@s.whatsapp.net')) formatted += '@s.whatsapp.net';
    return formatted;
}

async function connectToWhatsApp(apiKey, io) {
    try {
        if (activeSessions.has(apiKey)) {
            const oldSocket = activeSessions.get(apiKey);
            try {
                oldSocket.ev.removeAllListeners();
                oldSocket.ws.close();
            } catch (e) { }
            activeSessions.delete(apiKey);
        }

        const sessionBaseDir = process.env.SESSION_PATH || path.join(__dirname, '../../sessions');
        const sessionDir = path.join(sessionBaseDir, apiKey);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`[${apiKey}] Memulai koneksi WA...`);

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' })
        });

        activeSessions.set(apiKey, sock);
        contactMappings.set(apiKey, new Map());

        sock.ev.on('contacts.upsert', (contacts) => {
            const map = contactMappings.get(apiKey);
            contacts.forEach(c => { if (c.id) map.set(c.id, c); });
        });

        sock.ev.on('contacts.update', (updates) => {
            const map = contactMappings.get(apiKey);
            updates.forEach(u => {
                if (u.id) {
                    const prev = map.get(u.id) || {};
                    map.set(u.id, { ...prev, ...u });
                }
            });
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                process.stdout.write('🔄 ');
                db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
                try {
                    const qrImageUrl = await QRCode.toDataURL(qr);
                    if (io) io.emit(`qr-${apiKey}`, { apiKey, qrImageUrl });
                } catch (err) { }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
                const shouldReconnect = !isLoggedOut;
                activeSessions.delete(apiKey);
                if (shouldReconnect) {
                    const currentAttempts = (reconnectAttempts.get(apiKey) || 0) + 1;
                    reconnectAttempts.set(apiKey, currentAttempts);
                    if (currentAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        await purgeDevice(apiKey, sessionDir, io);
                    } else {
                        setTimeout(() => connectToWhatsApp(apiKey, io), 5000);
                    }
                } else {
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
                    db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
                }
            } else if (connection === 'open') {
                reconnectAttempts.set(apiKey, 0);
                console.log(`[${apiKey}] ✅ Mantap! Berhasil terhubung.`);
                db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Connected', apiKey);
                if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Connected' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            for (const msg of m.messages) {
                if (!msg.message || msg.key.fromMe) continue;

                handleIncomingPulseMessage(apiKey, msg).catch(e => {});

                const remoteJid = msg.key.remoteJid;
                const participant = msg.key.participant || remoteJid;
                const pushName = msg.pushName || participant.split('@')[0];
                
                let messageContent = msg.message;
                if (messageContent?.ephemeralMessage) messageContent = messageContent.ephemeralMessage.message;
                if (messageContent?.viewOnceMessage) messageContent = messageContent.viewOnceMessage.message;
                if (messageContent?.viewOnceMessageV2) messageContent = messageContent.viewOnceMessageV2.message;
                const text = messageContent?.conversation || messageContent?.extendedTextMessage?.text || messageContent?.imageMessage?.caption || messageContent?.videoMessage?.caption || '';

                const user = db.prepare('SELECT ai_enabled, ai_source, ai_provider, ai_api_key, ai_system_prompt, ai_context_data, ai_target, webhook_url FROM users WHERE api_key = ?').get(apiKey);
                
                if (user && user.ai_enabled) {
                    const targetSetting = user.ai_target ? user.ai_target.trim() : '';
                    let isTargetMatch = !targetSetting;

                    if (targetSetting) {
                        const targets = targetSetting.split(',').map(t => normalizePhoneNumber(t.trim())).filter(t => t !== '');
                        const myContacts = contactMappings.get(apiKey);

                        // Pre-calculate sender info outside target loop
                        const senderNumbers = normalizePhoneNumber(participant);
                        const groupNumbers = normalizePhoneNumber(remoteJid);
                        const contact = myContacts?.get(participant) || myContacts?.get(remoteJid);
                        const contactIdClean = contact ? normalizePhoneNumber(contact.id) : '';
                        const contactNotifyClean = contact?.notify ? normalizePhoneNumber(contact.notify) : '';

                        isTargetMatch = targets.some(t => {
                            if (remoteJid.includes(t) || participant.includes(t)) return true;
                            if (senderNumbers === t || groupNumbers === t) return true;
                            if (contactIdClean === t || contactNotifyClean === t) return true;
                            return false;
                        });
                    }

                    if (isTargetMatch && text) {
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
        });

    } catch (err) {
        activeSessions.delete(apiKey);
        db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
        if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Disconnected' });
    }
}

async function sendMessageViaWa(apiKey, number, message, msgType = 'text', mediaBase64 = null, fileName = null) {
    const waSocket = activeSessions.get(apiKey);
    if (!waSocket || !waSocket.user) throw new Error('Sistem WhatsApp belum siap/terkoneksi.');
    const waJid = number.includes('@') ? number : formatNumber(number);
    if ((msgType === 'image' || (msgType === 'text' && mediaBase64 && mediaBase64.startsWith('data:image/'))) && mediaBase64) {
        const buffer = Buffer.from(mediaBase64.split(',')[1], 'base64');
        await waSocket.sendMessage(waJid, { image: buffer, caption: message });
    } else if ((msgType === 'document' || (msgType === 'text' && mediaBase64)) && mediaBase64) {
        const buffer = Buffer.from(mediaBase64.split(',')[1], 'base64');
        const mimeType = mediaBase64.split(';')[0].split(':')[1];
        await waSocket.sendMessage(waJid, { document: buffer, mimetype: mimeType, fileName: fileName || 'document.file', caption: message });
    } else {
        await waSocket.sendMessage(waJid, { text: message });
    }
}

function initAllSessions(io) {
    const users = db.prepare('SELECT api_key FROM users').all();
    users.forEach(user => connectToWhatsApp(user.api_key, io));
}

async function disconnectWa(apiKey) {
    const waSocket = activeSessions.get(apiKey);
    if (waSocket) {
        await waSocket.logout();
        activeSessions.delete(apiKey);
        contactMappings.delete(apiKey);
    }
    const sessionDir = path.join(process.env.SESSION_PATH || path.join(__dirname, '../../sessions'), apiKey);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
}

async function fetchGroups(apiKey) {
    const waSocket = activeSessions.get(apiKey);
    if (!waSocket) throw new Error('Device belum terhubung.');
    const groups = await waSocket.groupFetchAllParticipating();
    return Object.values(groups);
}

function logAiActivity(apiKey, type, sender, message) {
    if (global.io) {
        global.io.emit('ai_activity_log', {
            apiKey,
            type,
            sender,
            message,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
        });
    }
}

module.exports = {
    initAllSessions,
    sendMessageViaWa,
    disconnectWa,
    connectToWhatsApp,
    fetchGroups,
    logAiActivity,
    purgeDevice
};