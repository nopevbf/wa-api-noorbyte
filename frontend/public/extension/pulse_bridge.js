// Berjalan di halaman localhost:4000
console.log("[Pulse Bridge] Extension terpasang di Web UI.");

// Memberi sinyal ke Web UI bahwa Extension Aktif
document.documentElement.setAttribute('data-pulse-extension', 'installed');

// Menerima perintah dari Web UI (pulse.js)
window.addEventListener('PULSE_EXECUTE_TIKTOK', (e) => {
    const { links, comment } = e.detail;
    console.log("[Pulse Bridge] Menerima tugas dari UI:", links.length, "link");
    
    // Teruskan ke Background Worker
    try {
        chrome.runtime.sendMessage({ action: 'START_TIKTOK_QUEUE', links, comment });
    } catch(err) {
        console.error("Gagal mengirim pesan ke extension. Pastikan extension aktif.", err);
    }
});

// Meneruskan progress dan log dari Background ke Web UI
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PULSE_LOG') {
        window.dispatchEvent(new CustomEvent('PULSE_EXT_LOG', { detail: msg.payload }));
    } else if (msg.action === 'PULSE_PROGRESS') {
        window.dispatchEvent(new CustomEvent('PULSE_EXT_PROGRESS', { detail: msg.payload }));
    }
});
