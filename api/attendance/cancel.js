/**
 * POST /api/attendance/cancel — Cancels a scheduled Time-Bomb job
 */
const { cancelQStashTimebomb } = require('../../backend/src/services/qstashService');
const { getAppContext } = require('../_lib/context');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: false, message: 'Method not allowed' });
  }

  try {
    const { timer_key } = req.body || {};
    const context = getAppContext();
    const result = await cancelQStashTimebomb(timer_key, context);

    const statusCode = result.status ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[API CANCEL ERROR]', error);
    return res.status(500).json({
      status: false,
      message: `Terjadi kesalahan internal server: ${error.message}`
    });
  }
};
