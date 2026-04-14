require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const apiRoutes = require("./src/routes/apiRoutes");
const { initAllSessions } = require("./src/services/waEngine");
const path = require("path");

const app = express();
const server = http.createServer(app);

// 1. Atur CORS agar menerima dari manapun selama kita pakai proxy/cloudflared
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "DELETE", "PUT"],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// 2. Setup Socket.io dengan CORS yang sama
global.io = new Server(server, {
  cors: corsOptions,
});

// 3. Daftarkan API Routes dengan prefix '/api' biar rapi
app.use("/api", apiRoutes);

// --- TAMBAHAN: Sajikan Frontend UI di Port yang Sama ---
const frontendPath = path.join(__dirname, "../frontend/public");
app.use(express.static(frontendPath));

// ROUTE UNTUK HALAMAN UI
app.get("/login", (req, res) =>
  res.sendFile(path.join(frontendPath, "login.html")),
);
app.get("/dashboard", (req, res) =>
  res.sendFile(path.join(frontendPath, "dashboard.html")),
);
app.get("/devices", (req, res) =>
  res.sendFile(path.join(frontendPath, "devices.html")),
);
app.get("/groups", (req, res) =>
  res.sendFile(path.join(frontendPath, "groups.html")),
);
app.get("/tester", (req, res) =>
  res.sendFile(path.join(frontendPath, "tester.html")),
);
app.get("/automation", (req, res) =>
  res.sendFile(path.join(frontendPath, "automation.html")),
);
app.get("/verify", (req, res) =>
  res.sendFile(path.join(frontendPath, "verify.html")),
);
app.get("/jailbreak", (req, res) =>
  res.sendFile(path.join(frontendPath, "jailbreak.html")),
);
app.get("/jailbreak/checkin", (req, res) =>
  res.sendFile(path.join(frontendPath, "checkin.html")),
);

// Redirect sisanya ke login jika bukan request ke API
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io"))
    return next();
  res.redirect("/login");
});
// ---------------------------------------------------------

// 4. Nyalakan Backend Service (Port dari ENV, fallback ke 4000)
const PORT = process.env.PORT || 4000;
const appConfig = require("./src/config/appConfig");

server.listen(PORT, () => {
  console.log(
    `⚙️  [BACKEND] Service API & WA Engine berjalan di http://localhost:${PORT}`,
  );
  console.log(
    `🌍 [ENV] Mode: ${appConfig.env.toUpperCase()} | DParagon API: ${appConfig.dparagonApiUrl}`,
  );
  initAllSessions(global.io);

  // 5. Start Automation Engine (background scheduler)
  const { startAutomationEngine } = require("./src/services/automationEngine");
  startAutomationEngine();
});

const {
  scrapeDparagonAttendance,
} = require("../frontend/public/js/scapper.js");

// Variabel global buat nyimpen hasil scrape sementara (HANYA UNTUK PAGE 1)
let cachedHistoryData = [];
let lastScrapeTime = null;

// ==========================================
// ENDPOINT: HISTORY FULL LOG (PAGINATED)
// ==========================================
app.get("/api/attendance/history", async (req, res) => {
  try {
    const targetPage = parseInt(req.query.page) || 1;
    const fullName = req.query.name || "";

    // ==========================================
    // SQA GUARD: STOP MESIN KALAU BELUM LOGIN!
    // ==========================================
    if (!fullName || fullName.trim() === "" || fullName === "UNKNOWN USER") {
      console.log(
        `[SYSTEM] 🛑 Blokir Akses History Page ${targetPage}: Menunggu User Login...`,
      );
      return res.json({
        status: true,
        message: "Standby: Menunggu Otorisasi User",
        data: [], // Kirim array kosong biar UI gak error
        current_page: targetPage,
      });
    }

    console.log(`[SYSTEM] Menarik data riwayat untuk Page: ${targetPage}`);

    let resultData = [];
    const isCacheExpired =
      !lastScrapeTime || new Date() - lastScrapeTime > 5 * 60 * 1000;

    // LOGIKA CACHE: Gunakan cache HANYA jika memanggil Page 1 dan cache masih fresh
    if (targetPage === 1 && cachedHistoryData.length > 0 && !isCacheExpired) {
      console.log("[SYSTEM] Menggunakan cache data untuk Page 1...");
      resultData = cachedHistoryData;
    } else {
      console.log(
        `[SYSTEM] Memulai Scraping Data Langsung untuk Page ${targetPage}...`,
      );

      // ==========================================
      // PERBAIKAN SQA: INJECT 5 PARAMETER LENGKAP!
      // ==========================================
      const env = process.env.NODE_ENV || "development";
      const email =
        env === "production"
          ? process.env.DPARAGON_EMAIL
          : process.env.DPARAGON_EMAIL_DEV;
      const password =
        env === "production"
          ? process.env.DPARAGON_PASSWORD
          : process.env.DPARAGON_PASSWORD_DEV;

      // Panggil fungsi dengan formasi lengkap: (env, email, password, fullName, targetPage)
      const rawData = await scrapeDparagonAttendance(
        env,
        email,
        password,
        fullName,
        targetPage,
      );

      let formattedData = [];

      // MAPPING DATA
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

      // MAGIC SORT: URUTKAN TERBARU KE TERLAMA
      formattedData.sort((a, b) => {
        const timeA = parseDparagonTime(a.raw_time);
        const timeB = parseDparagonTime(b.raw_time);
        return timeB - timeA;
      });

      resultData = formattedData;

      // PERBARUI CACHE HANYA JIKA INI PAGE 1
      if (targetPage === 1) {
        console.log(
          `[DATABASE] Memperbarui cache dengan ${formattedData.length} data terbaru...`,
        );
        cachedHistoryData = formattedData;
        lastScrapeTime = new Date();
      }
    }

    // KIRIM KE FRONTEND: Langsung kirim 1 halaman utuh dari DParagon!
    res.json({
      status: true,
      data: resultData,
      current_page: targetPage,
    });
  } catch (error) {
    console.error("Route History Error:", error);
    res
      .status(500)
      .json({ status: false, message: "Gagal mengambil log sistem target." });
  }
});

// ==========================================
// ENDPOINT: RECENT LOGS WIDGET (DASHBOARD)
// ==========================================
app.get("/api/attendance/recent", async (req, res) => {
  try {
    const forceSync = req.query.force === "true";
    const fullName = req.query.name || "";

    // ==========================================
    // SQA GUARD: STOP MESIN KALAU BELUM LOGIN!
    // ==========================================
    if (!fullName || fullName.trim() === "" || fullName === "UNKNOWN USER") {
      console.log("[SYSTEM] 🛑 Blokir Akses Widget: Menunggu User Login...");
      return res.json({ status: true, data: [] }); // Balikin kosong aja buat widget
    }

    const isCacheExpired =
      !lastScrapeTime || new Date() - lastScrapeTime > 5 * 60 * 1000;

    // Kalau dipaksa ATAU cache kosong ATAU cache kadaluarsa -> JALANKAN PUPPETEER PAGE 1
    if (forceSync || cachedHistoryData.length === 0 || isCacheExpired) {
      console.log(
        forceSync
          ? "[SYSTEM] FORCE SYNC DETECTED! Membangunkan robot..."
          : "[SYSTEM] Cache expired/kosong, memulai scraping...",
      );

      // 1. Definisikan dulu environment-nya
      const env = process.env.NODE_ENV || "development";

      // 2. Tarik kredensial dari .env sesuai env-nya
      const email =
        env === "production"
          ? process.env.DPARAGON_EMAIL
          : process.env.DPARAGON_EMAIL_DEV;
      const password =
        env === "production"
          ? process.env.DPARAGON_PASSWORD
          : process.env.DPARAGON_PASSWORD_DEV;

      // 3. Panggil fungsi dengan 5 PARAMETER LENGKAP secara berurutan!
      const rawData = await scrapeDparagonAttendance(
        env,
        email,
        password,
        fullName,
        1,
      );
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

      formattedData.sort((a, b) => {
        const timeA = parseDparagonTime(a.raw_time);
        const timeB = parseDparagonTime(b.raw_time);
        return timeB - timeA;
      });

      cachedHistoryData = formattedData;
      lastScrapeTime = new Date();
    }

    // WIDGET HANYA BUTUH 2 DATA PALING ATAS
    const recentLogs = cachedHistoryData.slice(0, 2);
    res.json({ status: true, data: recentLogs });
  } catch (error) {
    console.error("Recent Widget Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// ==========================================
// ENDPOINT: TRIGGER SCRAPER (DIPANGGIL SETELAH LOGIN SUKSES)
// ==========================================
app.post("/api/jailbreak/execute", async (req, res) => {
  try {
    const { env, email, password, fullName } = req.body;

    console.log(`[TRIGGER] 🚀 Menerima perintah Bypass untuk: ${fullName}`);

    if (!env || !email || !password || !fullName) {
      console.error("[TRIGGER] ❌ Data tidak lengkap!");
      return res
        .status(400)
        .json({ status: false, message: "Payload Incomplete" });
    }

    // JALANKAN DI BACKGROUND (Tanpa await biar Frontend gak nungguin)
    scrapeDparagonAttendance(env, email, password, fullName, 1)
      .then(() =>
        console.log(`[SYSTEM] ✅ Auto-scrape sukses untuk ${fullName}`),
      )
      .catch((err) => console.error(`[SYSTEM] ❌ Auto-scrape gagal:`, err));

    res.json({ status: true, message: "Engine Started in Background" });
  } catch (error) {
    console.error("Execute Route Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// ==========================================
// HELPER: TRANSLATOR WAKTU INDO -> TIMESTAMP (FIXED SQA APPROVED)
// ==========================================
function parseDparagonTime(rawTime) {
  if (!rawTime || rawTime === "-") return 0;

  // 1. Bersihkan (WIB)
  let rawStr = String(rawTime)
    .replace(/\(WIB\)/gi, "")
    .trim();

  // 2. Ekstrak Jam (Pakai Regex sapu jagat)
  const timeMatch = rawStr.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  let timePart = "00:00:00";
  if (timeMatch) {
    timePart = timeMatch[0]; // Dapat "16:02:31"
  }

  // 3. Ekstrak Tanggal (Buang Jam, Buang Nama Hari "Kamis,")
  let datePart = rawStr
    .replace(timePart, "")
    .replace(/^[a-zA-Z]+,\s+/i, "")
    .trim();

  // 4. Ratakan spasi dan enter yang nyangkut
  datePart = datePart
    .replace(/[\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // 5. Translate Bulan Indo -> Eng biar bisa dibaca Node.js
  const bulanId = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const bulanEn = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  bulanId.forEach((id, index) => {
    datePart = datePart.replace(new RegExp(id, "gi"), bulanEn[index]);
  });

  // 6. Gabungkan jadi format standar (Misal: "02 April 2026 16:02:31")
  const finalDateTimeStr = `${datePart} ${timePart}`;
  const parsedDate = new Date(finalDateTimeStr).getTime();

  // Kembalikan Timestamp (Angka milidetik), kalau masih gagal kembalikan 0
  return isNaN(parsedDate) ? 0 : parsedDate;
}
