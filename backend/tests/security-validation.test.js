const { validateEncryptionKey, DecryptionError } = require('../src/helpers/security');

describe('Security Validation', () => {
  it('should throw error if ENCRYPTION_KEY is not 32 characters', () => {
    expect(() => validateEncryptionKey('short')).toThrow(/must be exactly 32 characters/);
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

  it('should throw key length error when decrypting with an invalid key length', () => {
    const originalEnv = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'short-key';
    const { decrypt } = require('../src/helpers/security');
    
    try {
      expect(() => decrypt('any:data')).toThrow(/must be exactly 32 characters/);
    } finally {
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
        const { decrypt, DecryptionError } = require('../src/helpers/security');
        
        try {
            decrypt(encryptedText);
            fail('Should have thrown DecryptionError');
        } catch (e) {
            expect(e).toBeInstanceOf(DecryptionError);
            expect(e.message).toMatch(/Decryption failed/i);
        }
    });

    process.env.ENCRYPTION_KEY = originalEnv;
  });

  it('should throw error for corrupted IV or non-hex format', () => {
    const originalEnv = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    
    let decrypt;
    jest.isolateModules(() => {
      const security = require('../src/helpers/security');
      decrypt = security.decrypt;
    });

    try {
      // Invalid format (no colon)
      expect(() => decrypt('not-hex-format')).toThrow(/Invalid encrypted text format/);
      
      // Corrupted IV (not valid hex)
      expect(() => decrypt('zzzz:1234')).toThrow();
      
      // Non-hex encrypted data
      expect(() => decrypt('abcd:zzzz')).toThrow();
    } finally {
      process.env.ENCRYPTION_KEY = originalEnv;
    }
  });
});

describe('maskSensitiveData', () => {
  const { maskSensitiveData } = require('../src/helpers/security');

  it('should mask the secret string in a message', () => {
    const secret = 'sk-123456';
    const message = `Error: unauthorized for key ${secret}`;
    expect(maskSensitiveData(message, secret)).toBe('Error: unauthorized for key ***');
  });

  it('should handle special regex characters in secret', () => {
    const secret = 'secret+key*';
    const message = `Found ${secret} in logs`;
    expect(maskSensitiveData(message, secret)).toBe('Found *** in logs');
  });

  it('should return original message if secret is null/empty', () => {
    expect(maskSensitiveData('hello', null)).toBe('hello');
    expect(maskSensitiveData('hello', '')).toBe('hello');
  });

  it('should not mask short secrets (1-3 characters)', () => {
    expect(maskSensitiveData('Log id 12', '12')).toBe('Log id 12');
    expect(maskSensitiveData('Key abc error', 'abc')).toBe('Key abc error');
  });
});
