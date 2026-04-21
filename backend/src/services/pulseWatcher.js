'use strict';

const db = require('../config/database');
const { executeLCR } = require('./lcrEngine');

// Store active watchers: apiKey -> { identity, monitor, lastProcessedMessageId }
const activeWatchers = new Map();

/**
 * Log activity for the watcher
 */
function logWatcher(message, type = 'info') {
    console.log(`[PULSE-WATCHER] ${message}`);
    if (global.io) {
        global.io.emit('pulse_log', {
            message,
            type,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false })
        });
    }
}

/**
 * Handle incoming WhatsApp message for Pulse Automation
 */
async function handleIncomingPulseMessage(apiKey, msg) {
    if (!activeWatchers.has(apiKey)) return;

    const watcher = activeWatchers.get(apiKey);
    const { monitor, identity } = watcher;

    // Check if message is from the monitored group
    if (msg.key.remoteJid !== monitor.monitorId) return;

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (!text) return;

    // Extract links (Instagram & TikTok)
    const links = text.match(/https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\/[^\s]+/g);
    if (!links || links.length === 0) return;

    logWatcher(`🔍 Terdeteksi ${links.length} link dari grup monitor.`, 'info');

    // Extract comments (Lines that don't look like links)
    const comments = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('http'));

    const payload = {
        links: links.join('\n'),
        comments: comments.join('\n')
    };

    logWatcher(`🚀 Memulai eksekusi otomatis untuk ${links.length} link...`, 'success');

    try {
        // Execute LCR in background
        // Note: For Auto-mode, we usually use stealth/phantom mode by default
        await executeLCR(identity, payload, { stealthMode: true });
        
        logWatcher(`✅ Eksekusi otomatis selesai.`, 'success');
    } catch (err) {
        logWatcher(`❌ Gagal eksekusi otomatis: ${err.message}`, 'error');
    }
}

/**
 * Activate a watcher for a specific device
 */
function activateWatcher(apiKey, identity, monitor) {
    activeWatchers.set(apiKey, { identity, monitor });
    logWatcher(`🤖 Watcher diaktifkan untuk device ${apiKey} pada grup ${monitor.monitorId}`, 'success');
    return true;
}

/**
 * Deactivate a watcher
 */
function deactivateWatcher(apiKey) {
    if (activeWatchers.has(apiKey)) {
        activeWatchers.delete(apiKey);
        logWatcher(`⏹️ Watcher dinonaktifkan untuk device ${apiKey}`, 'warning');
        return true;
    }
    return false;
}

module.exports = {
    handleIncomingPulseMessage,
    activateWatcher,
    deactivateWatcher
};
