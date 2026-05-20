# Real-time AI Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menampilkan aktivitas AI secara real-time di halaman Auto Reply khusus untuk perangkat yang dipilih.

**Architecture:** Menggunakan Socket.io untuk mengirim event `ai_activity_log` dari Backend (`waEngine.js`) ke Frontend. Frontend akan memfilter log berdasarkan `apiKey` yang dipilih dan merender elemen log menggunakan template UI yang sudah ada.

**Tech Stack:** Node.js, Socket.io, JavaScript (Frontend), Tailwind CSS.

---

### Task 1: Backend Logging Logic in waEngine.js

**Files:**
- Modify: `backend/src/services/waEngine.js`
- Test: `backend/tests/aiActivityLogging.test.js`

- [ ] **Step 1: Write failing test for logAiActivity**
Buat test yang memastikan `global.io.emit` dipanggil dengan data yang benar saat AI memproses pesan.

```javascript
// backend/tests/aiActivityLogging.test.js
const { connectToWhatsApp } = require('../src/services/waEngine');
const db = require('../src/config/database');

jest.mock('../src/config/database');
global.io = { emit: jest.fn() };

describe('AI Activity Logging', () => {
    test('should emit ai_activity_log when message matches target', async () => {
        // Mock DB to return AI enabled
        db.prepare.mockReturnValue({
            get: () => ({ ai_enabled: 1, ai_target: '123' })
        });
        
        // Trigger logic that should log
        // (This will be verified during implementation)
    });
});
```

- [ ] **Step 2: Implement logAiActivity helper and integration**
Tambahkan helper `logAiActivity` dan panggil di `waEngine.js` pada blok AI integration.

```javascript
// Helper di waEngine.js (sekitar baris 150 atau sebelum connectToWhatsApp)
function logAiActivity(apiKey, type, sender, message) {
    if (global.io) {
        global.io.emit('ai_activity_log', {
            apiKey,
            type, // incoming, processing, outgoing, error
            sender,
            message,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
        });
    }
}

// Integrasi di dalam listener 'messages.upsert'
// ... inside isTargetMatch block ...
logAiActivity(apiKey, 'incoming', sender, text);
// ... before generateAiResponse ...
logAiActivity(apiKey, 'processing', sender, 'Menganalisa pesan...');
// ... after sendMessageViaWa ...
logAiActivity(apiKey, 'outgoing', sender, aiResponse);
// ... in catch block ...
logAiActivity(apiKey, 'error', sender, error.message);
```

- [ ] **Step 3: Verify with tests**
Run: `npm test tests/aiActivityLogging.test.js` (dalam folder backend)

- [ ] **Step 4: Commit**
`git add backend/src/services/waEngine.js && git commit -m "feat(backend): add real-time AI activity logging via socket.io"`

---

### Task 2: Frontend Socket Setup & Filtering

**Files:**
- Modify: `frontend/public/auto-reply.html`

- [ ] **Step 1: Include Socket.io client script**
Tambahkan `<script src="/socket.io/socket.io.js"></script>` di bagian bawah file sebelum script `sidebar.js`.

- [ ] **Step 2: Initialize Socket and listen for events**
Update bagian script di `auto-reply.html` untuk inisialisasi socket dan filter berdasarkan perangkat yang dipilih.

```javascript
// Inside auto-reply.html script
const socket = io();

socket.on('ai_activity_log', (data) => {
    const selectedDevice = DOM.deviceSelect.value;
    if (data.apiKey === selectedDevice) {
        addLogEntry(data);
    }
});

// Clear logs on device change
DOM.deviceSelect.addEventListener('change', () => {
    const logContainer = document.querySelector('#terminal-scroll-container'); // Need to add this ID
    if (logContainer) logContainer.innerHTML = '';
});
```

- [ ] **Step 3: Commit**
`git commit -am "feat(frontend): setup socket.io and device filtering for AI logs"`

---

### Task 3: Dynamic Log Rendering (Preserve Style)

**Files:**
- Modify: `frontend/public/auto-reply.html`

- [ ] **Step 1: Add container ID and remove static content**
Beri ID pada area terminal agar bisa dimanipulasi.

```html
<!-- Di dalam Real-time Activity section -->
<div id="terminal-scroll-container" class="flex-1 bg-[#0f172a] p-6 overflow-y-auto font-mono text-[12px] flex flex-col gap-6 scrollbar-hide shadow-inner">
    <!-- Log entries will be injected here -->
</div>
```

- [ ] **Step 2: Implement addLogEntry function**
Buat fungsi yang membuat elemen HTML persis seperti desain asli.

```javascript
function addLogEntry(data) {
    const container = document.getElementById('terminal-scroll-container');
    if (!container) return;

    const entry = document.createElement('div');
    entry.className = 'flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300';
    
    let typeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    let typeLabel = data.type.toUpperCase();
    
    if (data.type === 'processing') typeClass = 'bg-blue-900/30 text-blue-400 border-blue-800/30';
    if (data.type === 'outgoing') typeClass = 'bg-emerald-900/30 text-emerald-400 border-emerald-800/30';
    if (data.type === 'error') typeClass = 'bg-rose-900/30 text-rose-400 border-rose-800/30';

    entry.innerHTML = `
        <div class="flex items-center gap-3 text-slate-500 text-[10px] font-bold">
            <span>${data.timestamp}</span>
            <span class="px-2 py-0.5 rounded ${typeClass} border uppercase tracking-widest">${typeLabel}</span>
            <span class="text-slate-400">${data.sender}</span>
        </div>
        <div class="${data.type === 'outgoing' ? 'text-emerald-400/90' : (data.type === 'incoming' ? 'text-slate-300 italic' : 'text-blue-300/70')} pl-4 border-l-2 ${data.type === 'incoming' ? 'border-slate-700' : (data.type === 'outgoing' ? 'border-emerald-900/30' : 'border-blue-900/30')}">
            "${data.message}"
        </div>
    `;

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    // Keep only last 50 entries
    while (container.children.length > 50) {
        container.removeChild(container.firstChild);
    }
}
```

- [ ] **Step 3: Verification**
Buka halaman `/auto-reply`, pilih perangkat, kirim pesan target, dan pastikan log muncul dengan gaya yang benar.

- [ ] **Step 4: Commit**
`git commit -am "feat(frontend): implement dynamic log rendering with original styling"`
