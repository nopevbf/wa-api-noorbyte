const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

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

// Redirect default ke devices
app.get("*", (req, res) => {
  res.redirect("/login");
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🖥️  [FRONTEND] UI Service berjalan di http://localhost:${PORT}`);
});
