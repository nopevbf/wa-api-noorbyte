const express = require("express");
const router = express.Router();
const db = require("../config/database");
const appConfig = require("../config/appConfig");
const checkApiKey = require("../middlewares/auth");
const { scrapeDparagonAttendance } = require('../../../frontend/public/js/scapper.js');
const {
  sendMessageViaWa,
  disconnectWa,
  connectToWhatsApp,
  fetchGroups,
} = require("../services/waEngine");
const crypto = require("crypto");

// ENDPOINT: App Config (expose env & default DParagon URL ke frontend)
router.get("/app-config", (req, res) => {
  res.status(200).json({
    status: true,
    data: {
      env: appConfig.env,
      dparagonApiUrl: appConfig.dparagonApiUrl,
    },
  });
});

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

// ==========================================
// AUTOMATION ENDPOINTS (BACKEND EXECUTION)
// ==========================================
const { getScheduleLogs, clearScheduleLogs } = require("../services/automationEngine");

// SAVE SETTINGS: Menyimpan/memperbarui jadwal otomasi di backend
router.post("/automation/save-settings", (req, res) => {
  const {
    api_key,
    dp_api_url,
    dp_email,
    dp_password,
    target_number,
    fetch_time,
    send_wa_time,
    frequency,
    is_active,
  } = req.body;

  if (!api_key) {
    return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  }

  try {
    // Cek apakah sudah ada schedule untuk api_key ini
    const existing = db
      .prepare("SELECT id FROM automation_schedules WHERE api_key = ?")
      .get(api_key);

    if (existing) {
      // Update
      db.prepare(
        `UPDATE automation_schedules SET
          dp_api_url = ?, dp_email = ?, dp_password = ?, target_number = ?,
          fetch_time = ?, send_wa_time = ?, frequency = ?, is_active = ?
        WHERE api_key = ?`
      ).run(
        dp_api_url, dp_email, dp_password, target_number,
        fetch_time, send_wa_time, frequency || "daily", is_active ? 1 : 0,
        api_key
      );
    } else {
      // Insert baru
      db.prepare(
        `INSERT INTO automation_schedules
          (api_key, dp_api_url, dp_email, dp_password, target_number,
           fetch_time, send_wa_time, frequency, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        api_key, dp_api_url, dp_email, dp_password, target_number,
        fetch_time, send_wa_time, frequency || "daily", is_active ? 1 : 0
      );
    }

    res.status(200).json({ status: true, message: "Pengaturan otomasi berhasil disimpan di server." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal menyimpan pengaturan.", error: error.message });
  }
});

// RUN MANUAL: Mendaftarkan satu eksekusi Otomatis di waktu tertentu
router.post("/automation/run-manual", (req, res) => {
  const { api_key, run_time, dp_api_url, dp_email, dp_password, target_number } = req.body;

  if (!api_key || !run_time) {
    return res.status(400).json({ status: false, message: "API Key dan waktu eksekusi wajib diisi." });
  }

  try {
    const existing = db
      .prepare("SELECT id FROM automation_schedules WHERE api_key = ?")
      .get(api_key);

    if (existing) {
      db.prepare(
        `UPDATE automation_schedules SET
          dp_api_url = ?, dp_email = ?, dp_password = ?, target_number = ?,
          manual_run_time = ?, manual_run_status = 'waiting'
        WHERE api_key = ?`
      ).run(dp_api_url, dp_email, dp_password, target_number, run_time, api_key);

      // Clear old logs
      clearScheduleLogs(existing.id);
    } else {
      db.prepare(
        `INSERT INTO automation_schedules
          (api_key, dp_api_url, dp_email, dp_password, target_number,
           manual_run_time, manual_run_status)
        VALUES (?, ?, ?, ?, ?, ?, 'waiting')`
      ).run(api_key, dp_api_url, dp_email, dp_password, target_number, run_time);
    }

    res.status(200).json({
      status: true,
      message: `Otomatis run terjadwal di server pada ${run_time}. Anda bisa menutup browser.`,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal menjadwalkan Otomatis run.", error: error.message });
  }
});

// STATUS: Ambil status & log eksekusi dari backend
router.get("/automation/status", (req, res) => {
  const { api_key } = req.query;
  if (!api_key) {
    return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  }

  try {
    const schedule = db
      .prepare("SELECT * FROM automation_schedules WHERE api_key = ?")
      .get(api_key);

    if (!schedule) {
      return res.status(200).json({
        status: true,
        data: null,
        message: "Belum ada jadwal otomasi untuk device ini.",
      });
    }

    const logs = getScheduleLogs(schedule.id);

    res.status(200).json({
      status: true,
      data: {
        id: schedule.id,
        is_active: !!schedule.is_active,
        fetch_time: schedule.fetch_time,
        send_wa_time: schedule.send_wa_time,
        frequency: schedule.frequency,
        cached_message: schedule.cached_message,
        last_fetched_date: schedule.last_fetched_date,
        last_sent_date: schedule.last_sent_date,
        manual_run_status: schedule.manual_run_status,
        manual_run_time: schedule.manual_run_time,
        logs: logs,
      },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal mengambil status.", error: error.message });
  }
});

// Endpoint Rename Device (UBAH JADI POST)
router.post('/rename-device', async (req, res) => {
  try {
    // TANGKAP NAMA VARIABEL YANG BENER DARI FRONTEND
    const { api_key, new_name } = req.body;

    if (!api_key || !new_name) {
      return res.status(400).json({ status: false, message: "API Key dan Nama Baru wajib diisi!" });
    }

    console.log(`[DATABASE] Memperbarui nama device ${api_key} menjadi: ${new_name}`);

    // EKSEKUSI DATABASE SQLITE LO
    db.prepare("UPDATE users SET username = ? WHERE api_key = ?").run(new_name, api_key);

    res.json({ status: true, message: "Nama device berhasil diperbarui!" });

  } catch (error) {
    console.error("Error rename device:", error);
    res.status(500).json({ status: false, message: "Server gagal merubah nama device." });
  }
});

// --- ENDPOINT BARU: AMBIL DATA KPI ---
router.get("/automation/kpi", (req, res) => {
  const { api_key } = req.query;

  if (!api_key) {
    return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  }

  try {
    // 1. Cari schedule-nya dulu
    const schedule = db
      .prepare("SELECT * FROM automation_schedules WHERE api_key = ?")
      .get(api_key);

    if (!schedule) {
      return res.status(200).json({
        status: true,
        data: {
          last_run: null,
          success_rate: 0,
          avg_latency: 0,
          data_processed: 0,
        },
        message: "Belum ada data performa.",
      });
    }

    // 2. Hitung KPI dari log yang ada
    const logs = getScheduleLogs(schedule.id);

    let totalRuns = 0;
    let totalSuccess = 0;
    let totalLatency = 0;
    let totalDataMB = 0;

    logs.forEach(log => {
      // Hitung jumlah eksekusi berdasarkan label langkah yang dilakukan
      if (["FETCH", "SEND", "STEP 1-5", "STEP 6"].includes(log.label)) {
        totalRuns++;
      }

      // Hitung success rate (setiap kali ada label SUCCESS)
      if (log.label === "SUCCESS") {
        totalSuccess++;

        // Ekstrak latency dari teks "Otomatis run selesai! Pesan terkirim. (Latency: 1.2s)"
        const latencyMatch = log.text.match(/Latency: ([\d.]+)/);
        if (latencyMatch && latencyMatch[1]) {
          totalLatency += parseFloat(latencyMatch[1]);
        }

        // Ekstrak data size dari teks "Data berhasil ditarik. (Size: 2.5 MB)"
        const sizeMatch = log.text.match(/Size: ([\d.]+)/);
        if (sizeMatch && sizeMatch[1]) {
          totalDataMB += parseFloat(sizeMatch[1]);
        }
      }
    });

    // 3. Hitung rata-rata
    const successRate = totalRuns > 0 ? ((totalSuccess / totalRuns) * 100).toFixed(1) : 0;
    const avgLatency = totalSuccess > 0 ? (totalLatency / totalSuccess).toFixed(1) : 0;

    // 4. Ambil tanggal terakhir jalan yang real dari database log timestamp
    let lastRunDate = null;
    const lastLog = db.prepare("SELECT created_at FROM automation_logs WHERE schedule_id = ? ORDER BY id DESC LIMIT 1").get(schedule.id);
    if (lastLog && lastLog.created_at) {
      lastRunDate = lastLog.created_at.replace(' ', 'T') + "Z"; // Format ISO 8601
    }

    res.status(200).json({
      status: true,
      data: {
        last_run: lastRunDate,
        success_rate: successRate,
        avg_latency: avgLatency,
        data_processed: totalDataMB.toFixed(1),
      },
    });

  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal mengambil data KPI.", error: error.message });
  }
});

// Endpoint untuk trigger Jailbreak dari Frontend
router.post('/jailbreak/execute', async (req, res) => {
  try {
    // 1. Tangkap 4 data BARU yang dikirim dari checkin.js
    const { env, email, password, fullName } = req.body;

    // 2. Validasi biar gak ada yang kosong
    if (!env || !email || !password || !fullName) {
      return res.status(400).json({ status: false, message: "Missing payload data." });
    }

    // 3. JANGAN PAKE AWAIT di sini! 
    // Biarin scraper jalan di background (Asynchronous)
    scrapeDparagonAttendance(env, email, password, fullName, 1)
      .then(data => {
        console.log(`[SYSTEM] Scraping Background Selesai untuk user: ${fullName}`);
        // Nanti lo bisa tambahin logic simpan 'data' ke Database di sini
      })
      .catch(err => {
        console.error("[SYSTEM] Scraping Background Gagal:", err);
      });

    // 4. Langsung balikin response sukses detik itu juga
    // Biar UI di browser bisa langsung pindah halaman ke terminal!
    res.json({ status: true, message: "Engine started!" });

  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// ==========================================
// ENDPOINT: SERVER-SIDE TIME-BOMB
// ==========================================
router.post('/attendance/schedule-timebomb', async (req, res) => {
  try {
    const { targetTime, token, dpUrl, payload } = req.body;

    if (!targetTime || !token || !payload) {
      return res.status(400).json({ status: false, message: "Payload tidak lengkap." });
    }

    // 1. Kalkulasi Waktu di Server
    const [targetHour, targetMinute] = targetTime.split(':');
    const targetDate = new Date();
    targetDate.setHours(targetHour, targetMinute, 0, 0);

    let delayMs = targetDate.getTime() - new Date().getTime();
    if (delayMs < 0) delayMs += (24 * 60 * 60 * 1000); // Kalau lewat, set buat besoknya

    console.log(`[SERVER] ⏰ Time-Bomb diterima! Aktif dalam ${Math.floor(delayMs / 60000)} menit (Jam ${targetTime}).`);

    // 2. Fungsi Penembak Jitu (Berjalan murni di backend Node.js)
    const executeBomb = async (lateReason = "") => {
      try {
        console.log(`[SERVER] 🔥 TIME-BOMB MELEDAK SEKARANG!`);

        let finalPayload = { ...payload };
        if (lateReason !== "") {
          finalPayload.late_reason = lateReason;
        }

        const baseUrl = dpUrl ? dpUrl.replace(/\/$/, '') : "https://api.dparagon.com/v2";
        const targetEndpoint = `${baseUrl}/attendance/presence`;

        // Pakai native fetch Node.js
        const response = await fetch(targetEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(finalPayload)
        });

        const result = await response.json();

        if (response.ok && result.status !== false) {
          console.log(`[SERVER] ✅ Target Hancur! Absen sukses dikirim.`);
        } else {
          let realError = "Ditolak sistem.";
          if (result.errors) realError = JSON.stringify(result.errors);
          else if (result.message) realError = typeof result.message === 'object' ? JSON.stringify(result.message) : result.message;
          throw new Error(realError);
        }

      } catch (error) {
        console.warn(`[SERVER] ⚠️ Absen Ditolak:`, error.message);

        // AUTO-RESOLVE BERJALAN DI SERVER!
        const isLateError = error.message.includes('late_reason') || error.message.includes('Alasan');
        if (lateReason === "" && isLateError) {
          console.log("[SERVER] Meminta alasan. Mengaktifkan Silent Auto-Resolve: 'Urusan Keluarga'...");
          await executeBomb("Urusan Keluarga");
        } else {
          console.error("[SERVER] ❌ Gagal total mengirim absen:", error.message);
        }
      }
    };

    // 3. Pasang Timer Tahan Banting di Server
    setTimeout(() => {
      executeBomb();
    }, delayMs);

    // Langsung kasih jempol ke Browser biar user bisa nutup tab-nya
    res.json({ status: true, message: `Engine standby. Will execute at ${targetTime}` });

  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

module.exports = router;
