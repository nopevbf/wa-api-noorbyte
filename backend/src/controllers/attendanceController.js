const { scrapeDparagonAttendance } = require("../services/scraper");
const { parseDparagonTime } = require("../helpers/timeFormatter");

let cachedHistoryData = [];
let lastScrapeTime = null;

async function getHistory(req, res) {
  try {
    const targetPage = parseInt(req.query.page) || 1;
    let fullName = req.query.name;

    // Sanitization: Ensure fullName is a valid string
    if (typeof fullName !== "string") {
      fullName = "";
    }

    if (!fullName || fullName.trim() === "" || fullName === "UNKNOWN USER") {
      console.log(`[SYSTEM] 🛑 Blokir Akses History Page ${targetPage}: Menunggu User Login...`);
      return res.json({
        status: true,
        message: "Standby: Menunggu Otorisasi User",
        data: [],
        current_page: targetPage,
      });
    }

    console.log(`[SYSTEM] Menarik data riwayat untuk Page: ${targetPage}`);

    let resultData = [];
    const isCacheExpired = !lastScrapeTime || new Date() - lastScrapeTime > 5 * 60 * 1000;

    if (targetPage === 1 && cachedHistoryData.length > 0 && !isCacheExpired) {
      console.log("[SYSTEM] Menggunakan cache data untuk Page 1...");
      resultData = cachedHistoryData;
    } else {
      console.log(`[SYSTEM] Memulai Scraping Data Langsung untuk Page ${targetPage}...`);

      const env = process.env.NODE_ENV || "development";
      const email = env === "production" ? process.env.DPARAGON_EMAIL : process.env.DPARAGON_EMAIL_DEV;
      const password = env === "production" ? process.env.DPARAGON_PASSWORD : process.env.DPARAGON_PASSWORD_DEV;

      const rawData = await scrapeDparagonAttendance(env, email, password, fullName, targetPage);
      let formattedData = [];

      rawData.forEach((item) => {
        if (item.waktu_masuk && item.waktu_masuk !== "-") {
          formattedData.push({
            status: "checkin",
            raw_time: item.waktu_masuk,
            image_url: item.foto_masuk,
            shift_info: item.shift_info,
          });
        }
        if (item.waktu_keluar && item.waktu_keluar !== "-") {
          formattedData.push({
            status: "checkout",
            raw_time: item.waktu_keluar,
            image_url: item.foto_keluar,
            shift_info: item.shift_info,
          });
        }
      });

      formattedData.sort((a, b) => parseDparagonTime(b.raw_time) - parseDparagonTime(a.raw_time));

      resultData = formattedData;

      if (targetPage === 1) {
        console.log(`[DATABASE] Memperbarui cache dengan ${formattedData.length} data terbaru...`);
        cachedHistoryData = formattedData;
        lastScrapeTime = new Date();
      }
    }

    res.json({
      status: true,
      data: resultData,
      current_page: targetPage,
    });
  } catch (error) {
    console.error("Route History Error:", error);
    res.status(500).json({ status: false, message: "Gagal mengambil log sistem target." });
  }
}

async function getRecent(req, res) {
  try {
    const forceSync = req.query.force === "true";
    let fullName = req.query.name;

    // Sanitization: Ensure fullName is a valid string
    if (typeof fullName !== "string") {
      fullName = "";
    }

    if (!fullName || fullName.trim() === "" || fullName === "UNKNOWN USER") {
      console.log("[SYSTEM] 🛑 Blokir Akses Widget: Menunggu User Login...");
      return res.json({ status: true, data: [] });
    }

    const isCacheExpired = !lastScrapeTime || new Date() - lastScrapeTime > 5 * 60 * 1000;

    if (forceSync || cachedHistoryData.length === 0 || isCacheExpired) {
      console.log(
        forceSync ? "[SYSTEM] FORCE SYNC DETECTED! Membangunkan robot..." : "[SYSTEM] Cache expired/kosong, memulai scraping..."
      );

      const env = process.env.NODE_ENV || "development";
      const email = env === "production" ? process.env.DPARAGON_EMAIL : process.env.DPARAGON_EMAIL_DEV;
      const password = env === "production" ? process.env.DPARAGON_PASSWORD : process.env.DPARAGON_PASSWORD_DEV;

      const rawData = await scrapeDparagonAttendance(env, email, password, fullName, 1);
      let formattedData = [];

      rawData.forEach((item) => {
        if (item.waktu_masuk && item.waktu_masuk !== "-") {
          formattedData.push({
            status: "checkin",
            raw_time: item.waktu_masuk,
            image_url: item.foto_masuk,
            shift_info: item.shift_info,
          });
        }
        if (item.waktu_keluar && item.waktu_keluar !== "-") {
          formattedData.push({
            status: "checkout",
            raw_time: item.waktu_keluar,
            image_url: item.foto_keluar,
            shift_info: item.shift_info,
          });
        }
      });

      formattedData.sort((a, b) => parseDparagonTime(b.raw_time) - parseDparagonTime(a.raw_time));

      cachedHistoryData = formattedData;
      lastScrapeTime = new Date();
    }

    const recentLogs = cachedHistoryData.slice(0, 2);
    res.json({ status: true, data: recentLogs });
  } catch (error) {
    console.error("Recent Widget Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
}

async function executeJailbreak(req, res) {
  try {
    const { env, email, password, fullName } = req.body;

    // Sanitization: Ensure inputs are strings
    if (typeof env !== 'string' || typeof email !== 'string' || typeof password !== 'string' || typeof fullName !== 'string') {
      console.error("[TRIGGER] ❌ Tipe data input tidak valid!");
      return res.status(400).json({ status: false, message: "Invalid Input Type" });
    }

    console.log(`[TRIGGER] 🚀 Menerima perintah Bypass untuk: ${fullName}`);

    if (!env.trim() || !email.trim() || !password || !fullName.trim()) {
      console.error("[TRIGGER] ❌ Data tidak lengkap!");
      return res.status(400).json({ status: false, message: "Payload Incomplete" });
    }

    // Input Validation to prevent Command Injection / SQL Injection
    const maliciousPattern = /[;<>&|`\\]/g;
    if (maliciousPattern.test(fullName) || maliciousPattern.test(email) || maliciousPattern.test(env)) {
      console.error("[TRIGGER] ❌ Karakter tidak valid terdeteksi (Potensi Command Injection)!");
      return res.status(400).json({ status: false, message: "Invalid input characters detected" });
    }

    scrapeDparagonAttendance(env, email, password, fullName, 1)
      .then(() => console.log(`[SYSTEM] ✅ Auto-scrape sukses untuk ${fullName}`))
      .catch((err) => console.error(`[SYSTEM] ❌ Auto-scrape gagal:`, err));

    res.json({ status: true, message: "Engine Started in Background" });
  } catch (error) {
    console.error("Execute Route Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
}

module.exports = {
  getHistory,
  getRecent,
  executeJailbreak
};
