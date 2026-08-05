/**
 * timebombService.js — Time-Bomb Scheduling Service
 * 
 * Manages scheduled attendance (Time-Bomb) operations:
 * - Schedule a delayed presence submission to DParagon API
 * - Cancel an active time-bomb
 * - Execute the presence API call with auto-resolve for late_reason
 * 
 * Architecture:
 *   Frontend (checkin.js) → POST /api/attendance/schedule-timebomb
 *     → scheduleTimebomb() → setTimeout → executeTimebomb() → DParagon API
 */
const crypto = require('crypto');

// ==========================================
// CONSTANTS
// ==========================================
const DEFAULT_LATE_REASON = 'Urusan Keluarga';
const PRESENCE_PATH = '/attendance/presence';

// ==========================================
// REGISTRY
// ==========================================
// key = timer_key (string), value = { timerId, targetTime }
const timebombRegistry = new Map();

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * Calculates the delay in milliseconds between the current time and the target time.
 * Deducts a 1-minute buffer specifically for check-in (MASUK) actions to ensure timely execution.
 * 
 * @param {string} targetTime - Time in "HH:MM" format (24-hour)
 * @param {string} action - The action type: "MASUK" or "KELUAR"
 * @returns {number} Delay in milliseconds, or DELAY_EXPIRED (-1) if the target time is in the past.
 */
function calculateDelay(targetTime, action = '') {
  const DELAY_EXPIRED = -1;
  const [hours, minutes] = targetTime.split(':').map(Number);
  
  // Ambil waktu saat ini di zona waktu Jakarta (WIB) untuk menghindari bug zona waktu server (UTC)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  });
  
  // Intl mengembalikan format "24:00:00" untuk jam 00 (tengah malam), jadi kita parse dengan % 24
  const [jktHourStr, jktMinuteStr, jktSecondStr] = formatter.format(new Date()).split(':');
  const jktHour = Number(jktHourStr) % 24;
  const jktMinute = Number(jktMinuteStr);
  const jktSecond = Number(jktSecondStr);
  
  const targetMs = (hours * 3600 + minutes * 60) * 1000;
  const nowMs = (jktHour * 3600 + jktMinute * 60 + jktSecond) * 1000;
  
  const realDelay = targetMs - nowMs;

  // Tolak jika waktu aslinya sudah lewat atau tepat saat ini (0ms)
  if (realDelay <= 0) {
    return DELAY_EXPIRED; 
  }

  let finalDelay = realDelay;

  // Jika MASUK (Check-in), kurangi 1 menit (60000ms) agar dieksekusi sebelum terlambat
  if (action.toUpperCase() === 'MASUK') {
    finalDelay -= 60000;
  }

  // Jika delay negatif setelah dikurangi buffer, jalankan langsung (delay 0)
  return finalDelay < 0 ? 0 : finalDelay;
}

/**
 * Validate the required fields for scheduling a time-bomb.
 * 
 * @param {Object} params - { token, payload, targetTime }
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTimebombParams({ token, payload, targetTime }) {
  if (!token) {
    return { valid: false, error: 'Token otorisasi tidak boleh kosong.' };
  }

  if (targetTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetTime)) {
    return { valid: false, error: 'Format targetTime tidak valid. Gunakan format HH:MM (24-jam).' };
  }

  if (!payload ||
      payload.latitude === undefined || payload.latitude === null ||
      payload.longitude === undefined || payload.longitude === null ||
      !payload.image) {
    return { valid: false, error: 'Payload tidak lengkap. Latitude, longitude, dan image wajib diisi.' };
  }

  return { valid: true };
}

/**
 * Validate dpUrl against SSRF attack vectors.
 * Only allows HTTPS URLs to non-internal hosts with reasonable length.
 *
 * @param {string|null} url
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDpUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'dpUrl wajib diisi.' };
  }

  if (url.length > 512) {
    return { valid: false, error: 'dpUrl terlalu panjang.' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'dpUrl bukan URL yang valid.' };
  }

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'dpUrl harus menggunakan protokol HTTPS.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return { valid: false, error: 'dpUrl tidak boleh mengarah ke localhost (SSRF).' };
  }

  // Block private IP ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  const privateIp = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(hostname);
  if (privateIp) {
    return { valid: false, error: 'dpUrl tidak boleh mengarah ke IP internal (SSRF).' };
  }

  return { valid: true };
}

/**
 * Schedule a time-bomb attendance submission.
 * 
 * @param {Object} params
 * @param {string} params.targetTime - "HH:MM" format (24-hour)
 * @param {string} params.action     - "MASUK" or "KELUAR"
 * @param {string} params.token      - Bearer token for DParagon API
 * @param {string} params.dpUrl      - DParagon API base URL
 * @param {string} params.apiKey     - User's NoorByte API key
 * @param {Object} params.payload    - { latitude, longitude, image }
 * @returns {{ status: boolean, message: string, timer_key?: string }}
 */
function scheduleTimebomb({ targetTime, action, token, dpUrl, apiKey, payload }) {
  // 1. Validate inputs
  const validation = validateTimebombParams({ token, payload, targetTime });
  if (!validation.valid) {
    return { status: false, message: validation.error };
  }

  // 2. Calculate delay
  const delay = calculateDelay(targetTime, action);
  if (delay < 0) {
    return { status: false, message: `Waktu target (${targetTime}) sudah lewat. Pilih waktu di masa depan.` };
  }

  // 3. Generate unique timer key
  const timerKey = crypto.randomBytes(8).toString('hex');

  // 4. Schedule the timer
  const timerId = setTimeout(async () => {
    console.log(`[TIMEBOMB] ⏰ Timer fired for key=${timerKey}, executing presence...`);
    try {
      const result = await executeTimebomb(token, dpUrl, payload);
      if (result.success) {
        console.log(`[TIMEBOMB] ✅ Presence submitted successfully for key=${timerKey}`);
        // Emit socket event to notify frontend if possible
        if (global.io && apiKey) {
          global.io.emit(`timebomb-success-${apiKey}`, {
            timerKey,
            message: result.message || '✅ Presence submitted successfully'
          });
        }
      } else {
        console.error(`[TIMEBOMB] ❌ Presence rejected for key=${timerKey}: ${result.message}`);
        // Emit socket event to notify frontend if possible
        if (global.io && apiKey) {
          global.io.emit(`timebomb-error-${apiKey}`, {
            timerKey,
            message: result.message || '❌ Presence rejected'
          });
        }
      }
    } catch (err) {
      console.error(`[TIMEBOMB] ❌ Execution failed for key=${timerKey}:`, err.message);
      if (global.io && apiKey) {
        global.io.emit(`timebomb-error-${apiKey}`, {
          timerKey,
          message: err.message || '❌ Execution failed'
        });
      }
    } finally {
      timebombRegistry.delete(timerKey);
    }
  }, delay);

  // 5. Store in registry
  timebombRegistry.set(timerKey, { timerId, targetTime });

  const delaySeconds = Math.round(delay / 1000);
  return {
    status: true,
    timer_key: timerKey,
    message: `Timer dijadwalkan untuk ${targetTime}. Delay: ${delaySeconds}s.`
  };
}

/**
 * Cancel an active time-bomb.
 * 
 * @param {string} timerKey - The timer key returned from scheduleTimebomb
 * @returns {{ status: boolean, message: string }}
 */
function cancelTimebomb(timerKey) {
  if (!timerKey || !timebombRegistry.has(timerKey)) {
    return { status: false, message: 'Timer not found. Tidak ada jadwal aktif dengan key tersebut.' };
  }

  const entry = timebombRegistry.get(timerKey);
  clearTimeout(entry.timerId);
  timebombRegistry.delete(timerKey);

  return { status: true, message: `Jadwal absen (${entry.targetTime}) berhasil dibatalkan.` };
}

/**
 * Execute the DParagon presence API call.
 * Includes auto-resolve: if rejected due to missing late_reason, auto-retry with default reason.
 * 
 * @param {string} token   - Bearer token
 * @param {string} dpUrl   - DParagon API base URL (e.g. "https://api.dparagon.com/v2")
 * @param {Object} payload - { latitude, longitude, image, late_reason? }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function executeTimebomb(token, dpUrl, payload) {
  const baseUrl = dpUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}${PRESENCE_PATH}`;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  let response, result;
  try {
    // First attempt
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    result = await response.json();
  } catch (err) {
    return { success: false, message: `Network error: ${err.message}` };
  }

  // Success path
  if (response.ok && result.status !== false) {
    return { success: true, message: result.message || 'Success' };
  }

  // Error analysis: is it a late_reason requirement?
  const errorMsg = typeof result.message === 'string'
    ? result.message
    : JSON.stringify(result.message || '');

  const isLateError = errorMsg.includes('late_reason') || errorMsg.includes('Alasan');

  // Auto-resolve: retry with default late_reason (only if not already sent)
  if (isLateError && !payload.late_reason) {
    console.log(`[TIMEBOMB] Auto-resolving with default late_reason: "${DEFAULT_LATE_REASON}"`);

    const retryPayload = { ...payload, late_reason: DEFAULT_LATE_REASON };

    let retryResponse, retryResult;
    try {
      retryResponse = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(retryPayload)
      });
      retryResult = await retryResponse.json();
    } catch (err) {
      return { success: false, message: `Network error on retry: ${err.message}` };
    }

    if (retryResponse.ok && retryResult.status !== false) {
      return { success: true, message: retryResult.message || 'Success (auto-resolved)' };
    }

    return { success: false, message: retryResult.message || 'Gagal setelah auto-resolve.' };
  }

  // Non-late error → return as-is
  return { success: false, message: errorMsg };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  calculateDelay,
  validateTimebombParams,
  validateDpUrl,
  scheduleTimebomb,
  cancelTimebomb,
  executeTimebomb,
  timebombRegistry
};
