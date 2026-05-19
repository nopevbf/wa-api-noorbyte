/**
 * timebombSecurity.test.js — RED phase tests for security & BVA gaps
 * 
 * Covers:
 * 1. validateDpUrl — SSRF prevention untuk dpUrl
 * 2. BVA edge cases untuk scheduleTimebomb (boundary waktu)
 * 3. Malformed dpUrl edge cases untuk executeTimebomb
 */
const {
  scheduleTimebomb,
  executeTimebomb,
  validateDpUrl,
  timebombRegistry
} = require('../src/services/timebombService');

global.fetch = jest.fn();

beforeEach(() => {
  timebombRegistry.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup semua timer aktif — cegah async leak
  for (const [, data] of timebombRegistry.entries()) {
    clearTimeout(data.timerId);
  }
  timebombRegistry.clear();
});

// ==========================================
// 1. validateDpUrl() — SSRF Prevention
// ==========================================
describe('validateDpUrl', () => {
  it('should accept a valid HTTPS dparagon URL', () => {
    const result = validateDpUrl('https://api.dparagon.com/v2');
    expect(result.valid).toBe(true);
  });

  it('should reject internal IP addresses (SSRF)', () => {
    expect(validateDpUrl('http://192.168.1.1/api').valid).toBe(false);
    expect(validateDpUrl('http://10.0.0.1/presence').valid).toBe(false);
    expect(validateDpUrl('http://172.16.0.1/attack').valid).toBe(false);
  });

  it('should reject localhost (SSRF)', () => {
    expect(validateDpUrl('http://localhost:3000/api').valid).toBe(false);
    expect(validateDpUrl('http://127.0.0.1/presence').valid).toBe(false);
    expect(validateDpUrl('http://[::1]/presence').valid).toBe(false);
  });

  it('should reject non-HTTPS URLs', () => {
    expect(validateDpUrl('http://api.dparagon.com/v2').valid).toBe(false);
    expect(validateDpUrl('ftp://api.dparagon.com/v2').valid).toBe(false);
  });

  it('should reject malformed or empty URL', () => {
    expect(validateDpUrl('').valid).toBe(false);
    expect(validateDpUrl('not-a-url').valid).toBe(false);
    expect(validateDpUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateDpUrl(null).valid).toBe(false);
  });

  it('should reject URL longer than 512 chars', () => {
    const longUrl = 'https://api.dparagon.com/' + 'a'.repeat(500);
    expect(validateDpUrl(longUrl).valid).toBe(false);
  });
});

// ==========================================
// 2. BVA — Boundary Value Analysis
// ==========================================
describe('scheduleTimebomb — BVA edge cases', () => {
  it('should reject when delay is exactly 0ms (right now)', () => {
    // Arrange: waktu persis sekarang
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    const result = scheduleTimebomb({
      targetTime: `${hh}:${mm}`,
      token: 'tok',
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'k',
      payload: { latitude: -7, longitude: 110, image: 'img' }
    });

    expect(result.status).toBe(false);
    expect(result.message).toMatch(/sudah lewat|past/i);
  });

  it('should reject when targetTime is 1 minute in the past (BVA -1)', () => {
    const now = new Date();
    let m = now.getMinutes() - 1;
    let h = now.getHours();
    if (m < 0) { m = 59; h = h - 1; }
    if (h < 0) h = 23;
    const targetTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const result = scheduleTimebomb({
      targetTime,
      token: 'tok',
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'k',
      payload: { latitude: -7, longitude: 110, image: 'img' }
    });

    expect(result.status).toBe(false);
  });

  it('should accept when targetTime is 1 minute in the future (BVA +1)', () => {
    jest.useFakeTimers();
    const now = new Date();
    let m = now.getMinutes() + 1;
    let h = now.getHours();
    if (m >= 60) { m = m - 60; h = h + 1; }
    const targetTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const result = scheduleTimebomb({
      targetTime,
      token: 'tok',
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'k',
      payload: { latitude: -7, longitude: 110, image: 'img' }
    });

    expect(result.status).toBe(true);
    expect(result.timer_key).toBeDefined();

    // Cleanup sebelum restoreAllMocks
    clearTimeout(timebombRegistry.get(result.timer_key)?.timerId);
    timebombRegistry.delete(result.timer_key);
    jest.useRealTimers();
  });
});

// ==========================================
// 3. executeTimebomb — Malformed dpUrl
// ==========================================
describe('executeTimebomb — malformed dpUrl', () => {
  it('should throw or return failure for completely invalid dpUrl', async () => {
    // Arrange: fetch akan throw karena URL tidak valid
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await executeTimebomb('token', 'not-a-valid-url', {
      latitude: -7, longitude: 110, image: 'img'
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });
});
