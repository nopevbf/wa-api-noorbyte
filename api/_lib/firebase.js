/**
 * firebase.js — Firebase Admin & Firestore Cloud Initialization
 * Compatible with modern modular Firebase Admin SDK (v12 / v13 / v14)
 */
let initializeApp, cert, getApps, getFirestore;
let db = null;

try {
  const appModule = require('firebase-admin/app');
  const firestoreModule = require('firebase-admin/firestore');
  initializeApp = appModule.initializeApp;
  cert = appModule.cert;
  getApps = appModule.getApps;
  getFirestore = firestoreModule.getFirestore;
} catch (e) {
  console.warn('[FIREBASE] firebase-admin package belum terinstall atau gagal dimuat.');
}

function getFirestoreDb() {
  if (db) return db;

  if (!initializeApp || !getFirestore || !getApps) {
    return null;
  }

  try {
    const apps = getApps();
    if (!apps || apps.length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (privateKey) {
        if (
          (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
          (privateKey.startsWith("'") && privateKey.endsWith("'"))
        ) {
          privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');
      }

      if (projectId && clientEmail && privateKey) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey
          })
        });
        console.log('✅ [FIREBASE] Firebase Admin SDK berhasil diinisialisasi.');
      } else {
        console.warn('⚠️ [FIREBASE] Kredensial Firebase ENV belum lengkap.');
        return null;
      }
    }

    db = getFirestore();
  } catch (err) {
    console.error('❌ [FIREBASE] Inisialisasi Firestore gagal:', err.message);
    db = null;
  }

  return db;
}

module.exports = {
  getFirestoreDb
};
