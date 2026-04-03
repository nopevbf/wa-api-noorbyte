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
  methods: ["GET", "POST", "DELETE", "PUT"]
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 2. Setup Socket.io dengan CORS yang sama
global.io = new Server(server, {
  cors: corsOptions
});

// 3. Daftarkan API Routes dengan prefix '/api' biar rapi
app.use("/api", apiRoutes);

// --- TAMBAHAN: Sajikan Frontend UI di Port yang Sama ---
const frontendPath = path.join(__dirname, "../frontend/public");
app.use(express.static(frontendPath));

// ROUTE UNTUK HALAMAN UI
app.get("/login", (req, res) => res.sendFile(path.join(frontendPath, "login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(frontendPath, "dashboard.html")));
app.get("/devices", (req, res) => res.sendFile(path.join(frontendPath, "devices.html")));
app.get("/groups", (req, res) => res.sendFile(path.join(frontendPath, "groups.html")));
app.get("/tester", (req, res) => res.sendFile(path.join(frontendPath, "tester.html")));
app.get("/automation", (req, res) => res.sendFile(path.join(frontendPath, "automation.html")));
app.get("/verify", (req, res) => res.sendFile(path.join(frontendPath, "verify.html")));

// Redirect sisanya ke login jika bukan request ke API
app.get("*", (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.redirect("/login");
});
// ---------------------------------------------------------

// 4. Nyalakan Backend Service di Port 3000
const PORT = 3000;
const appConfig = require("./src/config/appConfig");

server.listen(PORT, () => {
  console.log(`⚙️  [BACKEND] Service API & WA Engine berjalan di http://localhost:${PORT}`);
  console.log(`🌍 [ENV] Mode: ${appConfig.env.toUpperCase()} | DParagon API: ${appConfig.dparagonApiUrl}`);
  initAllSessions(global.io);

  // 5. Start Automation Engine (background scheduler)
  const { startAutomationEngine } = require("./src/services/automationEngine");
  startAutomationEngine();
});

const { scrapeDparagonAttendance } = require('../frontend/public/js/scapper.js');

// Variabel global buat nyimpen hasil scrape sementara (Cache)
let cachedHistoryData = [];
let lastScrapeTime = null;

// Endpoint yang dipanggil oleh Frontend (View Full Log)
app.get('/api/attendance/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const fullName = req.query.name || ""; // Ambil nama dari query, default kosong

    // 1. CEK CACHE: Kalau page 1 atau cache kosong/kadaluarsa (lebih dari 5 menit), Scrape ulang!
    const isCacheExpired = !lastScrapeTime || (new Date() - lastScrapeTime > 5 * 60 * 1000);

    if (page === 1 || cachedHistoryData.length === 0 || isCacheExpired) {
      console.log("[SYSTEM] Memulai Scraping Data Terbaru...");
      const rawData = await scrapeDparagonAttendance(fullName);

      let formattedData = [];

      // MAPPING DATA
      rawData.forEach(item => {
        if (item.waktu_masuk && item.waktu_masuk !== '-') {
          formattedData.push({ status: 'checkin', raw_time: item.waktu_masuk, image_url: item.foto_masuk });
        }
        if (item.waktu_keluar && item.waktu_keluar !== '-') {
          formattedData.push({ status: 'checkout', raw_time: item.waktu_keluar, image_url: item.foto_keluar });
        }
      });

      // ==========================================
      // MAGIC SORT: URUTKAN TERBARU KE TERLAMA
      // ==========================================
      formattedData.sort((a, b) => {
        const timeA = parseDparagonTime(a.raw_time);
        const timeB = parseDparagonTime(b.raw_time);
        return timeB - timeA; // B kurang A = Descending (Terbaru di atas)
      });

      // ==========================================
      // INTEGRASI DATABASE: SIMPAN HASIL SCRAPE
      // ==========================================
      console.log(`[DATABASE] Menyimpan ${formattedData.length} data ke database user...`);

      // CONTOH JIKA LO PAKAI MySQL/PostgreSQL:
      /*
      for (const record of formattedData) {
          // Pakai INSERT IGNORE atau ON DUPLICATE KEY UPDATE biar gak dobel
          await db.query(`
              INSERT INTO user_attendance (user_id, status, raw_time, image_url) 
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE image_url = VALUES(image_url)
          `, [req.user.id, record.status, record.raw_time, record.image_url]);
      }
      */

      // CONTOH JIKA LO PAKAI MONGODB (Mongoose):
      /*
      for (const record of formattedData) {
          await AttendanceModel.updateOne(
              { user_id: req.user.id, raw_time: record.raw_time }, // Cari berdasarkan waktu yg unik
              { $set: { status: record.status, image_url: record.image_url } },
              { upsert: true } // Kalau blm ada bikin baru, kalau ada di-update
          );
      }
      */

      // Simpan ke Cache yang udah berurutan
      cachedHistoryData = formattedData;
      lastScrapeTime = new Date();
    }

    // 3. PAGINATION: Potong array sesuai Page dan Limit
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedData = cachedHistoryData.slice(startIndex, endIndex);

    // 4. KIRIM KE FRONTEND
    res.json({
      status: true,
      data: paginatedData
    });

  } catch (error) {
    console.error("Route History Error:", error);
    res.status(500).json({ status: false, message: "Gagal mengambil log sistem target." });
  }
});

// Endpoint khusus untuk widget Dashboard Depan (Mendukung Force Sync)
app.get('/api/attendance/recent', async (req, res) => {
  try {
    // Cek apakah frontend mengirim perintah paksa (force=true)
    const forceSync = req.query.force === 'true';
    const fullName = req.query.name || ""; // Ambil nama dari query, default kosong
    const isCacheExpired = !lastScrapeTime || (new Date() - lastScrapeTime > 5 * 60 * 1000);

    // Kalau dipaksa ATAU cache kosong ATAU cache kadaluarsa -> JALANKAN PUPPETEER!
    if (forceSync || cachedHistoryData.length === 0 || isCacheExpired) {
      console.log(forceSync ? "[SYSTEM] FORCE SYNC DETECTED! Membangunkan robot..." : "[SYSTEM] Cache expired/kosong, memulai scraping...");

      const rawData = await scrapeDparagonAttendance(fullName);
      let formattedData = [];

      // MAPPING DATA
      rawData.forEach(item => {
        if (item.waktu_masuk && item.waktu_masuk !== '-') {
          formattedData.push({ status: 'checkin', raw_time: item.waktu_masuk, image_url: item.foto_masuk });
        }
        if (item.waktu_keluar && item.waktu_keluar !== '-') {
          formattedData.push({ status: 'checkout', raw_time: item.waktu_keluar, image_url: item.foto_keluar });
        }
      });

      // ==========================================
      // MAGIC SORT: URUTKAN TERBARU KE TERLAMA
      // ==========================================
      formattedData.sort((a, b) => {
        const timeA = parseDparagonTime(a.raw_time);
        const timeB = parseDparagonTime(b.raw_time);
        return timeB - timeA; // B kurang A = Descending (Terbaru di atas)
      });

      // Simpan ke Cache yang udah berurutan
      cachedHistoryData = formattedData;
      lastScrapeTime = new Date();
    }

    // Ambil 2 data terbaru dari cache yang udah fresh
    const recentLogs = cachedHistoryData.slice(0, 2);
    res.json({ status: true, data: recentLogs });

  } catch (error) {
    console.error("Recent Widget Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// ==========================================
// HELPER: TRANSLATOR WAKTU INDO -> TIMESTAMP
// ==========================================
function parseDparagonTime(rawTime) {
  if (!rawTime || rawTime === '-') return 0;

  // Format mentah: "Rabu, 01 April 2026 \n 11:05:52 (WIB)"
  let timeStr = rawTime.replace(/\(WIB\)/gi, '').trim();

  // Buang nama hari "Rabu, " biar sisa tanggalnya aja
  timeStr = timeStr.replace(/^[a-zA-Z]+,\s+/i, '');

  // Translate bulan Indo ke Inggris biar dibaca sama fungsi Date() JavaScript
  const bulanId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const bulanEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  bulanId.forEach((id, index) => {
    timeStr = timeStr.replace(new RegExp(id, 'gi'), bulanEn[index]);
  });

  // Ratakan enter (\n) menjadi spasi
  timeStr = timeStr.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Ubah ke format Timestamp (Angka milidetik) biar bisa diurutkan
  const parsedDate = new Date(timeStr).getTime();
  return isNaN(parsedDate) ? 0 : parsedDate;
}