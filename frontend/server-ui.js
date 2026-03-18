const express = require('express');
const path = require('path');

const app = express();

// Sajikan folder 'public' sebagai statis
app.use(express.static(path.join(__dirname, 'public')));

// Semua request diarahkan ke devices.html (Konsep Single Page Application)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'devices.html'));
});

// Nyalakan Frontend Service di Port 4000
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🖥️  [FRONTEND] UI Service berjalan di http://localhost:${PORT}`);
});