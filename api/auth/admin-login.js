/**
 * POST /api/auth/admin-login — Serverless Admin Authentication Handler
 * 
 * Verifies admin password using timing-safe comparison and returns
 * admin API key for authentication bypass.
 */
const crypto = require('crypto');

/**
 * Timing-safe string comparison to protect against timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      status: false,
      message: 'Method not allowed. Use POST.'
    });
  }

  const { password } = req.body || {};

  if (!password || typeof password !== 'string' || password.trim() === '') {
    return res.status(400).json({
      status: false,
      message: 'Password wajib diisi.'
    });
  }

  const expectedPassword = process.env.ADMIN_PASSWORD || 'grupturok22';
  const adminApiKey = process.env.ADMIN_API_KEY || 'admin_master_key_123';

  if (!safeCompare(password, expectedPassword)) {
    return res.status(401).json({
      status: false,
      message: 'Password admin salah.'
    });
  }

  return res.status(200).json({
    status: true,
    message: 'Login admin berhasil.',
    api_key: adminApiKey
  });
};
