const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode'); // Library baru buat generate gambar QR
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const activeSessions = new Map();

function formatNumber(number) {
    if (number.endsWith('@g.us')) {
        return number;
    }
    let formatted = number.replace(/\D/g, '');
    if (formatted.startsWith('0')) formatted = '62' + formatted.substring(1);
    if (!formatted.endsWith('@s.whatsapp.net')) formatted += '@s.whatsapp.net';
    return formatted;
}

// Tambahan parameter 'io' (Socket.io)
async function connectToWhatsApp(apiKey, io) {
    try {
        // 1. PEMUSNAH GLADIATOR YANG BENAR
        if (activeSessions.has(apiKey)) {
            console.log(`[${apiKey}] ⚠️ Sesi lama terdeteksi! Mematikan sesi lama agar tidak bentrok...`);
            const oldSocket = activeSessions.get(apiKey);
            try {
                // MUTE socket lama biar gak tereak-tereak minta reconnect pas dibunuh
                oldSocket.ev.removeAllListeners();
                oldSocket.ws.close();
            } catch (e) { }
            activeSessions.delete(apiKey); // Bersihkan dari memori
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

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // --- REALTIME QR CODE ---
            if (qr) {
                // Jangan print log panjang-panjang, ganti jadi log titik aja biar tahu dia masih hidup
                process.stdout.write('🔄 ');

                // Optimasi DB: Biar DB nggak digempur UPDATE tiap 20 detik, kita update diam-diam aja
                db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);

                try {
                    const qrImageUrl = await QRCode.toDataURL(qr);
                    if (io) io.emit(`qr-${apiKey}`, { apiKey, qrImageUrl });
                } catch (err) {
                    console.error(`\n[${apiKey}] Gagal generate gambar QR`, err);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
                const shouldReconnect = !isLoggedOut;

                console.log(`[${apiKey}] Koneksi terputus (Status: ${statusCode}). Reconnect: ${shouldReconnect}`);
                if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Disconnected' });

                // 2. BERSIHKAN MEMORI SAAT PUTUS
                // Biar pas reconnect gak dianggap "Sesi lama terdeteksi"
                activeSessions.delete(apiKey);

                if (shouldReconnect) {
                    // 3. COOL DOWN SYSTEM (Mencegah Spam 428)
                    // Kasih jeda 5 detik biar server WA gak ngira kita kena DDOS/Spam
                    console.log(`[${apiKey}] Menunggu 5 detik sebelum reconnect...`);
                    setTimeout(() => connectToWhatsApp(apiKey, io), 5000);
                } else {
                    console.log(`[${apiKey}] ❌ DEVICE DI-LOGOUT DARI HP! Menghapus sesi...`);
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
                    db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
                }
            } else if (connection === 'open') {
                console.log(`[${apiKey}] ✅ Mantap! Berhasil terhubung.`);
                db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Connected', apiKey);
                if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Connected' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const sender = msg.key.remoteJid.replace('@s.whatsapp.net', '');
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const user = db.prepare('SELECT webhook_url FROM users WHERE api_key = ?').get(apiKey);

            if (user && user.webhook_url) {
                try {
                    await axios.post(user.webhook_url, { api_key: apiKey, sender, message: text });
                } catch (error) {
                    console.error(`[${apiKey}] Webhook nolak kiriman.`);
                }
            }
        });

    } catch (err) {
        console.error(`[${apiKey}] Fatal error saat connectToWhatsApp:`, err);
        activeSessions.delete(apiKey);
        db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
        if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Disconnected' });
    }
}

function initAllSessions(io) {
    const users = db.prepare('SELECT api_key FROM users').all();
    // Kirim parameter 'io' ke fungsi connect
    users.forEach(user => connectToWhatsApp(user.api_key, io));
}

async function sendMessageViaWa(apiKey, number, message, msgType = 'text', mediaBase64 = null, fileName = null) {
    const waSocket = activeSessions.get(apiKey);
    if (!waSocket || !waSocket.user) throw new Error('Sistem WhatsApp belum siap/terkoneksi.');

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
    const sessionBaseDir = process.env.SESSION_PATH || path.join(__dirname, '../../sessions');
    const sessionDir = path.join(sessionBaseDir, apiKey);
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