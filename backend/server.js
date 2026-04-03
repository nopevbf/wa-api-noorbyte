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

