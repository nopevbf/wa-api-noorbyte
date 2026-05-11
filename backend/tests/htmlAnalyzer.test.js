const { analyzeHtmlFile } = require('../src/services/htmlAnalyzer');
const path = require('path');

describe('analyzeHtmlFile', () => {
  it('should parse a valid HTML file correctly', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'ig_test.html');
    const result = await analyzeHtmlFile(fixturePath);
    
    expect(result.hasForm).toBe(true);
    expect(result.title).toBe('Login to Instagram');
    expect(result.hasHome).toBe(true);
    expect(result.hasLogin).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle an empty HTML file properly (Boundary Value)', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'empty.html');
    const result = await analyzeHtmlFile(fixturePath);
    
    expect(result.hasForm).toBe(false);
    expect(result.title).toBe('');
    expect(result.hasHome).toBe(false);
    expect(result.hasLogin).toBe(false);
    expect(result.length).toBe(0);
  });

  it('should throw an error if the file is missing', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'missing.html');
    await expect(analyzeHtmlFile(fixturePath)).rejects.toThrow(/ENOENT/);
  });

  it('should reject path traversal attempts (OWASP)', async () => {
    const maliciousPath = '../../../etc/passwd';
    await expect(analyzeHtmlFile(maliciousPath)).rejects.toThrow('Path Traversal terdeteksi! Akses ditolak.');
  });
});
