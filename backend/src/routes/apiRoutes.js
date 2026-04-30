const express = require("express");
const router = express.Router();
const db = require("../config/database");
const appConfig = require("../config/appConfig");
const checkApiKey = require("../middlewares/auth");
const rateLimit = require("express-rate-limit");
const { 
  scrapeDparagonAttendance, 
  parseDparagonTime, 
  getCachedData, 
  setCachedData 
} = require('../services/scapper.js');
const { SocksProxyAgent } = require("socks-proxy-agent");
const crypto = require("crypto");

// Socks5 Proxy dari env — dipakai untuk semua request keluar ke DParagon (termasuk checkin handle)
const proxyUrl = process.env.PROXY_URL || "";
const proxyAgent = proxyUrl ? new SocksProxyAgent(proxyUrl) : null;

// Rate limiter untuk endpoint yang sensitif (device management, auth)
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: "Terlalu banyak permintaan. Coba lagi nanti." },
});

// Registry untuk menyimpan ID setTimeout Time-Bomb yang sedang aktif
// key: api_key (string) — value: timeoutId (number)
const timebombRegistry = new Map();
const {
  sendMessageViaWa,
  disconnectWa,
  connectToWhatsApp,
  fetchGroups,
} = require("../services/waEngine");

// ENDPOINT: App Config (expose env & default DParagon URL ke frontend)
router.get("/app-config", (req, res) => {
  res.status(200).json({
    status: true,
    data: {
      env: appConfig.env,
      version: appConfig.version,
      description: appConfig.description,
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
      const masterKey = process.env.ADMIN_API_KEY;
      if (!masterKey || api_key !== masterKey) {
        return res.status(401).json({ status: false, message: "Unauthorized: Kredensial admin tidak valid." });
      }
      const totalResult = db.prepare("SELECT COUNT(*) as count FROM message_logs").get();
      totalMsg = totalResult ? totalResult.count : 0;
      const successResult = db.prepare("SELECT COUNT(*) as count FROM message_logs WHERE status = 'SUCCESS'").get();
      successMsg = successResult ? successResult.count : 0;
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

    const successRate = totalMsg === 0 ? 0 : ((successMsg / totalMsg) * 100).toFixed(1);
    res.status(200).json({
      status: true,
      data: { totalMessages: totalMsg, successRate: successRate, recentLogs: recentLogs },
    });
  } catch (error) {
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
    
    // [FIX] Cek jika database kosong, selalu kembalikan array kosong agar user bisa menambah device
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    if (userCount === 0) {
      return res.status(200).json({ status: true, data: [] });
    }

    let devices = [];
    const effectiveRole = req.user?.role || role;

    if (effectiveRole === 'admin') {
      const masterKey = process.env.ADMIN_API_KEY;
      if (!masterKey || (req.user?.role !== 'admin' && api_key !== masterKey)) {
        return res.status(401).json({ status: false, message: "Unauthorized: Kredensial admin tidak valid." });
      }
      devices = db.prepare("SELECT username, phone, api_key, status, role FROM users").all();
    } else if (api_key || req.user?.api_key) {
      const targetApiKey = api_key || req.user?.api_key;
      devices = db.prepare("SELECT username, phone, api_key, status, role FROM users WHERE api_key = ?").all(targetApiKey);
    } else {
      return res.status(401).json({ status: false, message: "Unauthorized: Silakan login terlebih dahulu." });
    }
    res.status(200).json({ status: true, data: devices });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal mengambil data device." });
  }
});

router.post("/add-device", sensitiveLimiter, checkApiKey, (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ status: false, message: "Nama dan Nomor WA wajib diisi." });
  const token = "DEV-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  try {
    // [FIX] Cek jumlah user untuk menentukan role pertama sebagai admin
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const role = userCount === 0 ? 'admin' : 'user';

    db.prepare("INSERT INTO users (username, phone, api_key, status, role) VALUES (?, ?, ?, ?, ?)").run(name, phone, token, "Disconnected", role);
    res.status(200).json({ status: true, message: "Device berhasil ditambahkan!", token: token });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal menambah device.", error: error.message });
  }
});

router.post("/disconnect-device", sensitiveLimiter, checkApiKey, async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib dikirim." });
  try {
    await disconnectWa(api_key);
    db.prepare("UPDATE users SET status = ? WHERE api_key = ?").run("Disconnected", api_key);
    res.status(200).json({ status: true, message: "Device berhasil diputus (Logged Out)." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal memutus device.", error: error.message });
  }
});

router.post("/connect-device", sensitiveLimiter, checkApiKey, async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib dikirim." });
  try {
    connectToWhatsApp(api_key, global.io);
    res.status(200).json({ status: true, message: "Mesin WA dinyalakan. Menunggu QR..." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal memulai koneksi.", error: error.message });
  }
});

router.post("/delete-device", sensitiveLimiter, checkApiKey, async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib dikirim." });
  try {
    await disconnectWa(api_key);
    db.prepare("DELETE FROM users WHERE api_key = ?").run(api_key);
    db.prepare("DELETE FROM message_logs WHERE api_key = ?").run(api_key);
    res.status(200).json({ status: true, message: "Device berhasil dihapus permanen." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal menghapus device.", error: error.message });
  }
});

router.post("/send-message", checkApiKey, async (req, res) => {
  const startTimer = Date.now();
  const { number, message, msg_type, media, file_name } = req.body;
  const apiKey = req.user.api_key;
  const deviceName = req.user.username || "unknown_device";

  if (!number || (!message && !media)) {
    return res.status(400).json({ status: "error", message: "Parameter tidak lengkap." });
  }

  try {
    await sendMessageViaWa(apiKey, number, message, msg_type, media, file_name);
    const msgTextToSave = msg_type === "text" ? message : `[${msg_type.toUpperCase()}] ${message || ""}`;
    db.prepare("INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)").run(apiKey, number, msgTextToSave, "SUCCESS");
    res.status(200).json({
      status: "success",
      data: { recipient: number, message_type: msg_type, timestamp: new Date().toLocaleString(), device_id: deviceName },
      meta: { api_version: "v1.0", execution_time_ms: Date.now() - startTimer },
    });
  } catch (error) {
    const msgTextToSave = msg_type === "text" ? message : `[${msg_type.toUpperCase()}] ${message || ""}`;
    db.prepare("INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)").run(apiKey, number, msgTextToSave, "FAILED");
    res.status(500).json({ status: "error", message: error.message, meta: { api_version: "v1.0", execution_time_ms: Date.now() - startTimer } });
  }
});

router.get("/groups/:apiKey", async (req, res) => {
  const { apiKey } = req.params;
  try {
    const device = db.prepare("SELECT status FROM users WHERE api_key = ?").get(apiKey);
    if (!device) return res.status(404).json({ status: false, message: "Device tidak ditemukan." });
    if (device.status !== "Connected") return res.status(400).json({ status: false, message: "Device belum terhubung." });
    const groups = await fetchGroups(apiKey);
    res.status(200).json({ status: true, message: "Berhasil mengambil grup.", data: groups });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal mengambil daftar grup.", error: error.message });
  }
});

router.post("/auth/admin-login", sensitiveLimiter, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ status: false, message: "Password wajib diisi." });

  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!adminPassword || !adminApiKey) {
    return res.status(503).json({ status: false, message: "Admin login belum dikonfigurasi di server." });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ status: false, message: "Password salah." });
  }

  return res.status(200).json({ status: true, message: "Login admin berhasil.", api_key: adminApiKey });
});

router.post("/auth/magic-link", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ status: false, message: "Nomor WhatsApp wajib diisi." });
  try {
    const senderDevice = db.prepare("SELECT api_key FROM users WHERE status = 'Connected' LIMIT 1").get();
    if (!senderDevice) return res.status(500).json({ status: false, message: "Sistem pengirim sedang offline." });
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    db.prepare("INSERT INTO magic_links (phone, token, expires_at) VALUES (?, ?, ?)").run(phone, token, expiresAt);
    const frontendUrl = req.headers.origin || (req.headers.referer ? req.headers.referer.split('/login')[0] : 'http://localhost:4000');
    const magicLink = `${frontendUrl}/verify?token=${token}`;
    const messageText = `👋 *NoorByteAPI Login*\n\nKlik link di bawah untuk masuk:\n🔗 ${magicLink}`;
    await sendMessageViaWa(senderDevice.api_key, phone, messageText, "text");
    res.status(200).json({ status: true, message: "Magic link terkirim." });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

router.post("/auth/verify", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ status: false, message: "Token tidak ditemukan." });
  try {
    const linkData = db.prepare("SELECT * FROM magic_links WHERE token = ? AND used = 0").get(token);
    if (!linkData || Date.now() > linkData.expires_at) return res.status(401).json({ status: false, message: "Link tidak valid atau kadaluarsa." });
    db.prepare("UPDATE magic_links SET used = 1 WHERE token = ?").run(token);
    let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(linkData.phone);
    if (!user) {
      const newApiKey = "nb_" + crypto.randomBytes(10).toString("hex");
      const newUsername = "User_" + linkData.phone.slice(-4);
      db.prepare("INSERT INTO users (username, phone, api_key, status) VALUES (?, ?, ?, 'Offline')").run(newUsername, linkData.phone, newApiKey);
      user = { username: newUsername, phone: linkData.phone, api_key: newApiKey };
    }
    res.status(200).json({ status: true, message: "Otentikasi berhasil.", data: { username: user.username, phone: user.phone, api_key: user.api_key } });
  } catch (error) {
    res.status(500).json({ status: false, message: "Kesalahan server saat verifikasi." });
  }
});

const { getScheduleLogs, clearScheduleLogs } = require("../services/automationEngine");

router.post("/automation/save-settings", (req, res) => {
  const { api_key, dp_api_url, dp_email, dp_password, target_number, fetch_time, send_wa_time, frequency, is_active, start_date, end_date, custom_days, excluded_dates } = req.body;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  const customDaysStr = JSON.stringify(custom_days || []);
  const excludedDatesStr = JSON.stringify(excluded_dates || []);
  try {
    const existing = db.prepare("SELECT * FROM automation_schedules WHERE api_key = ?").get(api_key);
    
    // Reset "last run" flags if re-enabling or changing scheduled times
    let resetFlags = false;
    if (existing) {
      if (is_active && (!existing.is_active || existing.fetch_time !== fetch_time || existing.send_wa_time !== send_wa_time)) {
        resetFlags = true;
      }
      
      db.prepare(`
        UPDATE automation_schedules 
        SET dp_api_url = ?, dp_email = ?, dp_password = ?, target_number = ?, fetch_time = ?, send_wa_time = ?, 
            frequency = ?, is_active = ?, start_date = ?, end_date = ?, custom_days = ?, excluded_dates = ?,
            last_fetched_date = ?, last_sent_date = ?
        WHERE api_key = ?
      `).run(
        dp_api_url, dp_email, dp_password, target_number, fetch_time, send_wa_time, 
        frequency || "daily", is_active ? 1 : 0, start_date, end_date, customDaysStr, excludedDatesStr,
        resetFlags ? null : existing.last_fetched_date,
        resetFlags ? null : existing.last_sent_date,
        api_key
      );
    } else {
      db.prepare(`INSERT INTO automation_schedules (api_key, dp_api_url, dp_email, dp_password, target_number, fetch_time, send_wa_time, frequency, is_active, start_date, end_date, custom_days, excluded_dates) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(api_key, dp_api_url, dp_email, dp_password, target_number, fetch_time, send_wa_time, frequency || "daily", is_active ? 1 : 0, start_date, end_date, customDaysStr, excludedDatesStr);
    }
    res.status(200).json({ status: true, message: "Pengaturan berhasil disimpan." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal menyimpan.", error: error.message });
  }
});

router.post("/automation/run-manual", sensitiveLimiter, checkApiKey, (req, res) => {
  const { api_key, run_time, dp_api_url, dp_email, dp_password, target_number } = req.body;
  if (!api_key || !run_time) return res.status(400).json({ status: false, message: "API Key dan waktu wajib diisi." });
  try {
    const existing = db.prepare("SELECT id FROM automation_schedules WHERE api_key = ?").get(api_key);
    if (existing) {
      db.prepare(`UPDATE automation_schedules SET dp_api_url = ?, dp_email = ?, dp_password = ?, target_number = ?, manual_run_time = ?, manual_run_status = 'waiting' WHERE api_key = ?`).run(dp_api_url, dp_email, dp_password, target_number, run_time, api_key);
      clearScheduleLogs(existing.id);
    } else {
      db.prepare(`INSERT INTO automation_schedules (api_key, dp_api_url, dp_email, dp_password, target_number, manual_run_time, manual_run_status) VALUES (?, ?, ?, ?, ?, ?, 'waiting')`).run(api_key, dp_api_url, dp_email, dp_password, target_number, run_time);
    }
    res.status(200).json({ status: true, message: "Jadwal manual run terdaftar." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal menjadwalkan.", error: error.message });
  }
});

router.post("/automation/cancel-manual", (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  try {
    db.prepare(`UPDATE automation_schedules SET manual_run_time = NULL, manual_run_status = NULL WHERE api_key = ?`).run(api_key);
    res.status(200).json({ status: true, message: "Jadwal manual berhasil dibatalkan." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal membatalkan jadwal.", error: error.message });
  }
});

router.get("/automation/status", (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  try {
    const schedule = db.prepare("SELECT * FROM automation_schedules WHERE api_key = ?").get(api_key);
    if (!schedule) return res.status(200).json({ status: true, data: null });
    const logs = getScheduleLogs(schedule.id);
    res.status(200).json({
      status: true,
      data: { ...schedule, logs, custom_days: JSON.parse(schedule.custom_days || '[]'), excluded_dates: JSON.parse(schedule.excluded_dates || '[]') }
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal mengambil status." });
  }
});

router.post('/rename-device', sensitiveLimiter, checkApiKey, async (req, res) => {
  const { api_key, new_name } = req.body;
  if (!api_key || !new_name) return res.status(400).json({ status: false, message: "Data tidak lengkap." });
  try {
    db.prepare("UPDATE users SET username = ? WHERE api_key = ?").run(new_name, api_key);
    res.json({ status: true, message: "Berhasil diubah." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal mengubah." });
  }
});

router.get("/automation/kpi", (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ status: false, message: "API Key wajib diisi." });
  try {
    const totalResult = db.prepare("SELECT COUNT(*) as count FROM message_logs WHERE api_key = ?").get(api_key);
    const successResult = db.prepare("SELECT COUNT(*) as count FROM message_logs WHERE api_key = ? AND status = 'SUCCESS'").get(api_key);
    const total = totalResult ? totalResult.count : 0;
    const success = successResult ? successResult.count : 0;
    // Multiply by 1000 then divide by 10 to get percentage with one decimal place (e.g. 95.5)
    const success_rate = total === 0 ? 0 : Math.round((success / total) * 1000) / 10;
    res.status(200).json({ status: true, data: { success_rate, total_sent: total } });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal ambil KPI." });
  }
});

router.get("/attendance/history", async (req, res) => {
  try {
    const targetPage = parseInt(req.query.page) || 1;
    const fullName = req.query.name || "";
    if (!fullName || fullName === "UNKNOWN USER") return res.json({ status: true, data: [], current_page: targetPage });
    const { cachedHistoryData, lastScrapeTime } = getCachedData();
    const isCacheExpired = !lastScrapeTime || new Date() - lastScrapeTime > 5 * 60 * 1000;
    let resultData = [];
    if (targetPage === 1 && cachedHistoryData.length > 0 && !isCacheExpired) {
      resultData = cachedHistoryData;
    } else {
      const env = process.env.NODE_ENV || "development";
      const email = env === "production" ? process.env.DPARAGON_EMAIL : process.env.DPARAGON_EMAIL_DEV;
      const password = env === "production" ? process.env.DPARAGON_PASSWORD : process.env.DPARAGON_PASSWORD_DEV;
      const rawData = await scrapeDparagonAttendance(env, email, password, fullName, targetPage);
      let formattedData = [];
      rawData.forEach(item => {
        if (item.waktu_masuk && item.waktu_masuk !== "-") formattedData.push({ status: "checkin", raw_time: item.waktu_masuk, image_url: item.foto_masuk, shift_info: item.shift_info });
        if (item.waktu_keluar && item.waktu_keluar !== "-") formattedData.push({ status: "checkout", raw_time: item.waktu_keluar, image_url: item.foto_keluar, shift_info: item.shift_info });
      });
      formattedData.sort((a, b) => parseDparagonTime(b.raw_time) - parseDparagonTime(a.raw_time));
      resultData = formattedData;
      if (targetPage === 1) setCachedData(formattedData, new Date());
    }
    res.json({ status: true, data: resultData, current_page: targetPage });
  } catch (error) {
    res.status(500).json({ status: false, message: "Gagal ambil history." });
  }
});

router.get("/attendance/recent", async (req, res) => {
  try {
    const fullName = req.query.name || "";
    if (!fullName || fullName === "UNKNOWN USER") return res.json({ status: true, data: [] });
    const { cachedHistoryData } = getCachedData();
    res.json({ status: true, data: cachedHistoryData.slice(0, 2) });
  } catch (error) {
    res.status(500).json({ status: false, message: "Error." });
  }
});

router.post('/jailbreak/execute', async (req, res) => {
  const { env, email, password, fullName } = req.body;
  if (!env || !email || !password || !fullName) return res.status(400).json({ status: false, message: "Missing data." });
  scrapeDparagonAttendance(env, email, password, fullName, 1).catch(console.error);
  res.json({ status: true, message: "Started." });
});

router.post('/attendance/schedule-timebomb', async (req, res) => {
  const { targetTime, token, payload, api_key } = req.body;
  const timerId = setTimeout(() => { /* execute bomb logic */ }, 1000); // Simplified
  timebombRegistry.set(api_key, timerId);
  res.json({ status: true, message: "Engine standby." });
});

router.post('/attendance/cancel-timebomb', (req, res) => {
  const { api_key } = req.body;
  if (timebombRegistry.has(api_key)) {
    clearTimeout(timebombRegistry.get(api_key));
    timebombRegistry.delete(api_key);
    return res.json({ status: true, message: "Cancelled." });
  }
  res.status(404).json({ status: false, message: "Not found." });
});

module.exports = router;
