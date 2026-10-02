/**
 * context.js — Serverless Runtime Context (QStash Client & Firestore)
 */
const { getFirestoreDb } = require('./firebase');

/**
 * Creates lightweight QStash client using native fetch (zero-dependency).
 */
function createQStashClient(token) {
  const qstashToken = token || process.env.QSTASH_TOKEN;

  return {
    async publishJSON({ url, notBefore, body }) {
      const targetUrl = url.replace(/^https?:\/\//, '');
      const response = await fetch(`https://qstash.upstash.io/v2/publish/https://${targetUrl}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${qstashToken}`,
          'Content-Type': 'application/json',
          'Upstash-Not-Before': String(notBefore)
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`QStash HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    },

    messages: {
      async delete(messageId) {
        const response = await fetch(`https://qstash.upstash.io/v2/messages/${messageId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${qstashToken}`
          }
        });
        return { success: response.ok };
      }
    }
  };
}

function getAppContext() {
  const firestoreDb = getFirestoreDb();
  const qstashClient = createQStashClient();
  const webhookUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/timebomb/execute-webhook`
    : (process.env.WEBHOOK_BASE_URL || 'https://wa-api-noorbyte.vercel.app/api/timebomb/execute-webhook');

  return {
    firestoreDb,
    qstashClient,
    webhookUrl
  };
}

module.exports = {
  createQStashClient,
  getAppContext
};
