const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode'); // Library baru buat generate gambar QR
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const activeSessions = new Map();

function formatNumber(number) {
    let formatted = number.replace(/\D/g, '');
    if (formatted.startsWith('0')) formatted = '62' + formatted.substring(1);
    if (!formatted.endsWith('@s.whatsapp.net')) formatted += '@s.whatsapp.net';
    return formatted;
}

// Tambahan parameter 'io' (Socket.io)
async function connectToWhatsApp(apiKey, io) {
    const sessionDir = path.join(__dirname, '../../sessions', apiKey);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[${apiKey}] Memulai koneksi WA...`);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' })
    });

    activeSessions.set(apiKey, sock);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // --- REALTIME QR CODE ---
        if (qr) {
            console.log(`[${apiKey}] QR Code baru terdeteksi.`);
            try {
                // Ubah string QR jadi gambar base64
                const qrImageUrl = await QRCode.toDataURL(qr);
                
                // Tembak data gambar ke browser spesifik berdasarkan API Key
                if (io) {
                    io.emit(`qr-${apiKey}`, { apiKey, qrImageUrl });
                }
            } catch (err) {
                console.error('Gagal generate gambar QR', err);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${apiKey}] Koneksi terputus. Reconnect: ${shouldReconnect}`);

            // Kabari browser kalau koneksi putus
            if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Disconnected' });

            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(apiKey, io), 2000);
            } else {
                console.log(`[${apiKey}] Logged out. Menghapus sesi...`);
                activeSessions.delete(apiKey);
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
                db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
            }
        } else if (connection === 'open') {
            console.log(`[${apiKey}] Mantap! Berhasil terhubung.`);
            
            // --- REALTIME NOTIFIKASI SUKSES ---
            db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Connected', apiKey);
            
            // Kabari browser kalau koneksi sukses secara instan
            if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Connected' });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // messages.upsert / Webhook tetap sama...
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const sender = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const user = db.prepare('SELECT webhook_url FROM users WHERE api_key = ?').get(apiKey);
        if (user && user.webhook_url) {
            try {
                await axios.post(user.webhook_url, { api_key: apiKey, sender, message: text });
            } catch (error) { console.error(`[${apiKey}] Webhook error`); }
        }
    });
}

function initAllSessions(io) {
    const users = db.prepare('SELECT api_key FROM users').all();
    // Kirim parameter 'io' ke fungsi connect
    users.forEach(user => connectToWhatsApp(user.api_key, io));
}

async function sendMessageViaWa(apiKey, number, message, msgType = 'text', mediaBase64 = null, fileName = null) {
    const waSocket = activeSessions.get(apiKey);
    if (!waSocket) throw new Error('Sistem WhatsApp belum siap/terkoneksi.');

    const waNumber = formatNumber(number);

    // Jika tipenya Gambar
    if ((msgType === 'image' || (msgType === 'text' && mediaBase64 && mediaBase64.startsWith('data:image/'))) && mediaBase64) {
        // Ekstrak data base64 (membuang awalan "data:image/png;base64,")
        const buffer = Buffer.from(mediaBase64.split(',')[1], 'base64');
        await waSocket.sendMessage(waNumber, { 
            image: buffer, 
            caption: message // Message jadi caption di bawah gambar
        });
    } 
    // Jika tipenya Dokumen (PDF, Excel, dll)
    else if ((msgType === 'document' || (msgType === 'text' && mediaBase64)) && mediaBase64) {
        const buffer = Buffer.from(mediaBase64.split(',')[1], 'base64');
        const mimeType = mediaBase64.split(';')[0].split(':')[1]; // Ambil mimetype otomatis
        
        await waSocket.sendMessage(waNumber, { 
            document: buffer, 
            mimetype: mimeType, 
            fileName: fileName || 'document.file', 
            caption: message 
        });
    } 
    // Jika tipe Text atau Template (Baileys modern fallback text untuk template non-resmi)
    else {
        await waSocket.sendMessage(waNumber, { text: message });
    }
}

async function disconnectWa(apiKey) {
    const waSocket = activeSessions.get(apiKey);
    if (waSocket) {
        await waSocket.logout();
        activeSessions.delete(apiKey);
    }
    const sessionDir = path.join(__dirname, '../../sessions', apiKey);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
}
// FUNGSI BARU: Mengambil daftar grup WA
async function fetchGroups(apiKey) {
    const waSocket = activeSessions.get(apiKey);
    if (!waSocket) {
        throw new Error('Device belum terhubung atau mesin WA belum siap.');
    }
    
    // Baileys punya fungsi bawaan untuk narik semua grup yang diikuti user
    const groups = await waSocket.groupFetchAllParticipating();
    
    // Baileys mengembalikan format Object, kita ubah jadi Array biar gampang dilooping di Frontend
    return Object.values(groups); 
}

module.exports = { 
    initAllSessions, 
    sendMessageViaWa, 
    disconnectWa, 
    connectToWhatsApp, // <-- Ini nama yang bener (pengganti startSessionForApiKey)
    fetchGroups        // <-- Fungsi baru buat narik grup
};