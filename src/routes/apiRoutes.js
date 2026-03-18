const express = require('express');
const router = express.Router();
const db = require('../config/database');
const checkApiKey = require('../middlewares/auth');
const { sendMessageViaWa, disconnectWa, connectToWhatsApp} = require('../services/waEngine'); // Import disconnectWa
const crypto = require('crypto');

router.get('/get-devices', (req, res) => {
    try {
        const devices = db.prepare('SELECT username, phone, api_key, status FROM users').all();
        res.status(200).json({ status: true, data: devices });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Gagal mengambil data device.' });
    }
});

router.post('/add-device', (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ status: false, message: 'Nama dan Nomor WA wajib diisi.' });

    const token = 'DEV-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    try {
        db.prepare('INSERT INTO users (username, phone, api_key, status) VALUES (?, ?, ?, ?)').run(name, phone, token, 'Disconnected');
        res.status(200).json({ status: true, message: 'Device berhasil ditambahkan!', token: token });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Gagal menambah device.', error: error.message });
    }
});

// ENDPOINT BARU: Putus Koneksi Device
router.post('/disconnect-device', async (req, res) => {
    const { api_key } = req.body;
    if (!api_key) return res.status(400).json({ status: false, message: 'API Key wajib dikirim.' });

    try {
        // Matikan mesin WA untuk sesi ini
        await disconnectWa(api_key);
        
        // Update status di database
        db.prepare('UPDATE users SET status = ? WHERE api_key = ?').run('Disconnected', api_key);
        
        res.status(200).json({ status: true, message: 'Device berhasil diputus (Logged Out).' });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Gagal memutus device.', error: error.message });
    }
});

// Jangan lupa tambahin connectToWhatsApp di baris import paling atas (sekitar baris 5)
// const { sendMessageViaWa, disconnectWa, connectToWhatsApp } = require('../services/waEngine');

// ENDPOINT BARU: Menyalakan mesin WA dan generate QR
router.post('/connect-device', async (req, res) => {
    const { api_key } = req.body;
    if (!api_key) return res.status(400).json({ status: false, message: 'API Key wajib dikirim.' });

    try {
        // Panggil fungsi connect WA, dan oper global.io agar QR bisa dikirim realtime
        connectToWhatsApp(api_key, global.io); 
        res.status(200).json({ status: true, message: 'Mesin WA dinyalakan. Menunggu QR...' });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Gagal memulai koneksi.', error: error.message });
    }
});

// ENDPOINT BARU: Hapus Device Permanen
router.post('/delete-device', async (req, res) => {
    const { api_key } = req.body;
    if (!api_key) return res.status(400).json({ status: false, message: 'API Key wajib dikirim.' });

    try {
        // 1. Matikan mesin WA dan hapus folder sesi secara permanen
        await disconnectWa(api_key);
        
        // 2. Hapus data device dari tabel users
        db.prepare('DELETE FROM users WHERE api_key = ?').run(api_key);
        
        // Opsional: Hapus riwayat pesan terkait biar database nggak bengkak
        db.prepare('DELETE FROM message_logs WHERE api_key = ?').run(api_key);
        
        res.status(200).json({ status: true, message: 'Device berhasil dihapus permanen.' });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Gagal menghapus device.', error: error.message });
    }
});

router.post('/send-message', checkApiKey, async (req, res) => {
    const { number, message } = req.body;
    const apiKey = req.user.api_key;
    
    if (!number || !message) return res.status(400).json({ status: false, message: 'Parameter tidak lengkap.' });

    try {
        await sendMessageViaWa(apiKey, number, message);
        db.prepare('INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)').run(apiKey, number, message, 'SUCCESS');
        res.status(200).json({ status: true, message: `Pesan terkirim via ${apiKey}!` });
    } catch (error) {
        db.prepare('INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)').run(apiKey, number, message, 'FAILED');
        res.status(500).json({ status: false, message: error.message || 'Gagal mengirim pesan.' });
    }
});

module.exports = router;