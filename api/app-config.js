/**
 * GET /api/app-config — Returns client configuration
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const env = process.env.NODE_ENV || 'production';
  const dparagonApiUrl = process.env.DPARAGON_URL || 'https://api.dparagon.com';

  res.status(200).json({
    status: true,
    data: {
      env,
      version: '2.1.0-vercel',
      description: 'WhatsApp API & Attendance Engine (Vercel Serverless)',
      dparagonApiUrl
    }
  });
};
