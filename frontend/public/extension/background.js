// Background Worker (Invisible)
let queue = [];
let currentComment = '';
let isRunning = false;
let currentTabId = null;
let currentUrl = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_TIKTOK_QUEUE') {
        queue = request.links;
        currentComment = request.comment;
        
        if (!isRunning) {
            isRunning = true;
            processNext();
        }
    } 
    else if (request.type === 'ACTIONS_DONE') {
        const results = request.results;
        sendLog(`Aksi selesai untuk: ${currentUrl}`, 'success');
        
        // Format result untuk dashboard
        const dashboardResult = {
            platform: 'tiktok',
            url: currentUrl,
            like: results.find(r => r.action === 'like') || {},
            comment: results.find(r => r.action === 'comment') || {},
            repost: results.find(r => r.action === 'repost') || {}
        };

        // Kirim progress ke Web UI
        broadcastToUI('PULSE_PROGRESS', dashboardResult);
        
        // Jeda bentar sebelum pindah link (Anti-bot)
        setTimeout(processNext, 5000);
    }
    else if (request.type === 'ACTIONS_ERROR') {
        sendLog(`Gagal di ${currentUrl}: ${request.error}`, 'error');
        broadcastToUI('PULSE_PROGRESS', { platform: 'tiktok', url: currentUrl, error: request.error });
        setTimeout(processNext, 5000);
    }
});

function broadcastToUI(action, payload) {
    chrome.tabs.query({url: ["http://localhost:*/*", "http://127.0.0.1:*/*"]}, function(tabs) {
        tabs.forEach(t => {
            chrome.tabs.sendMessage(t.id, { action, payload });
        });
    });
}

function sendLog(msg, type='info') {
    broadcastToUI('PULSE_LOG', { message: msg, type });
}

function processNext() {
    if (queue.length === 0) {
        isRunning = false;
        sendLog('🔥 Semua link TikTok selesai dieksekusi secara lokal!', 'success');
        broadcastToUI('QUEUE_DONE', {});
        return;
    }
    
    currentUrl = queue.shift();
    sendLog(`[EXT] Membuka tab Chrome untuk: ${currentUrl}`, 'info');
    
    chrome.tabs.create({ url: currentUrl, active: true }, (tab) => {
        currentTabId = tab.id;
        
        // Wait for content script to be ready
        let checkReady = setInterval(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
                if (response && response.ok) {
                    clearInterval(checkReady);
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'RUN_ACTIONS',
                        comment: currentComment
                    });
                }
            });
        }, 1000);
        
        // Safety timeout (30s)
        setTimeout(() => clearInterval(checkReady), 30000);
    });
}
