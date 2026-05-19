/**
 * timebomb.test.js — TDD Tests for Time-Bomb Service
 * 
 * Tests the scheduling, cancellation, delay calculation,
 * and execution logic for the Time-Bomb attendance feature.
 */
const {
  calculateDelay,
  scheduleTimebomb,
  cancelTimebomb,
  executeTimebomb,
  timebombRegistry
} = require('../src/services/timebombService');

// Mock global fetch for executeTimebomb tests
global.fetch = jest.fn();

beforeEach(() => {
  // Clear registry and mocks before each test
  timebombRegistry.clear();
  jest.clearAllMocks();
  jest.useRealTimers();
});

// ==========================================
// 1. calculateDelay()
// ==========================================
describe('calculateDelay', () => {
  it('should return positive delay for future time', () => {
    // Arrange: target 30 menit dari sekarang
    const now = new Date();
    const futureHour = now.getHours();
    const futureMinute = now.getMinutes() + 30;
    const hh = String(futureHour).padStart(2, '0');
    const mm = String(futureMinute % 60).padStart(2, '0');
    // Jika menit overflow, tambah jam
    const adjustedHH = futureMinute >= 60 ? String(futureHour + 1).padStart(2, '0') : hh;
    const targetTime = `${adjustedHH}:${mm}`;

    // Act
    const delay = calculateDelay(targetTime);

    // Assert: delay harus sekitar 30 menit (± 2 detik toleransi)
    expect(delay).toBeGreaterThan(29 * 60 * 1000 - 2000);
    expect(delay).toBeLessThanOrEqual(30 * 60 * 1000 + 2000);
  });

  it('should return negative or zero for past time today', () => {
    // Arrange: target 1 jam yang lalu
    const now = new Date();
    let pastHour = now.getHours() - 1;
    if (pastHour < 0) pastHour = 0; // Edge: jika jam 0, skip
    const mm = String(now.getMinutes()).padStart(2, '0');
    const targetTime = `${String(pastHour).padStart(2, '0')}:${mm}`;

    // Act
    const delay = calculateDelay(targetTime);

    // Assert: delay negatif atau nol (waktu sudah lewat)
    expect(delay).toBeLessThanOrEqual(0);
  });

  it('should handle edge case "00:00" correctly', () => {
    const delay = calculateDelay('00:00');
    // 00:00 hari ini pasti sudah lewat kecuali tepat jam 00:00
    expect(typeof delay).toBe('number');
    expect(Number.isFinite(delay)).toBe(true);
  });
});

// ==========================================
// 2. scheduleTimebomb()
// ==========================================
describe('scheduleTimebomb', () => {
  afterEach(() => {
    // Bersihkan semua timer aktif agar tidak leak
    for (const [key, data] of timebombRegistry.entries()) {
      clearTimeout(data.timerId);
    }
    timebombRegistry.clear();
  });

  it('should schedule a timer and return timer_key for valid future time', () => {
    // Arrange
    jest.useFakeTimers();
    const now = new Date();
    const futureMinute = now.getMinutes() + 10;
    const hh = String(now.getHours() + (futureMinute >= 60 ? 1 : 0)).padStart(2, '0');
    const mm = String(futureMinute % 60).padStart(2, '0');

    const params = {
      targetTime: `${hh}:${mm}`,
      token: 'test-bearer-token',
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'test-api-key-001',
      payload: { latitude: -7.75, longitude: 110.41, image: 'base64img' }
    };

    // Act
    const result = scheduleTimebomb(params);

    // Assert
    expect(result.status).toBe(true);
    expect(result.timer_key).toBeDefined();
    expect(typeof result.timer_key).toBe('string');
    expect(result.timer_key.length).toBeGreaterThan(0);
    expect(timebombRegistry.has(result.timer_key)).toBe(true);
  });

  it('should reject when targetTime is in the past', () => {
    // Arrange: 1 jam yang lalu
    const now = new Date();
    let pastHour = now.getHours() - 1;
    if (pastHour < 0) pastHour = 23; // wrap around
    const mm = String(now.getMinutes()).padStart(2, '0');

    const params = {
      targetTime: `${String(pastHour).padStart(2, '0')}:${mm}`,
      token: 'test-token',
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'key-001',
      payload: { latitude: -7.75, longitude: 110.41, image: 'img' }
    };

    // Act
    const result = scheduleTimebomb(params);

    // Assert
    expect(result.status).toBe(false);
    expect(result.message).toBeDefined();
  });

  it('should reject when payload is incomplete (missing latitude)', () => {
    const now = new Date();
    const futureMinute = now.getMinutes() + 10;
    const hh = String(now.getHours() + (futureMinute >= 60 ? 1 : 0)).padStart(2, '0');
    const mm = String(futureMinute % 60).padStart(2, '0');

    const params = {
      targetTime: `${hh}:${mm}`,
      token: 'test-token',
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'key-002',
      payload: { longitude: 110.41, image: 'img' } // missing latitude!
    };

    // Act
    const result = scheduleTimebomb(params);

    // Assert
    expect(result.status).toBe(false);
    expect(result.message).toMatch(/payload|latitude/i);
  });

  it('should reject when token is missing', () => {
    const now = new Date();
    const futureMinute = now.getMinutes() + 10;
    const hh = String(now.getHours() + (futureMinute >= 60 ? 1 : 0)).padStart(2, '0');
    const mm = String(futureMinute % 60).padStart(2, '0');

    const params = {
      targetTime: `${hh}:${mm}`,
      token: '', // empty!
      dpUrl: 'https://api.dparagon.com/v2',
      apiKey: 'key-003',
      payload: { latitude: -7.75, longitude: 110.41, image: 'img' }
    };

    const result = scheduleTimebomb(params);
    expect(result.status).toBe(false);
    expect(result.message).toMatch(/token/i);
  });
});

// ==========================================
// 3. cancelTimebomb()
// ==========================================
describe('cancelTimebomb', () => {
  it('should cancel an active timebomb and return success', () => {
    // Arrange: Daftarkan timer palsu
    jest.useFakeTimers();
    const timerKey = 'fake-timer-key-abc';
    const timerId = setTimeout(() => {}, 999999);
    timebombRegistry.set(timerKey, { timerId, targetTime: '08:00' });

    // Act
    const result = cancelTimebomb(timerKey);

    // Assert
    expect(result.status).toBe(true);
    expect(timebombRegistry.has(timerKey)).toBe(false);
  });

  it('should return not found for non-existent timer key', () => {
    const result = cancelTimebomb('non-existent-key-xyz');
    expect(result.status).toBe(false);
    expect(result.message).toMatch(/not found|tidak ditemukan/i);
  });

  it('should return not found for empty timer key', () => {
    const result = cancelTimebomb('');
    expect(result.status).toBe(false);
  });
});

// ==========================================
// 4. executeTimebomb()
// ==========================================
describe('executeTimebomb', () => {
  it('should fire presence API with correct payload on success', async () => {
    // Arrange
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, message: 'Success' })
    });

    const token = 'bearer-token-123';
    const dpUrl = 'https://api.dparagon.com/v2';
    const payload = { latitude: -7.75, longitude: 110.41, image: 'base64img' };

    // Act
    const result = await executeTimebomb(token, dpUrl, payload);

    // Assert
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.dparagon.com/v2/attendance/presence',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(payload)
      })
    );
    expect(result.success).toBe(true);
  });

  it('should auto-resolve with late_reason when server demands it', async () => {
    // Arrange: first call rejected with late_reason error, second call succeeds
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ status: false, message: 'late_reason required' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: true, message: 'Success' })
      });

    const token = 'bearer-token-456';
    const dpUrl = 'https://api.dparagon.com/v2';
    const payload = { latitude: -7.75, longitude: 110.41, image: 'img' };

    // Act
    const result = await executeTimebomb(token, dpUrl, payload);

    // Assert: should have called fetch twice (retry with late_reason)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Second call should include late_reason in payload
    const secondCallBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(secondCallBody.late_reason).toBeDefined();
    expect(secondCallBody.late_reason.length).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  it('should return failure when API rejects for non-late_reason error', async () => {
    // Arrange
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ status: false, message: 'Fake GPS detected' })
    });

    const token = 'bearer-789';
    const dpUrl = 'https://api.dparagon.com/v2';
    const payload = { latitude: -7.75, longitude: 110.41, image: 'img' };

    // Act
    const result = await executeTimebomb(token, dpUrl, payload);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Fake GPS/i);
    expect(global.fetch).toHaveBeenCalledTimes(1); // No retry
  });
});
