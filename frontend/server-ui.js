const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

// =========================================
// API & SOCKET PROXY (FORWARD KE BACKEND PORT 3000)
// =========================================
const { createProxyMiddleware } = require('http-proxy-middleware');

const backendProxy = createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  ws: true
});

app.use((req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
    return backendProxy(req, res, next);
  }
  next();
});


// ROUTE UNTUK HALAMAN LOGIN
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ROUTE BARU UNTUK DASHBOARD UTAMA
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Routing Spesifik
app.get("/devices", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "devices.html"));
});

app.get("/groups", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "groups.html"));
});

app.get("/tester", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tester.html"));
});

// ROUTE BARU UNTUK DAILY REPORTS
app.get("/automation", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "automation.html"));
});

// ROUTE BARU UNTUK PULSE
app.get('/pulse', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "pulse.html")); 
});

// LCR execution logic has been moved to backend (server.js)
// This frontend server will proxy /api calls to the backend via the middleware above.


// ROUTE UNTUK HALAMAN JAILBREAK
app.get('/jailbreak', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jailbreak.html'));
});

// ROUTE UNTUK HALAMAN CHECK-IN (BARU)
app.get('/jailbreak/checkin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

// ROUTE UNTUK PROSES VERIFIKASI MAGIC LINK
app.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verify.html"));
});

// Redirect default ke devices
app.get("*", (req, res) => {
  res.redirect("/login");
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🖥️  [FRONTEND] UI Service berjalan di http://localhost:${PORT}`);
});
