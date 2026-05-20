const crypto = require('crypto');
const algorithm = 'aes-256-cbc';

let cachedKey = null;
let lastUsedRawKey = null;

/**
 * Mendapatkan encryption key dari environment variable.
 * Melempar error jika key tidak valid (harus 32 karakter).
 * Menggunakan caching untuk performa.
 */
function getEncryptionKey() {
    const k = process.env.ENCRYPTION_KEY;
    
    // Jika key di env berubah (misal saat testing), reset cache
    if (k !== lastUsedRawKey) {
        cachedKey = null;
        lastUsedRawKey = k;
    }

    if (cachedKey) return cachedKey;

    if (!k || k.length !== 32) {
        throw new Error(`ENCRYPTION_KEY must be exactly 32 characters (32 bytes). Current length: ${k ? k.length : 0}`);
    }
    cachedKey = Buffer.from(k, 'utf8');
    return cachedKey;
}

// Helper untuk logging yang lebih terstruktur (bisa dikembangkan ke pino nanti)
const logger = {
    error: (msg, meta = {}) => {
        console.error(JSON.stringify({ level: 'error', message: msg, ...meta, timestamp: new Date().toISOString() }));
    }
};

/**
 * Validasi encryption key.
 * @param {string} k - Key yang akan divalidasi (default dari ENV)
 */
function validateEncryptionKey(k = process.env.ENCRYPTION_KEY) {
    const keyToValidate = k || '';
    if (keyToValidate.length !== 32) {
        throw new Error("ENCRYPTION_KEY must be exactly 32 characters (32 bytes). Current length: " + keyToValidate.length);
    }
}

// Validasi saat startup
try {
    validateEncryptionKey();
} catch (e) {
    logger.error("FATAL: Security initialization failed", { error: e.message });
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

class DecryptionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DecryptionError';
    }
}

const maliciousPattern = /[;<>&|`\\]/g;

function isMaliciousString(input) {
  if (typeof input !== 'string') return false;
  return maliciousPattern.test(input);
}

/**
 * Menyembunyikan data sensitif (seperti API Key) dari sebuah pesan/string.
 * 
 * Logic:
 * 1. Melakukan escaping pada karakter khusus regex yang ada di 'secret' agar tidak salah diinterpretasikan.
 * 2. Membuat dynamic RegExp dengan flag 'g' (global) untuk mencari semua kemunculan.
 * 3. Mengganti semua kemunculan secret tersebut dengan '***'.
 * 
 * @param {string|object} message - Pesan yang akan di-mask (bisa string atau object/JSON)
 * @param {string} secret - String sensitif (API Key, password, dll) yang ingin disembunyikan
 * @returns {string} - Pesan yang sudah di-mask
 */
function maskSensitiveData(message, secret) {
    if (!message || !secret || typeof secret !== 'string' || secret.length <= 3) return message;
    
    let stringMessage = message;
    
    if (typeof message !== 'string') {
        try {
            stringMessage = JSON.stringify(message);
        } catch (e) {
            stringMessage = String(message);
        }
    }

    // Escape regex special characters in secret
    const escapedSecret = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedSecret, 'g');
    return stringMessage.replace(regex, '***');
}

function encrypt(text) {
    if (!text) return null;
    
    const key = getEncryptionKey(); // Panggil di luar try-catch agar error key length tidak dibungkus

    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) {
        logger.error("Encryption failed", { error: e.message });
        throw e;
    }
}

function decrypt(text) {
    if (!text) return null;

    const key = getEncryptionKey(); // Panggil di luar try-catch agar error key length tidak dibungkus

    try {
        const textParts = text.split(':');
        if (textParts.length < 2) {
            throw new DecryptionError("Invalid encrypted text format (missing IV or data).");
        }
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        const errorMsg = e instanceof DecryptionError 
            ? e.message 
            : `Decryption failed. Key might have changed or data is corrupted: ${e.message}`;
        logger.error("Decryption failed", { error: errorMsg });
        throw new DecryptionError(errorMsg);
    }
}

module.exports = { 
    isMaliciousString,
    maliciousPattern,
    encrypt, 
    decrypt,
    validateEncryptionKey,
    maskSensitiveData,
    DecryptionError
};
