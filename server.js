const express = require("express");
const cors = require("cors");
const path = require("path");

// Panggil file buatan kita
const apiRoutes = require("./src/routes/apiRoutes");
const { initAllSessions } = require("./src/services/waEngine");

const app = express();

// Middleware Global
app.use(cors());
app.use(express.json());

// Mengubah folder 'public' menjadi website statis
// Jadi saat lo buka http://localhost:3000, dia bakal nampilin index.html lo
app.use(express.static(path.join(__dirname, "public")));

// Daftarin semua route API
app.use("/", apiRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  initAllSessions(); // Nyalakan mesin WA saat server start
});
