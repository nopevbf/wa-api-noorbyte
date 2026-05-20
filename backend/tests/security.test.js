const { encrypt, decrypt } = require('../src/helpers/security');
// Ensure process.env.ENCRYPTION_KEY is set for tests if not loaded from .env
process.env.ENCRYPTION_KEY = 'f3e1c9b2d5a8e7f6g5h4i3j2k1l0m9n8';

describe('Security Helper', () => {
    test('should encrypt and decrypt text correctly', () => {
        const secret = 'sk-1234567890';
        const encrypted = encrypt(secret);
        expect(encrypted).not.toBe(secret);
        expect(decrypt(encrypted)).toBe(secret);
    });

    test('should return null for empty input', () => {
        expect(encrypt(null)).toBeNull();
        expect(decrypt(null)).toBeNull();
    });
});
