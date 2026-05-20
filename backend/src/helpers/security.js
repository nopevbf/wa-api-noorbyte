const crypto = require('crypto');
const algorithm = 'aes-256-cbc';

/**
 * Mendapatkan encryption key dari environment variable.
 * Melempar error jika key tidak valid (harus 32 karakter).
 */
function getEncryptionKey() {
    const k = process.env.ENCRYPTION_KEY;
    if (!k || k.length !== 32) {
        throw new Error(`ENCRYPTION_KEY must be exactly 32 characters (32 bytes). Current length: ${k ? k.length : 0}`);
    }
    return Buffer.from(k, 'utf8');
}

// Helper untuk logging yang lebih terstruktur (bisa dikembangkan ke pino nanti)
const logger = {
    error: (msg, meta = {}) => {
        console.error(JSON.stringify({ level: 'error', message: msg, ...meta, timestamp: new Date().toISOString() }));
    }
};

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

function maskSensitiveData(message, secret) {
    if (!message || !secret) return message;
    
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
    try {
        const key = getEncryptionKey();
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
    try {
        const key = getEncryptionKey();
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
