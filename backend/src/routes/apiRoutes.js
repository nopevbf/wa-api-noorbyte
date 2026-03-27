const express = require("express");
const router = express.Router();
const db = require("../config/database");
const checkApiKey = require("../middlewares/auth");
const {
  sendMessageViaWa,
  disconnectWa,
  connectToWhatsApp,
  fetchGroups,
} = require("../services/waEngine");
const crypto = require("crypto");

// ENDPOINT: Ambil Statistik Dashboard
router.get("/dashboard-stats", (req, res) => {
  try {
    const { role, api_key } = req.query;
    let totalMsg = 0, successMsg = 0, recentLogs = [];

    if (role === 'admin') {
      // Hitung total pesan
      const totalResult = db.prepare("SELECT COUNT(*) as count FROM message_logs").get();
      totalMsg = totalResult ? totalResult.count : 0;

      // Hitung pesan sukses
      const successResult = db.prepare("SELECT COUNT(*) as count FROM message_logs WHERE status = 'SUCCESS'").get();
      successMsg = successResult ? successResult.count : 0;

      // Ambil 5 riwayat terbaru
      recentLogs = db.prepare("SELECT target_number, status, message FROM message_logs ORDER BY rowid DESC LIMIT 5").all();
    } else if (api_key) {
      const totalResult = db.prepare("SELECT COUNT(*) as count FROM message_logs WHERE api_key = ?").get(api_key);
      totalMsg = totalResult ? totalResult.count : 0;

      const successResult = db.prepare("SELECT COUNT(*) as count FROM message_logs WHERE status = 'SUCCESS' AND api_key = ?").get(api_key);
      successMsg = successResult ? successResult.count : 0;

      recentLogs = db.prepare("SELECT target_number, status, message FROM message_logs WHERE api_key = ? ORDER BY rowid DESC LIMIT 5").all(api_key);
    } else {
      return res.status(401).json({ status: false, message: "Unauthorized: Silakan login terlebih dahulu." });
    }

    // Hitung persentase
    const successRate =
      totalMsg === 0 ? 0 : ((successMsg / totalMsg) * 100).toFixed(1);

    res.status(200).json({
      status: true,
      data: {
        totalMessages: totalMsg,
        successRate: successRate,
        recentLogs: recentLogs,
      },
    });
  } catch (error) {
    // Antisipasi kalau tabel message_logs belum ada/kosong
    res.status(500).json({
      status: false,
      message: "Gagal mengambil statistik",
      data: { totalMessages: 0, successRate: 0, recentLogs: [] },
    });
  }
});

router.get("/get-devices", (req, res) => {
  try {
    const { role, api_key } = req.query;
    let devices = [];
    if (role === 'admin') {
      devices = db.prepare("SELECT username, phone, api_key, status FROM users").all();
    } else if (api_key) {
      devices = db.prepare("SELECT username, phone, api_key, status FROM users WHERE api_key = ?").all(api_key);
    } else {
      return res.status(401).json({ status: false, message: "Unauthorized: Silakan login terlebih dahulu." });
    }
    res.status(200).json({ status: true, data: devices });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Gagal mengambil data device." });
  }
});

router.post("/add-device", (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone)
    return res
      .status(400)
      .json({ status: false, message: "Nama dan Nomor WA wajib diisi." });

  const token = "DEV-" + crypto.randomBytes(4).toString("hex").toUpperCase();

  try {
    db.prepare(
      "INSERT INTO users (username, phone, api_key, status) VALUES (?, ?, ?, ?)",
    ).run(name, phone, token, "Disconnected");
    res.status(200).json({
      status: true,
      message: "Device berhasil ditambahkan!",
      token: token,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Gagal menambah device.",
      error: error.message,
    });
  }
});

// ENDPOINT BARU: Putus Koneksi Device
router.post("/disconnect-device", async (req, res) => {
  const { api_key } = req.body;
  if (!api_key)
    return res
      .status(400)
      .json({ status: false, message: "API Key wajib dikirim." });

  try {
    // Matikan mesin WA untuk sesi ini
    await disconnectWa(api_key);

    // Update status di database
    db.prepare("UPDATE users SET status = ? WHERE api_key = ?").run(
      "Disconnected",
      api_key,
    );

    res
      .status(200)
      .json({ status: true, message: "Device berhasil diputus (Logged Out)." });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Gagal memutus device.",
      error: error.message,
    });
  }
});

// Jangan lupa tambahin connectToWhatsApp di baris import paling atas (sekitar baris 5)
// const { sendMessageViaWa, disconnectWa, connectToWhatsApp } = require('../services/waEngine');

// ENDPOINT BARU: Menyalakan mesin WA dan generate QR
router.post("/connect-device", async (req, res) => {
  const { api_key } = req.body;
  if (!api_key)
    return res
      .status(400)
      .json({ status: false, message: "API Key wajib dikirim." });

  try {
    // Panggil fungsi connect WA, dan oper global.io agar QR bisa dikirim realtime
    connectToWhatsApp(api_key, global.io);
    res
      .status(200)
      .json({ status: true, message: "Mesin WA dinyalakan. Menunggu QR..." });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Gagal memulai koneksi.",
      error: error.message,
    });
  }
});

// ENDPOINT BARU: Hapus Device Permanen
router.post("/delete-device", async (req, res) => {
  const { api_key } = req.body;
  if (!api_key)
    return res
      .status(400)
      .json({ status: false, message: "API Key wajib dikirim." });

  try {
    // 1. Matikan mesin WA dan hapus folder sesi secara permanen
    await disconnectWa(api_key);

    // 2. Hapus data device dari tabel users
    db.prepare("DELETE FROM users WHERE api_key = ?").run(api_key);

    // Opsional: Hapus riwayat pesan terkait biar database nggak bengkak
    db.prepare("DELETE FROM message_logs WHERE api_key = ?").run(api_key);

    res
      .status(200)
      .json({ status: true, message: "Device berhasil dihapus permanen." });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Gagal menghapus device.",
      error: error.message,
    });
  }
});

// ENDPOINT: Kirim Pesan (Text, Image, Document)
router.post("/send-message", checkApiKey, async (req, res) => {
  // 1. Timer WAJIB ditaruh di paling atas biar bisa dibaca di try maupun catch
  const startTimer = Date.now();

  // Tangkap semua payload dari Frontend
  const { number, message, msg_type, media, file_name } = req.body;
  const apiKey = req.user.api_key;
  const deviceName = req.user.username || "unknown_device";

  // Validasi basic
  if (!number || (!message && !media)) {
    return res.status(400).json({
      status: "error",
      message: "Parameter tidak lengkap. Nomor dan Pesan/Media wajib diisi.",
    });
  }

  try {
    // 2. Eksekusi kirim pesan via Baileys dengan tambahan attachment
    await sendMessageViaWa(apiKey, number, message, msg_type, media, file_name);

    // 3. Catat ke log database
    const msgTextToSave =
      msg_type === "text"
        ? message
        : `[${msg_type.toUpperCase()}] ${message || ""}`;
    db.prepare(
      "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)",
    ).run(apiKey, number, msgTextToSave, "SUCCESS");

    // 4. Hitung waktu selesai
    const executionTime = Date.now() - startTimer;
    const currentTimestamp = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });

    // Buat Message ID acak (Pastikan require('crypto') udah ada di paling atas file apiRoutes.js)
    const crypto = require("crypto");
    const messageId =
      "WAPI_" + crypto.randomBytes(5).toString("hex").toUpperCase();

    // 5. Kembalikan Response Sukses
    res.status(200).json({
      status: "success",
      data: {
        message_id: messageId,
        recipient: number,
        message_type: msg_type,
        message_text: message || "",
        media_preview: media
          ? `${media.substring(0, 50)}... [TRUNCATED_BASE64]`
          : null,
        file_name: file_name || null,
        timestamp: currentTimestamp,
        device_id: deviceName,
        provider_reference: "whatsapp_meta_8829",
      },
      meta: {
        api_version: "v1.0",
        execution_time_ms: executionTime,
      },
    });
  } catch (error) {
    // Kalau gagal, hitung juga waktu error-nya
    const executionTime = Date.now() - startTimer;

    // Catat error ke log
    const msgTextToSave =
      msg_type === "text"
        ? message
        : `[${msg_type.toUpperCase()}] ${message || ""}`;
    db.prepare(
      "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)",
    ).run(apiKey, number, msgTextToSave, "FAILED");

    res.status(500).json({
      status: "error",
      message: error.message || "Gagal mengirim pesan.",
      meta: {
        api_version: "v1.0",
        execution_time_ms: executionTime,
      },
    });
  }
});

// ENDPOINT BARU: Ambil Daftar Grup
router.get("/groups/:apiKey", async (req, res) => {
  const { apiKey } = req.params;

  try {
    // Cek dulu apakah device ada di database dan statusnya Connected
    const device = db
      .prepare("SELECT status FROM users WHERE api_key = ?")
      .get(apiKey);
    if (!device)
      return res
        .status(404)
        .json({ status: false, message: "Device tidak ditemukan." });
    if (device.status !== "Connected")
      return res
        .status(400)
        .json({ status: false, message: "Device belum terhubung (Offline)." });

    // Tarik grup dari memori WA
    const groups = await fetchGroups(apiKey);

    res.status(200).json({
      status: true,
      message: "Berhasil mengambil grup.",
      data: groups,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Gagal mengambil daftar grup.",
      error: error.message,
    });
  }
});

// ==========================================
// ENDPOINT 1: REQUEST MAGIC LINK
// ==========================================
router.post("/auth/magic-link", async (req, res) => {
  const { phone } = req.body;
  if (!phone)
    return res
      .status(400)
      .json({ status: false, message: "Nomor WhatsApp wajib diisi." });

  try {
    // 1. Cari device "Master/Admin" yang lagi Online untuk bertugas ngirim pesan OTP
    const senderDevice = db
      .prepare("SELECT api_key FROM users WHERE status = 'Connected' LIMIT 1")
      .get();
    if (!senderDevice) {
      return res
        .status(500)
        .json({
          status: false,
          message:
            "Sistem sedang offline. Tidak ada Gateway pengirim yang aktif.",
        });
    }

    // 2. Bikin tabel magic_links (Jaga-jaga kalau belum ada di DB lo)
    db.prepare(
      `CREATE TABLE IF NOT EXISTS magic_links (phone TEXT, token TEXT, expires_at INTEGER, used INTEGER DEFAULT 0)`,
    ).run();

    // 3. Generate Token Unik (Berlaku 10 Menit)
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // 4. Simpan ke Database
    db.prepare(
      "INSERT INTO magic_links (phone, token, expires_at) VALUES (?, ?, ?)",
    ).run(phone, token, expiresAt);

    // 5. Susun Pesan & Kirim via Baileys Engine
    const frontendUrl = req.headers.origin || (req.headers.referer ? req.headers.referer.split('/login')[0] : 'http://localhost:4000');
    const magicLink = `${frontendUrl}/verify?token=${token}`;
    const messageText = `👋 *NoorByteAPI Login*\n\nPermintaan akses masuk terdeteksi. Klik link aman di bawah ini untuk masuk ke Dashboard Anda:\n\n🔗 ${magicLink}\n\n_Link ini hanya berlaku selama 10 menit dan hanya bisa digunakan satu kali. Jangan bagikan link ini ke siapapun._`;

    // Gunakan fungsi sendMessageViaWa yang sudah ada
    await sendMessageViaWa(senderDevice.api_key, phone, messageText, "text");

    res
      .status(200)
      .json({
        status: true,
        message: "Magic link berhasil dikirim ke WhatsApp Anda.",
      });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// ==========================================
// ENDPOINT 2: VERIFY MAGIC LINK
// ==========================================
router.post("/auth/verify", (req, res) => {
  const { token } = req.body;
  if (!token)
    return res
      .status(400)
      .json({ status: false, message: "Token tidak ditemukan." });

  try {
    // 1. Cek Token di Database
    const linkData = db
      .prepare("SELECT * FROM magic_links WHERE token = ? AND used = 0")
      .get(token);

    if (!linkData)
      return res
        .status(401)
        .json({
          status: false,
          message: "Link tidak valid atau sudah digunakan.",
        });
    if (Date.now() > linkData.expires_at)
      return res
        .status(401)
        .json({
          status: false,
          message: "Link sudah kadaluarsa. Silakan request ulang.",
        });

    // 2. Tandai token sudah terpakai
    db.prepare("UPDATE magic_links SET used = 1 WHERE token = ?").run(token);

    // 3. Cek apakah user (nomor WA ini) sudah punya akun. Kalau belum, AUTO-REGISTER!
    let user = db
      .prepare("SELECT * FROM users WHERE phone = ?")
      .get(linkData.phone);

    if (!user) {
      const newApiKey = "nb_" + crypto.randomBytes(10).toString("hex");
      const newUsername = "User_" + linkData.phone.slice(-4);

      db.prepare(
        "INSERT INTO users (username, phone, api_key, status) VALUES (?, ?, ?, 'Offline')",
      ).run(newUsername, linkData.phone, newApiKey);
      user = {
        username: newUsername,
        phone: linkData.phone,
        api_key: newApiKey,
      };
    }

    // 4. Login Sukses! Kembalikan API Key sebagai "Sesi/Session"
    res.status(200).json({
      status: true,
      message: "Otentikasi berhasil.",
      data: {
        username: user.username,
        phone: user.phone,
        api_key: user.api_key,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({
        status: false,
        message: "Terjadi kesalahan server saat verifikasi.",
      });
  }
});

module.exports = router;
