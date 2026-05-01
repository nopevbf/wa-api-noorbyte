const db = require('../config/database');

const checkApiKey = (req, res, next) => {
    // 1. Cek dari Header Authorization (Format: Bearer <token>)
    const authHeader = req.headers?.authorization;
    let apiKey = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
        // Potong tulisan 'Bearer ' dan ambil token-nya aja
        apiKey = authHeader.split(' ')[1]; 
    } 
    // 2. Fallback (Cadangan): Cek dari header x-api-key saja
    // SECURITY: body/query fallback dihapus — jangan biarkan client inject api_key via body/query
    else {
        apiKey = req.headers['x-api-key'];
    }

    // [FIX] Bila tidak ada device sama sekali, izinkan bypass API Key untuk pendaftaran pertama
    // Ini ditaruh sebelum pengecekan !apiKey agar pendaftaran pertama tidak terblokir
    try {
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        if (userCount === 0) {
            req.user = { username: 'Guest', role: 'guest' };
            return next();
        }
    } catch (dbError) {
        console.error("[AUTH] Gagal cek user count:", dbError.message);
    }

    // Kalau bener-bener kosong
    if (!apiKey) {
        return res.status(401).json({ status: false, message: 'API Key tidak ditemukan di header (Format: Bearer <token>).' });
    }

    // Cek ke database apakah API Key valid
    try {
        // [MOD] Support Admin API Key bypass
        if (process.env.ADMIN_API_KEY && apiKey === process.env.ADMIN_API_KEY) {
            req.user = { username: 'Admin', role: 'admin' };
            return next();
        }

        const user = db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey);
        
        if (!user) {
            return res.status(401).json({ status: false, message: 'API Key tidak valid atau tidak terdaftar.' });
        }

        // Kalau lolos, simpan data user ke request buat dipakai ngirim pesan
        req.user = user;
        next(); // Silakan masuk!
    } catch (error) {
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server database.' });
    }
};

module.exports = checkApiKey;