const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'utf8');

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
    console.error("❌ FATAL: " + e.message);
    // Di produksi, kita ingin app berhenti jika key tidak aman
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

const maliciousPattern = /[;<>&|`\\]/g;

function isMaliciousString(input) {
  if (typeof input !== 'string') return false;
  return maliciousPattern.test(input);
}

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        if (textParts.length < 2) return null;
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        console.error("❌ Decryption failed. Key might have changed or data is corrupted:", e.message);
        return "[DECRYPTION_FAILED]";
    }
}


module.exports = { 
    isMaliciousString,
    maliciousPattern,
    encrypt, 
    decrypt,
    validateEncryptionKey
};
