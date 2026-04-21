const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode'); // Library baru buat generate gambar QR
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { handleIncomingPulseMessage } = require('./pulseWatcher');

const activeSessions = new Map();

// 🔴 MAP: Lacak jumlah percobaan reconnect yang GAGAL berturut-turut per device
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Hapus semua jejak device dari sistem + database.
 * Dipanggil saat device sudah melewati batas reconnect.
 */
async function purgeDevice(apiKey, sessionDir, io) {
    console.log(`\n[${apiKey}] 💀 ====================================`);
    console.log(`[${apiKey}] 💀 DEVICE DIHAPUS setelah ${MAX_RECONNECT_ATTEMPTS}x reconnect gagal!`);
    console.log(`[${apiKey}] 💀 ====================================\n`);

    // 1. Hentikan & hapus dari memori
    if (activeSessions.has(apiKey)) {
        const oldSocket = activeSessions.get(apiKey);
        try {
            oldSocket.ev.removeAllListeners();
            oldSocket.ws.close();
        } catch (e) { /* abaikan error saat force-close */ }
        activeSessions.delete(apiKey);
    }

    // 2. Reset counter
    reconnectAttempts.delete(apiKey);

    // 3. Hapus file sesi dari disk
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[${apiKey}] 🗑️  File sesi berhasil dihapus.`);
    }

    // 4. Hapus data dari DATABASE (user + semua automation schedule-nya)
    try {
        db.prepare('DELETE FROM automation_schedules WHERE api_key = ?').run(apiKey);
        db.prepare('DELETE FROM message_logs WHERE api_key = ?').run(apiKey);
        db.prepare('DELETE FROM users WHERE api_key = ?').run(apiKey);
        console.log(`[${apiKey}] 🗑️  Data database berhasil dihapus.`);
    } catch (dbErr) {
        console.error(`[${apiKey}] ❌ Gagal hapus data dari database:`, dbErr);
    }

    // 5. Beritahu frontend via Socket.io
    if (io) {
        io.emit(`status-${apiKey}`, { apiKey, status: 'Purged' });
        io.emit(`device-purged`, { apiKey, reason: `Gagal reconnect ${MAX_RECONNECT_ATTEMPTS} kali berturut-turut.` });
    }
}

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
                activeSessions.delete(apiKey);

                if (shouldReconnect) {
                    // 🔴 STRIKE SYSTEM: Tambah counter setiap kali disconnect
                    const currentAttempts = (reconnectAttempts.get(apiKey) || 0) + 1;
                    reconnectAttempts.set(apiKey, currentAttempts);

                    console.log(`[${apiKey}] ⚠️  Percobaan reconnect ke-${currentAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

                    if (currentAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        // SUDAH 7 KALI GAGAL → PURGE!
                        await purgeDevice(apiKey, sessionDir, io);
                    } else {
                        // 3. COOL DOWN SYSTEM (Mencegah Spam 428)
                        console.log(`[${apiKey}] Menunggu 5 detik sebelum reconnect...`);
                        setTimeout(() => connectToWhatsApp(apiKey, io), 5000);
                    }
                } else {
                    console.log(`[${apiKey}] ❌ DEVICE DI-LOGOUT DARI HP! Menghapus sesi...`);
                    reconnectAttempts.delete(apiKey);
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
                    db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', apiKey);
                }
            } else if (connection === 'open') {
                // ✅ BERHASIL KONEK → Reset counter
                reconnectAttempts.set(apiKey, 0);
                console.log(`[${apiKey}] ✅ Mantap! Berhasil terhubung.`);
                db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Connected', apiKey);
                if (io) io.emit(`status-${apiKey}`, { apiKey, status: 'Connected' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            // Integrasi Pulse Automation (Watcher Mode)
            handleIncomingPulseMessage(apiKey, msg).catch(e => {
                console.error(`[${apiKey}] Pulse Watcher Error:`, e.message);
            });

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