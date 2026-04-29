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
const uiPages = ["login", "dashboard", "devices", "groups", "tester", "automation", "verify", "jailbreak"];
uiPages.forEach(page => {
    app.get(`/${page}`, (req, res) => res.sendFile(path.join(frontendPath, `${page}.html`)));
});
app.get("/jailbreak/checkin", (req, res) => res.sendFile(path.join(frontendPath, "checkin.html")));

// Default redirect & 404 handler
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  res.redirect("/login");
});

// 5. Start Server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`⚙️  [BACKEND] Service API & WA Engine berjalan di http://localhost:${PORT}`);
  console.log(`🌍 [ENV] Mode: ${appConfig.env.toUpperCase()} | DParagon API: ${appConfig.dparagonApiUrl}`);
  
  // Initialize sessions
  initAllSessions(global.io);

  // Start Automation Engine
  const { startAutomationEngine } = require("./src/services/automationEngine");
  startAutomationEngine();
});
