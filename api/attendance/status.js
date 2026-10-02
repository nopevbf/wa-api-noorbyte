/**
 * GET /api/attendance/status?timer_key=xyz — Check status of a scheduled job
 */
const { getAppContext } = require('../_lib/context');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const timerKey = req.query.timer_key;
  if (!timerKey) {
    return res.status(400).json({ status: false, message: 'timer_key wajib disertakan.' });
  }

  try {
    const { firestoreDb } = getAppContext();
    if (!firestoreDb) {
      return res.status(200).json({ status: true, jobStatus: 'PENDING', message: 'Database belum terhubung.' });
    }

    const docSnap = await firestoreDb.collection('timebomb_jobs').doc(timerKey).get();
    if (!docSnap.exists) {
      return res.status(404).json({ status: false, message: 'Jadwal tidak ditemukan.' });
    }

    const data = docSnap.data();
    return res.status(200).json({
      status: true,
      jobStatus: data.status,
      message: data.responseMessage || data.error || '',
      data
    });
  } catch (error) {
    console.error('[API STATUS ERROR]', error);
    return res.status(500).json({ status: false, message: error.message });
  }
};
