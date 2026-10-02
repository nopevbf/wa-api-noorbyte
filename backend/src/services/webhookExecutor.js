/**
 * webhookExecutor.js — Serverless Webhook Execution Engine for Time-Bomb Presence
 * 
 * Bertanggung jawab untuk:
 * 1. Mengeksekusi panggilan HTTP POST presensi ke API DParagon
 * 2. Deteksi otomatis respons penolakan terkait alasan keterlambatan (auto late_reason)
 * 3. Memperbarui status eksekusi dokumen antrean di Firestore
 */
const DEFAULT_LATE_REASON = 'Urusan Keluarga';
const TIMEBOMB_COLLECTION = 'timebomb_jobs';

/**
 * Mendeteksi apakah respons error dari server DParagon memerlukan late_reason.
 * 
 * @param {Response} response
 * @param {Object} resData
 * @returns {boolean}
 */
function isLateReasonRequired(response, resData) {
  if (response.ok) return false;
  const message = (resData?.message || '').toLowerCase();
  return (
    message.includes('terlambat') || 
    message.includes('late_reason') || 
    message.includes('alasan')
  );
}

/**
 * Executes attendance presence submission triggered by QStash webhook.
 * Automatically resolves late_reason if required by DParagon.
 * Updates Firestore job status.
 * 
 * @param {Object} jobData - Metadata antrean presensi
 * @param {Object} context - Dependency injection: { httpClient, firestoreDb }
 * @returns {Promise<{ status: boolean, message: string }>}
 */
async function executePresenceWebhook(jobData, { httpClient, firestoreDb }) {
  const { timerKey, token, dpUrl, action, userId, payload } = jobData || {};

  if (!timerKey || !token || !dpUrl || !payload) {
    return { status: false, message: 'Data job tidak lengkap.' };
  }

  const endpoint = `${dpUrl.replace(/\/$/, '')}/attendance/presence`;
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const body = {
    latitude: payload.latitude,
    longitude: payload.longitude,
    image: payload.image
  };

  const client = httpClient || fetch;

  try {
    let response = await client(endpoint, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(body)
    });

    let resData = await response.json();

    // Auto-resolve: jika ditolak karena terlambat, sertakan late_reason dan coba ulang
    if (isLateReasonRequired(response, resData)) {
      body.late_reason = DEFAULT_LATE_REASON;
      response = await client(endpoint, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(body)
      });
      resData = await response.json();
    }

    const isSuccess = response.ok && (resData?.status === true || resData?.message?.toLowerCase().includes('berhasil'));
    const finalStatus = isSuccess ? 'SUCCESS' : 'FAILED';
    const finalMessage = resData?.message || (isSuccess ? 'Presensi berhasil.' : 'Presensi gagal.');

    if (firestoreDb) {
      await firestoreDb.collection(TIMEBOMB_COLLECTION).doc(timerKey).update({
        status: finalStatus,
        responseMessage: finalMessage,
        completedAt: new Date().toISOString()
      });
    }

    return {
      status: isSuccess,
      message: finalMessage
    };
  } catch (error) {
    if (firestoreDb) {
      await firestoreDb.collection(TIMEBOMB_COLLECTION).doc(timerKey).update({
        status: 'FAILED',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }

    return {
      status: false,
      message: `Eksekusi presensi gagal: ${error.message}`
    };
  }
}

module.exports = {
  executePresenceWebhook,
  DEFAULT_LATE_REASON
};
