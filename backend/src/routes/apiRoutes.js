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
    // Hitung total pesan
    const totalResult = db
      .prepare("SELECT COUNT(*) as count FROM message_logs")
      .get();
    const totalMsg = totalResult ? totalResult.count : 0;

    // Hitung pesan sukses
    const successResult = db
      .prepare(
        "SELECT COUNT(*) as count FROM message_logs WHERE status = 'SUCCESS'",
      )
      .get();
    const successMsg = successResult ? successResult.count : 0;

    // Ambil 5 riwayat terbaru
    const recentLogs = db
      .prepare(
        "SELECT target_number, status, message FROM message_logs ORDER BY rowid DESC LIMIT 5",
      )
      .all();

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
    const devices = db
      .prepare("SELECT username, phone, api_key, status FROM users")
      .all();
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

module.exports = router;
