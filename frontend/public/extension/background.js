// Background Worker (MV3 Service Worker)
// State harus disimpan di storage agar tidak hilang saat service worker inactive

const saveState = (data) => chrome.storage.local.set(data);
const getState = () => chrome.storage.local.get(['queue', 'currentComment', 'currentMode', 'isRunning', 'currentTabId', 'currentWindowId', 'currentUrl']);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_TIKTOK_QUEUE') {
        const state = {
            queue: request.links || [],
            currentComment: request.comment || '',
            currentMode: request.mode || 'tab',
            isRunning: true,
            currentUrl: null,
            currentTabId: null,
            currentWindowId: null
        };
        saveState(state).then(() => {
            processNext();
        });
        sendResponse({ status: 'started' });
    } 
    else if (request.type === 'LOG') {
        sendLog(request.message, request.logType || 'info');
        sendResponse({ ok: true });
    }
    else if (request.type === 'ACTIONS_DONE') {
        sendResponse({ ok: true });
        handleActionsDone(request.results);
    }
    else if (request.type === 'ACTIONS_ERROR') {
        sendResponse({ ok: true });
        handleActionsError(request.error);
    }
    return true; 
});

// Gunakan Alarms untuk menggantikan setTimeout agar bisa bangunkan Service Worker
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'next_process') {
        processNext();
    }
});

async function handleActionsDone(results) {
    const state = await getState();
    sendLog(`Aksi selesai untuk: ${state.currentUrl}. Mengambil screenshot...`, 'success');
    
    if (state.currentMode === 'window' && state.currentWindowId) {
        // Mode window: Biarkan di background, tidak perlu mencuri fokus aplikasi (silent capture)
        setTimeout(() => captureAndNext(state, results), 500);
    } else if (state.currentTabId) {
        // Mode tab: simpan tab aktif user saat ini
        chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
            const originalTabId = (activeTabs && activeTabs.length > 0 && activeTabs[0].id !== state.currentTabId) ? activeTabs[0].id : null;
            
            // Pindah sebentar ke tab TikTok untuk jepret, lalu balik lagi tanpa disadari
            chrome.tabs.update(state.currentTabId, { active: true }, (tab) => {
                setTimeout(() => {
                    chrome.tabs.captureVisibleTab(tab && tab.windowId ? tab.windowId : null, { format: 'png' }, (dataUrl) => {
                        // Switch back segera ke tab awal!
                        if (originalTabId) {
                            chrome.tabs.update(originalTabId, { active: true }).catch(()=>{});
                        }
                        captureAndNext(state, results, dataUrl);
                    });
                }, 300);
            });
        });
    } else {
        captureAndNext(state, results);
    }
}

function captureAndNext(state, results, preCapturedDataUrl = undefined) {
    const processResult = (dataUrl) => {
        if (chrome.runtime.lastError) {
            sendLog(`⚠️ Screenshot info: ${chrome.runtime.lastError.message}`, 'warning');
        }
        
        const dashboardResult = {
            platform: 'tiktok',
            url: state.currentUrl,
            screenshot: dataUrl || null,
            like: results.find(r => r.action === 'like') || {},
            comment: results.find(r => r.action === 'comment') || {},
            repost: results.find(r => r.action === 'repost') || {}
        };

        broadcastToUI('PULSE_PROGRESS', dashboardResult);
        
        // Tutup tab/window
        setTimeout(() => {
            if (state.currentMode === 'window' && state.currentWindowId) {
                chrome.windows.remove(state.currentWindowId).catch(() => {});
            } else if (state.currentTabId) {
                chrome.tabs.remove(state.currentTabId).catch(() => {});
            }
        }, 1000);

        // Jadwalkan link berikutnya menggunakan ALARM (Min 1 menit untuk alarm standar, tapi delay minimal di dev bisa lebih cepat)
        // Kita pakai delay minimal ~5-6 detik
        chrome.alarms.create('next_process', { delayInMinutes: 0.1 }); 
    };

    if (preCapturedDataUrl !== undefined) {
        processResult(preCapturedDataUrl);
    } else {
        chrome.tabs.captureVisibleTab(state.currentWindowId || null, { format: 'png' }, processResult);
    }
}

async function handleActionsError(error) {
    const state = await getState();
    sendLog(`Gagal di ${state.currentUrl}: ${error}`, 'error');
    broadcastToUI('PULSE_PROGRESS', { platform: 'tiktok', url: state.currentUrl, error: error });
    
    if (state.currentMode === 'window' && state.currentWindowId) {
        chrome.windows.remove(state.currentWindowId).catch(() => {});
    } else if (state.currentTabId) {
        chrome.tabs.remove(state.currentTabId).catch(() => {});
    }

    chrome.alarms.create('next_process', { delayInMinutes: 0.1 });
}

async function processNext() {
    const state = await getState();
    let { queue, currentMode, currentComment } = state;

    if (!queue || queue.length === 0) {
        await saveState({ isRunning: false });
        sendLog('🔥 Semua link TikTok selesai dieksekusi secara lokal!', 'success');
        broadcastToUI('PULSE_EXT_DONE', {});
        return;
    }
    
    const nextUrl = queue.shift();
    await saveState({ queue, currentUrl: nextUrl });

    sendLog(`[EXT] Membuka ${currentMode === 'window' ? 'Jendela' : 'Tab'} untuk: ${nextUrl}`, 'info');
    
    if (currentMode === 'window') {
        chrome.windows.create({ url: nextUrl, focused: true, width: 1280, height: 850 }, (win) => {
            const tid = win.tabs[0].id;
            saveState({ currentWindowId: win.id, currentTabId: tid });
            setupTabListener(tid, currentComment);
        });
    } else {
        chrome.tabs.create({ url: nextUrl, active: true }, (tab) => {
            saveState({ currentTabId: tab.id, currentWindowId: null });
            setupTabListener(tab.id, currentComment);
        });
    }
}

function setupTabListener(tabId, comment) {
    let attempts = 0;
    const maxAttempts = 30; // 60 detik (2000ms * 30)
    
    let checkReady = setInterval(() => {
        attempts++;
        chrome.tabs.sendMessage(tabId, { type: 'RUN_ACTIONS', comment }, (response) => {
            if (response && response.received) {
                clearInterval(checkReady);
                sendLog(`[EXT] Content script terdeteksi. Menjalankan misi...`, 'success');
            } else {
                if (chrome.runtime.lastError) { /* ignore loading errors */ }
                if (attempts >= maxAttempts) {
                    clearInterval(checkReady);
                    sendLog(`[EXT] Timeout menunggu content script di tab ${tabId}.`, 'error');
                    chrome.alarms.create('next_process', { delayInMinutes: 0.1 });
                }
            }
        });
    }, 2000);
}

function broadcastToUI(action, payload) {
    chrome.tabs.query({url: ["http://localhost:*/*", "http://127.0.0.1:*/*"]}, function(tabs) {
        tabs.forEach(t => {
            chrome.tabs.sendMessage(t.id, { action, payload }).catch(() => {});
        });
    });
}

function sendLog(msg, type='info') {
    broadcastToUI('PULSE_LOG', { message: msg, type });
}
