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
 * Calculate delay in milliseconds between now and target time (HH:MM format).
 * Returns negative value if target time is in the past.
 * 
 * @param {string} targetTime - "HH:MM" format (24-hour)
 * @returns {number} delay in milliseconds (negative = past)
 */
function calculateDelay(targetTime) {
  const [hours, minutes] = targetTime.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  return target.getTime() - now.getTime();
}

/**
 * Validate the required fields for scheduling a time-bomb.
 * 
 * @param {Object} params - { token, payload }
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTimebombParams({ token, payload }) {
  if (!token) {
    return { valid: false, error: 'Token otorisasi tidak boleh kosong.' };
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
 * Schedule a time-bomb attendance submission.
 * 
 * @param {Object} params
 * @param {string} params.targetTime - "HH:MM" format (24-hour)
 * @param {string} params.token      - Bearer token for DParagon API
 * @param {string} params.dpUrl      - DParagon API base URL
 * @param {string} params.apiKey     - User's NoorByte API key
 * @param {Object} params.payload    - { latitude, longitude, image }
 * @returns {{ status: boolean, message: string, timer_key?: string }}
 */
function scheduleTimebomb({ targetTime, token, dpUrl, apiKey, payload }) {
  // 1. Validate inputs
  const validation = validateTimebombParams({ token, payload });
  if (!validation.valid) {
    return { status: false, message: validation.error };
  }

  // 2. Check time is in the future
  const delay = calculateDelay(targetTime);
  if (delay <= 0) {
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
      } else {
        console.error(`[TIMEBOMB] ❌ Presence rejected for key=${timerKey}: ${result.message}`);
      }
    } catch (err) {
      console.error(`[TIMEBOMB] ❌ Execution failed for key=${timerKey}:`, err.message);
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

  // First attempt
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const result = await response.json();

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

    const retryResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(retryPayload)
    });

    const retryResult = await retryResponse.json();

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
  scheduleTimebomb,
  cancelTimebomb,
  executeTimebomb,
  timebombRegistry
};
