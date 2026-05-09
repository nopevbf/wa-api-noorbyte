/**
 * Builds the WhatsApp message for magic link login.
 * Style: Jaksel casual (Indonesia + English mix), clear, friendly.
 *
 * @param {string} magicLink - The full verify URL
 * @returns {string} Formatted WhatsApp message
 */
function buildMagicLinkMessage(magicLink) {
  return [
    `👋 *Hey, ada login request nih!*`,
    ``,
    `Lo (atau seseorang) barusan minta akses ke *NoorByteAPI*. Klik link di bawah buat masuk:`,
    ``,
    `🔗 ${magicLink}`,
    ``,
    `_*Note:* Link ini cuma berlaku sekali dan kedaluwarsa dalam 10 menit. Kalau bukan lo yang minta, abaikan aja yaa — basically nothing will happen._`,
  ].join('\n');
}

module.exports = { buildMagicLinkMessage };
