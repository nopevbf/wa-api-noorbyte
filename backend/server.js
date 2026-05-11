require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const apiRoutes = require("./src/routes/apiRoutes");
const { initAllSessions } = require("./src/services/waEngine");
const appConfig = require("./src/config/appConfig");

const app = express();
const server = http.createServer(app);

// 1. Middleware & CORS
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "DELETE", "PUT"],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// 2. Setup Socket.io
global.io = new Server(server, {
  cors: corsOptions,
});

// 3. API Routes
app.use("/api", apiRoutes);

// 4. Static Frontend Assets
const frontendPath = path.join(__dirname, "../frontend/public");
app.use(express.static(frontendPath));

// ROUTE UNTUK HALAMAN UI
const uiPages = ["login", "dashboard", "devices", "groups", "tester", "automation", "verify", "jailbreak", "pulse"];
uiPages.forEach(page => {
    app.get(`/${page}`, (req, res) => res.sendFile(path.join(frontendPath, `${page}.html`)));
});
app.get("/jailbreak/checkin", (req, res) => res.sendFile(path.join(frontendPath, "checkin.html")));

// Extension Download Route
const { downloadExtensionZip } = require('./src/services/extensionService');
app.get('/api/extension/download', downloadExtensionZip);

// Default redirect & 404 handler
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  res.redirect("/login");
});

// 5. Start Server
const PORT = process.env.PORT || 4000;
let portRetryCount = 0;
const MAX_PORT_RETRIES = 3;

function startServer(port) {
  server.listen(port, () => {
    console.log(
      `⚙️  [BACKEND] Service API & WA Engine berjalan di http://localhost:${port}`,
    );
    console.log(
      `🌍 [ENV] Mode: ${appConfig.env.toUpperCase()} | DParagon API: ${appConfig.dparagonApiUrl}`,
    );
    initAllSessions(global.io);

    // 5. Start Automation Engine (background scheduler)
    const { startAutomationEngine } = require("./src/services/automationEngine");
    startAutomationEngine();
  });

  server.on("error", async (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️  [BACKEND] Port ${port} sedang dipakai! Mencoba kill proses lama...`);
      const { killPortProcess } = require("./src/helpers/portKiller");
      
      try {
        if (portRetryCount >= MAX_PORT_RETRIES) {
          console.error(`❌ [BACKEND] Max retries (${MAX_PORT_RETRIES}) reached for killing port ${port}. Please resolve manually.`);
          process.exit(1);
        }
        portRetryCount++;
        
        const killed = await killPortProcess(port);
        if (killed) {
          const backoffDelay = Math.pow(2, portRetryCount - 1) * 1000;
          console.log(`✅ [BACKEND] Proses di port ${port} berhasil dimatikan. Restart server dalam ${backoffDelay/1000} detik...`);
          setTimeout(() => startServer(port), backoffDelay);
        } else {
          console.error(`❌ [BACKEND] Gagal menemukan proses di port ${port}. Matikan manual lalu coba lagi.`);
          process.exit(1);
        }
      } catch (killErr) {
        console.error(`❌ [BACKEND] Gagal mematikan proses di port ${port}:`, killErr.message);
        process.exit(1);
      }
    } else {
      console.error("❌ [BACKEND] Server error:", err);
      process.exit(1);
    }
  });
}

startServer(PORT);

const attendanceController = require("./src/controllers/attendanceController");

app.get("/api/attendance/history", attendanceController.getHistory);
app.get("/api/attendance/recent", attendanceController.getRecent);
app.post("/api/jailbreak/execute", attendanceController.executeJailbreak);




// ==========================================
// PULSE LCR ENGINE ENDPOINTS
// ==========================================
const { executeLCR, getLcrStatus } = require('./src/services/lcrEngine');
const { activateWatcher } = require('./src/services/pulseWatcher');

// EXECUTE MANUAL LCR — Jalankan Like/Comment/Repost di background
const { z } = require("zod");

const executeManualSchema = z.object({
  identity: z.object({
    name: z.string().optional(),
    ig_email: z.string().optional(),
    ig_password: z.string().optional(),
    tt_email: z.string().optional(),
    tt_password: z.string().optional()
  }).passthrough(),
  payload: z.object({
    links: z.string().optional(),
    comments: z.string().optional()
  }).passthrough(),
  options: z.object({
    stealthMode: z.boolean().optional(),
    sessionId: z.string().optional()
  }).passthrough().optional()
});

app.post('/api/pulse/execute-manual', (req, res) => {
    try {
        const validated = executeManualSchema.parse(req.body);
        const { identity, payload, options } = validated;

        console.log(`😈 Menerima perintah LCR untuk: ${identity.name || 'Unknown'} | Phantom: ${options?.stealthMode}`);

        res.json({ status: 'success', message: 'Misi disuntikkan! Pantau Terminal.' });

        // 😈 Teruskan 'options' ke mesin eksekusi
        executeLCR(identity, payload, options).then(result => {
            console.log("Misi LCR Selesai di latar belakang!");
        }).catch(err => {
            console.error("LCR Background Error:", err.message);
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.warn(`[SECURITY] Invalid input detected in execute-manual:`, error.errors);
            return res.status(400).json({ status: false, message: 'Invalid Input Payload', errors: error.errors });
        }
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

// STATUS LCR — Polling dari frontend
app.get('/api/pulse/status', (req, res) => {
    const sessionId = req.query.sessionId || 'default';
    const status = getLcrStatus(sessionId);
    res.json({ status: true, data: status });
});

// ACTIVATE WATCHER (Auto-Parse mode)
app.post('/api/pulse/activate-watcher', (req, res) => {
    const { identity, monitor } = req.body;
    
    // Use first available device for now, or you could pass apiKey from frontend
    // For this implementation, we'll assume the frontend would want to use a specific device
    // but since Pulse UI doesn't have a device selector yet, we'll try to find one.
    const db = require('./src/config/database');
    const device = db.prepare("SELECT api_key FROM users WHERE status = 'Connected' LIMIT 1").get();
    
    if (!device) {
        return res.status(400).json({ status: false, message: 'Tidak ada device WA yang aktif (Connected).' });
    }

    const success = activateWatcher(device.api_key, identity, monitor);
    
    if (success) {
        res.json({ status: true, message: `The Watcher AKTIF pada grup: ${monitor.monitorId}` });
    } else {
        res.status(500).json({ status: false, message: 'Gagal mengaktifkan watcher.' });
    }
});

