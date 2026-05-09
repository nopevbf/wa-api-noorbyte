const db = require('../config/database');

/**
 * Centralized helper to resolve the target API key from a request.
 * 
 * - For admin: uses req.body.api_key or req.query.api_key (based on source),
 *   and validates the target exists in the database.
 * - For non-admin: always uses req.user.api_key, ignoring any override attempt.
 * 
 * @param {object} req - Express request object
 * @param {'body'|'query'} source - Where to read the admin's target api_key from
 * @returns {{ apiKey: string|null, error: string|null }}
 */
function getTargetApiKey(req, source = 'body') {
  const isAdmin = req.user?.role === 'admin';

  if (isAdmin) {
    const targetKey = source === 'query' ? req.query?.api_key : req.body?.api_key;

    if (!targetKey) {
      return { apiKey: null, error: 'API Key target wajib diisi untuk admin.' };
    }

    const user = db.prepare('SELECT api_key FROM users WHERE api_key = ?').get(targetKey);
    if (!user) {
      return { apiKey: null, error: 'API Key target tidak ditemukan di database.' };
    }

    return { apiKey: targetKey, error: null };
  }

  // Non-admin: always use own api_key, ignore body/query overrides
  const ownKey = req.user?.api_key;
  if (!ownKey) {
    return { apiKey: null, error: 'API Key tidak tersedia pada user saat ini.' };
  }

  return { apiKey: ownKey, error: null };
}

module.exports = { getTargetApiKey };
