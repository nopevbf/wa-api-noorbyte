/**
 * POST /api/timebomb/execute-webhook — Invoked by Upstash QStash at target time
 */
const { executePresenceWebhook } = require('../../backend/src/services/webhookExecutor');
const { getAppContext } = require('../_lib/context');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Upstash-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: false, message: 'Method not allowed' });
  }

  console.log('[WEBHOOK] Received QStash trigger for Time-Bomb execution');

  try {
    const jobData = req.body;
    const context = getAppContext();
    const result = await executePresenceWebhook(jobData, {
      httpClient: fetch,
      firestoreDb: context.firestoreDb
    });

    return res.status(result.status ? 200 : 400).json(result);
  } catch (error) {
    console.error('[WEBHOOK ERROR]', error);
    return res.status(500).json({
      status: false,
      message: `Eksekusi webhook gagal: ${error.message}`
    });
  }
};
