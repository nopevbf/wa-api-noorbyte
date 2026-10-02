/**
 * qstashService.js — Serverless QStash Scheduler & Firestore Persistence
 * 
 * Bertanggung jawab untuk:
 * 1. Kalkulasi timestamp eksekusi zona waktu Asia/Jakarta (WIB)
 * 2. Proteksi SSRF terhadap dpUrl target
 * 3. Publikasi delayed job ke Upstash QStash
 * 4. Pencatatan metadata antrean dan pembatalan di Firestore
 */
const crypto = require('crypto');
const { DateTime } = require('luxon');

const WIB_TIMEZONE = 'Asia/Jakarta';
const TIMEBOMB_COLLECTION = 'timebomb_jobs';
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validates dpUrl against SSRF vectors.
 * Hanya mengizinkan protokol HTTPS dan menolak localhost atau IP privat.
 * 
 * @param {string} url
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDpUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'dpUrl wajib diisi.' };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'dpUrl bukan URL yang valid.' };
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'dpUrl harus menggunakan protokol HTTPS.' };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return { valid: false, error: 'dpUrl tidak boleh mengarah ke localhost (SSRF).' };
  }
  const privateIp = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(hostname);
  if (privateIp) {
    return { valid: false, error: 'dpUrl tidak boleh mengarah ke IP internal (SSRF).' };
  }
  return { valid: true };
}

/**
 * Calculates Unix epoch timestamp in seconds for target time (Asia/Jakarta).
 * Deducts 60 seconds (1 minute buffer) if action is MASUK.
 * 
 * @param {string} targetTime - Format "HH:mm" (24 jam)
 * @param {string} [action=""] - "MASUK" atau "KELUAR"
 * @returns {number|null} Unix epoch dalam detik atau null jika format invalid
 */
function calculateExecutionTimestamp(targetTime, action = '') {
  if (!targetTime || !TIME_REGEX.test(targetTime)) {
    return null;
  }
  const [hours, minutes] = targetTime.split(':').map(Number);
  const now = DateTime.now().setZone(WIB_TIMEZONE);
  let target = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  // Rollover ke hari berikutnya jika jam target hari ini sudah lewat
  if (target <= now) {
    target = target.plus({ days: 1 });
  }

  let finalSeconds = Math.floor(target.toMillis() / 1000);
  if (action && action.toUpperCase() === 'MASUK') {
    finalSeconds -= 60;
  }
  return finalSeconds;
}

/**
 * Schedules a time-bomb attendance execution via Upstash QStash & Firestore.
 * 
 * @param {Object} config - Konfigurasi jadwal dan payload presensi
 * @param {Object} context - Dependency injection: { qstashClient, firestoreDb, webhookUrl }
 * @returns {Promise<{ status: boolean, message: string, timer_key?: string, notBefore?: number }>}
 */
async function scheduleQStashTimebomb(config, { qstashClient, firestoreDb, webhookUrl }) {
  const { token, dpUrl, targetTime, action, userId, payload } = config || {};

  if (!token) {
    return { status: false, message: 'Token otorisasi wajib diisi.' };
  }
  if (!payload || payload.latitude === undefined || payload.longitude === undefined || !payload.image) {
    return { status: false, message: 'Payload tidak lengkap. Latitude, longitude, dan image wajib diisi.' };
  }

  const urlValidation = validateDpUrl(dpUrl);
  if (!urlValidation.valid) {
    return { status: false, message: urlValidation.error };
  }

  const executionTimestamp = calculateExecutionTimestamp(targetTime, action);
  if (!executionTimestamp) {
    return { status: false, message: 'Format waktu tidak valid.' };
  }

  const timerKey = crypto.randomBytes(8).toString('hex');

  try {
    const qstashRes = await qstashClient.publishJSON({
      url: webhookUrl,
      notBefore: executionTimestamp,
      body: {
        timerKey,
        token,
        dpUrl,
        action,
        userId,
        payload
      }
    });

    const qstashMessageId = qstashRes?.messageId || '';

    await firestoreDb.collection(TIMEBOMB_COLLECTION).doc(timerKey).set({
      timerKey,
      userId: userId || 'anonymous',
      action: action || 'MASUK',
      targetTime,
      executionTimestamp,
      qstashMessageId,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString()
    });

    return {
      status: true,
      timer_key: timerKey,
      notBefore: executionTimestamp,
      message: 'Jadwal presensi berhasil dikirim ke antrean QStash.'
    };
  } catch (error) {
    return {
      status: false,
      message: `Gagal menjadwalkan ke QStash: ${error.message}`
    };
  }
}

/**
 * Cancels a scheduled time-bomb job in both QStash and Firestore.
 * 
 * @param {string} timerKey
 * @param {Object} context - { qstashClient, firestoreDb }
 * @returns {Promise<{ status: boolean, message: string }>}
 */
async function cancelQStashTimebomb(timerKey, { qstashClient, firestoreDb }) {
  if (!timerKey) {
    return { status: false, message: 'timer_key wajib diisi.' };
  }

  const docRef = firestoreDb.collection(TIMEBOMB_COLLECTION).doc(timerKey);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return { status: false, message: 'Jadwal tidak ditemukan.' };
  }

  const jobData = docSnap.data();
  if (jobData.qstashMessageId) {
    try {
      await qstashClient.messages.delete(jobData.qstashMessageId);
    } catch (err) {
      console.warn('[QSTASH] Gagal delete message di QStash:', err.message);
    }
  }

  await docRef.update({
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString()
  });

  return {
    status: true,
    message: 'Jadwal presensi berhasil dibatalkan.'
  };
}

module.exports = {
  validateDpUrl,
  calculateExecutionTimestamp,
  scheduleQStashTimebomb,
  cancelQStashTimebomb
};
