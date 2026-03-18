const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http'); // Tambahan: Library HTTP bawaan Node.js
const { Server } = require('socket.io'); // Tambahan: Socket.io Server

// Panggil file buatan kita
const db = require('./src/config/database');
const apiRoutes = require('./src/routes/apiRoutes');
const { initAllSessions } = require('./src/services/waEngine');

const app = express();
const server = http.createServer(app); // Hubungkan Express dengan HTTP Server

// Setup Socket.io Global
// Kita taruh di global biar bisa dipanggil dari file mana aja (terutama waEngine.js)
global.io = new Server(server, {
    cors: {
        origin: "*", // Izinkan koneksi socket dari mana aja (untuk development)
        methods: ["GET", "POST"]
    }
});

// Middleware Global
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ROUTING HALAMAN WEB (FRONT-END)
// ==========================================
// 1. Redirect root URL (/) otomatis ke menu /devices
app.get('/', (req, res) => {
    res.redirect('/devices'); 
});

// 2. Route untuk menu Devices
app.get('/devices', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'devices.html'));
});

// Daftarin semua route API Backend
app.use('/api', apiRoutes); // Opsi: lo bisa ubah ini kalau mau API route-nya pakai prefix /api biar makin rapi, tapi untuk sekarang biarin app.use('/', apiRoutes) aja sesuai kode lama lo biar gak error.
app.use('/', apiRoutes);

const PORT = 3000;

// Jalankan server pakai 'server.listen', bukan 'app.listen'
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    
    // Kirim objek 'io' ke waEngine saat inisialisasi sesi
    initAllSessions(global.io); 
});