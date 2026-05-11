const { scrapeDparagonAttendance } = require("../services/scraper");

let cachedHistoryData = [];
let lastScrapeTime = null;

function parseDparagonTime(rawTime) {
  if (!rawTime || rawTime === "-") return 0;

  let rawStr = String(rawTime)
    .replace(/\(WIB\)/gi, "")
    .trim();

  const timeMatch = rawStr.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  let timePart = "00:00:00";
  if (timeMatch) {
    timePart = timeMatch[0];
  }

  let datePart = rawStr
    .replace(timePart, "")
    .replace(/^[a-zA-Z]+,\s+/i, "")
    .trim();

  datePart = datePart
    .replace(/[\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const bulanId = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const bulanEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  bulanId.forEach((id, index) => {
    datePart = datePart.replace(new RegExp(id, "gi"), bulanEn[index]);
  });

  const finalDateTimeStr = `${datePart} ${timePart}`;
  const parsedDate = new Date(finalDateTimeStr).getTime();

  return isNaN(parsedDate) ? 0 : parsedDate;
}

async function getHistory(req, res) {
  try {
    const targetPage = parseInt(req.query.page) || 1;
    const fullName = req.query.name || "";

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
    const fullName = req.query.name || "";

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

    console.log(`[TRIGGER] 🚀 Menerima perintah Bypass untuk: ${fullName}`);

    if (!env || !email || !password || !fullName) {
      console.error("[TRIGGER] ❌ Data tidak lengkap!");
      return res.status(400).json({ status: false, message: "Payload Incomplete" });
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
