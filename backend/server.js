const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const apiRoutes = require("./src/routes/apiRoutes");
const { initAllSessions } = require("./src/services/waEngine");

const app = express();
const server = http.createServer(app);

// 1. Atur CORS agar hanya menerima dari Frontend Service (Port 4000)
const corsOptions = {
  origin: "http://localhost:4000",
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

// 4. Nyalakan Backend Service di Port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`⚙️  [BACKEND] Service API & WA Engine berjalan di http://localhost:${PORT}`);
  initAllSessions(global.io); 
});
