// Berjalan di halaman localhost:4000
console.log("[Pulse Bridge] Extension terpasang di Web UI.");

// Memberi sinyal ke Web UI bahwa Extension Aktif
document.documentElement.setAttribute('data-pulse-extension', 'installed');

// Menerima perintah dari Web UI (pulse.js)
window.addEventListener('PULSE_EXECUTE_TIKTOK', (e) => {
    const { links, comment, mode } = e.detail;
    console.log("[Pulse Bridge] Menerima tugas dari UI:", links.length, "link", "Mode:", mode);
    
    // Teruskan ke Background Worker
    try {
        chrome.runtime.sendMessage({ action: 'START_TIKTOK_QUEUE', links, comment, mode }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Pulse Bridge] Runtime Error:", chrome.runtime.lastError.message);
                window.dispatchEvent(new CustomEvent('PULSE_EXT_LOG', { 
                    detail: { message: "❌ Koneksi Extension terputus. Silakan refresh halaman Pulse.", type: 'error' } 
                }));
            }
        });
    } catch(err) {
        console.error("Gagal mengirim pesan ke extension. Pastikan extension aktif.", err);
        window.dispatchEvent(new CustomEvent('PULSE_EXT_LOG', { 
            detail: { message: "❌ Extension Error. Silakan muat ulang extension di chrome://extensions", type: 'error' } 
        }));
    }
});

// Meneruskan progress dan log dari Background ke Web UI
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PULSE_LOG') {
        window.dispatchEvent(new CustomEvent('PULSE_EXT_LOG', { detail: msg.payload }));
    } else if (msg.action === 'PULSE_PROGRESS') {
        window.dispatchEvent(new CustomEvent('PULSE_EXT_PROGRESS', { detail: msg.payload }));
    } else if (msg.action === 'PULSE_EXT_DONE') {
        window.dispatchEvent(new CustomEvent('PULSE_EXT_DONE', { detail: msg.payload }));
    }
});
