const { validateEncryptionKey } = require('../src/helpers/security');

describe('Security Validation', () => {
  it('should throw error if ENCRYPTION_KEY is not 32 characters', () => {
    expect(() => validateEncryptionKey('short')).toThrow('ENCRYPTION_KEY must be exactly 32 characters');
  });
  
  it('should not throw if ENCRYPTION_KEY is 32 characters', () => {
    expect(() => validateEncryptionKey('0123456789abcdef0123456789abcdef')).not.toThrow();
  });
});
