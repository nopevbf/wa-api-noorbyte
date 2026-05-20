const { validateEncryptionKey } = require('../src/helpers/security');

describe('Security Validation', () => {
  it('should throw error if ENCRYPTION_KEY is not 32 characters', () => {
    expect(() => validateEncryptionKey('short')).toThrow('ENCRYPTION_KEY must be exactly 32 characters');
  });
  
  it('should not throw if ENCRYPTION_KEY is 32 characters', () => {
    expect(() => validateEncryptionKey('0123456789abcdef0123456789abcdef')).not.toThrow();
  });

  it('should throw error if ENCRYPTION_KEY is missing (undefined)', () => {
    // Save original env
    const originalEnv = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    
    try {
      expect(() => validateEncryptionKey()).toThrow(/must be exactly 32 characters/);
    } finally {
      // Restore original env
      process.env.ENCRYPTION_KEY = originalEnv;
    }
  });

  it('should throw error when decrypting with a different key', () => {
    const originalEnv = process.env.ENCRYPTION_KEY;
    
    let encryptedText;
    
    // 1. Encrypt with Key A
    jest.isolateModules(() => {
        process.env.ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const { encrypt } = require('../src/helpers/security');
        encryptedText = encrypt('top-secret');
    });

    // 2. Try decrypt with Key B
    jest.isolateModules(() => {
        process.env.ENCRYPTION_KEY = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
        const { decrypt } = require('../src/helpers/security');
        
        // Decrypting with wrong key in AES-CBC should now return [DECRYPTION_FAILED]
        expect(decrypt(encryptedText)).toBe('[DECRYPTION_FAILED]');
    });

    process.env.ENCRYPTION_KEY = originalEnv;
  });
});
