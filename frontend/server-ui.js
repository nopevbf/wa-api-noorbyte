const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Routing Spesifik
app.get('/devices', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'devices.html'));
});

app.get('/groups', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'groups.html'));
});

app.get('/tester', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tester.html'));
});

// Redirect default ke devices
app.get('*', (req, res) => {
    res.redirect('/devices');
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🖥️  [FRONTEND] UI Service berjalan di http://localhost:${PORT}`);
});