/**
 * firebase.js — Firebase Admin & Firestore Cloud Initialization
 */
let admin = null;
let db = null;

try {
  admin = require('firebase-admin');
} catch (e) {
  // Graceful fallback jika firebase-admin belum di-npm install
  console.warn('[FIREBASE] firebase-admin package belum terinstall.');
}

function getFirestoreDb() {
  if (db) return db;

  if (!admin) {
    return null;
  }

  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (privateKey) {
      // Hapus tanda kutip luar jika ada
      if (
        (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
        (privateKey.startsWith("'") && privateKey.endsWith("'"))
      ) {
        privateKey = privateKey.slice(1, -1);
      }
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      console.log('✅ [FIREBASE] Firebase Admin SDK berhasil diinisialisasi.');
    } else {
      console.warn('⚠️ [FIREBASE] Kredensial Firebase ENV belum lengkap. Menggunakan default credentials.');
      try {
        admin.initializeApp();
      } catch (err) {
        console.warn('⚠️ [FIREBASE] Inisialisasi default gagal:', err.message);
      }
    }
  }

  try {
    db = admin.firestore();
  } catch (err) {
    console.error('❌ [FIREBASE] Gagal mendapatkan instance Firestore:', err.message);
  }

  return db;
}

module.exports = {
  getFirestoreDb
};
