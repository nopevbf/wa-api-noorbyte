document.addEventListener('alpine:init', () => {
    Alpine.data('pulseController', () => ({
        mode: 'manual', // 'manual' atau 'automatic'
        isWaiting: true,
        stealthMode: false, // 😈 DEFAULT: Browser Terlihat (VISIBLE)
        
        // TikTok Local Automation Settings
        tiktokLocal: {
            enabled: true,
            mode: 'tab' // 'tab' | 'window'
        },

        // Memori Penyimpanan Input
        config: {
            name: '',
            ig: '',
            tt: ''
        },
        manual: {
            comments: '',
            poolText: ''
        },
        auto: {
            monitorId: '',
            targetId: ''
        },

        // Screenshot Modal State
        showScreenshot: false,
        activeScreenshot: '',
        showCompleteModal: false,
        showEntryPopup: true,
        showCopyFeedback: false,

        // Extension State
        showExtTutorial: false,
        get isExtensionInstalled() {
            return document.documentElement.hasAttribute('data-pulse-extension');
        },

        // Session-based Tracking
        sessions: {
            main: { status: 'idle', results: [] },
            local: { status: 'idle', results: [] }
        },
        statusPollInterval: null,

        // Terminal Logs Array
        logs: [
            { time: new Date().toLocaleTimeString('id-ID'), type: 'System', message: 'Initializing LCR Engine...', color: 'text-blue-400' },
            { time: new Date().toLocaleTimeString('id-ID'), type: 'Ready', message: 'Awaiting Master Command...', color: 'text-emerald-400' }
        ],

        // Socket.io Connection
        socket: null,

        init() {
            // Extension Event Listeners
            window.addEventListener('PULSE_EXT_LOG', (e) => {
                const { message, type } = e.detail;
                this.addLog(type || 'Extension', message, this.getLogColor(type));
            });

            window.addEventListener('PULSE_EXT_PROGRESS', (e) => {
                const result = e.detail;
                // Reaktivitas Alpine: gunakan assignment instead of push
                this.sessions.local.results = [...this.sessions.local.results, result];
                this.addLog('Progress', `[EXTENSION] Link ${result.platform} diproses: ${result.url.substring(0, 25)}...`, 'text-rose-400');
            });

            // Listener untuk Queue Selesai dari Extension
            window.addEventListener('PULSE_EXT_DONE', () => {
                this.addLog('Success', '🔥 Semua tugas local selesai!', 'text-emerald-400');
                if (this.sessions.local) this.sessions.local.status = 'done';
                this.showCompleteModal = true; // Tampilkan popup intuitif
            });

            // Connect Socket.io untuk terima log real-time dari backend
            if (typeof io !== 'undefined') {
                this.socket = io();

                this.socket.on('pulse_log', (data) => {
                    const prefix = data.sessionId ? `[${data.sessionId.toUpperCase()}] ` : '';
                    this.addLog(data.type || 'Server', prefix + data.message, this.getLogColor(data.type));
                });

                this.socket.on('pulse_progress', (data) => {
                    const sid = data.sessionId || 'main';
                    if (!this.sessions[sid]) this.sessions[sid] = { status: 'running', results: [] };
                    
                    if (data.result) {
                        // Reaktivitas Alpine: gunakan assignment instead of push
                        this.sessions[sid].results = [...this.sessions[sid].results, data.result];
                    }
                    this.addLog('Progress', `[${sid.toUpperCase()}] Link ${data.current}/${data.total} selesai.`, 'text-purple-400');

                    // Jika ini link terakhir dari main session, tawarkan download juga
                    if (data.current === data.total && sid === 'main') {
                        setTimeout(() => { this.showCompleteModal = true; }, 2000);
                    }
                });

                this.socket.on('connect', () => {
                    this.addLog('Socket', 'Real-time connection established.', 'text-green-400');
                });
            }

            // Load saved config dari localStorage
            const saved = localStorage.getItem('pulse_config');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    this.config = { ...this.config, ...parsed.identity };
                    if (parsed.tiktokLocal) this.tiktokLocal = parsed.tiktokLocal;
                } catch(e) { /* ignore */ }
            }
        },

        // FUNGSI DOWNLOAD SEMUA SCREENSHOT (ZIP)
        async downloadAllScreenshots() {
            const zip = new JSZip();
            const results = this.allResults.filter(r => r.screenshot);
            
            if (results.length === 0) {
                this.addLog('Warning', 'Tidak ada screenshot untuk diunduh.', 'text-amber-500');
                return;
            }

            this.addLog('System', `Mengompres ${results.length} bukti screenshot...`, 'text-blue-400');

            const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const folderName = `LCR_${dateStr}`;
            const folder = zip.folder(folderName);

            results.forEach((res, index) => {
                const base64Data = res.screenshot.split(',')[1];
                const fileName = `lcr_${res.platform}_${index + 1}.png`;
                folder.file(fileName, base64Data, { base64: true });
            });

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${folderName}.zip`;
            link.click();

            this.showCompleteModal = false;
            this.addLog('Success', '📁 Folder screenshot berhasil diunduh!', 'text-emerald-400');
        },

        // Fungsi Menambah Log ke Terminal
        addLog(type, message, color = 'text-slate-300') {
            this.logs.push({
                time: new Date().toLocaleTimeString('id-ID'),
                type: type,
                message: message,
                color: color
            });
            
            // Auto-scroll terminal ke bawah
            setTimeout(() => {
                const terminal = document.getElementById('terminal-scroll');
                if (terminal) terminal.scrollTop = terminal.scrollHeight;
            }, 50);
        },

        // Map type ke warna log
        getLogColor(type) {
            const map = {
                'info': 'text-blue-400',
                'success': 'text-emerald-400',
                'Success': 'text-emerald-400',
                'warning': 'text-amber-400',
                'Warning': 'text-amber-400',
                'error': 'text-red-500',
                'Error': 'text-red-500',
                'Extension': 'text-rose-400',
                'Progress': 'text-purple-400',
                'Action': 'text-indigo-400',
                'Randomizer': 'text-slate-400',
                'Socket': 'text-green-400',
                'System': 'text-blue-400',
                'Ready': 'text-emerald-400',
                'Active': 'text-green-400',
                'Fatal': 'text-red-600'
            };
            return map[type] || 'text-slate-300';
        },

        // Simpan config ke localStorage
        saveConfig() {
            localStorage.setItem('pulse_config', JSON.stringify({
                identity: this.config,
                tiktokLocal: this.tiktokLocal
            }));
        },

        // POLLING STATUS DARI BACKEND
        startStatusPolling() {
            if (this.statusPollInterval) clearInterval(this.statusPollInterval);
            this.statusPollInterval = setInterval(() => this.pollAllStatuses(), 3000);
        },

        async pollAllStatuses() {
            let stillRunning = false;
            for (const sid of Object.keys(this.sessions)) {
                if (this.sessions[sid].isLocal) {
                    if (this.sessions[sid].status === 'running') stillRunning = true;
                    continue; // Jangan tanya backend untuk sesi lokal extension
                }
                
                try {
                    const res = await fetch(`/api/pulse/status?sessionId=${sid}`);
                    const result = await res.json();
                    if (result.status && result.data) {
                        this.sessions[sid].status = result.data.status;
                        if (result.data.results) this.sessions[sid].results = result.data.results;
                        if (result.data.status === 'running') stillRunning = true;
                    }
                } catch(e) {}
            }
            if (!stillRunning && this.isWaiting === false) {
                this.isWaiting = true;
                clearInterval(this.statusPollInterval);
                this.statusPollInterval = null;
                this.addLog('System', 'Semua misi pararel selesai.', 'text-emerald-500');
            }
        },

        // Get combined results for the UI
        get allResults() {
            return [...this.sessions.main.results, ...this.sessions.local.results];
        },

        get parsedDate() {
            if (!this.manual.poolText) return '...';
            const dateMatch = this.manual.poolText.match(/(?:(?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),\s+)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
            return dateMatch ? dateMatch[1] : '...';
        },

        get parsedLinks() {
            if (!this.manual.poolText) return [];
            
            // 1. Pecah teks menggunakan pola nomor sebagai pemisah, tapi tetap simpan nomornya
            // Hasil split: ["teks awal", "26. ", "isi link 26", "27. ", "isi link 27", ...]
            const parts = this.manual.poolText.split(/(\d+\.\s)/);
            const items = [];

            for (let i = 1; i < parts.length; i += 2) {
                const numberLabel = parts[i]; // "26. "
                const content = parts[i + 1] || ""; // Teks setelah nomor
                
                const numMatch = numberLabel.match(/(\d+)\./);
                if (numMatch) {
                    const number = numMatch[1];
                    const links = [];
                    
                    // Cari link di bagian konten setelah nomor ini
                    const linksInPart = content.match(/https?:\/\/[^\s]+/g);
                    if (linksInPart) {
                        linksInPart.forEach(link => {
                            if (link.includes('instagram.com') || link.includes('tiktok.com')) {
                                links.push(link);
                            }
                        });
                    }
                    
                    items.push({ number, links });
                }
            }
            
            return items;
        },

        get captionPreview() {
            const name = this.config.name || '{{full_name}}';
            const date = this.parsedDate;
            const items = this.parsedLinks;

            if (items.length === 0) {
                return `${name} / {{no_link}} ${date}\n\nIG : ${this.config.ig || '-'}\nTT : ${this.config.tt || '-'}`;
            }

            const previewLines = items.map(item => `${name} / ${item.number} / ${date}`);
            const handles = `IG : ${this.config.ig || '-'}\nTT : ${this.config.tt || '-'}`;
            
            return previewLines.join('\n') + '\n\n' + handles;
        },

        // EKSEKUSI MODE MANUAL
        async startManual() {
            const allLinks = this.parsedLinks.flatMap(item => item.links);

            if(!this.config.name || allLinks.length === 0) {
                this.addLog('Error', 'Identitas atau Link tidak boleh kosong!', 'text-red-500');
                return;
            }

            this.isWaiting = false;
            this.saveConfig();

            const commentPool = this.manual.comments.split(/\n|,/).map(c => c.trim()).filter(c => c.length > 0);
            
            const getRandomComment = () => {
                if (commentPool.length === 0) return '';
                return commentPool[Math.floor(Math.random() * commentPool.length)];
            };

            let localLinks = [];
            let mainLinks = [];

            if (this.tiktokLocal.enabled) {
                localLinks = allLinks.filter(l => l.toLowerCase().includes('tiktok.com') || l.toLowerCase().includes('instagram.com'));
                mainLinks = allLinks.filter(l => !l.toLowerCase().includes('tiktok.com') && !l.toLowerCase().includes('instagram.com'));
            } else {
                mainLinks = allLinks;
            }

            // Reset States
            this.sessions.main = { status: mainLinks.length > 0 ? 'running' : 'idle', results: [], isLocal: false };
            this.sessions.local = { status: localLinks.length > 0 ? 'running' : 'idle', results: [], isLocal: false };

            // Start Local Session (Extension)
            if (localLinks.length > 0) {
                const isExtInstalled = document.documentElement.hasAttribute('data-pulse-extension');
                
                if (isExtInstalled) {
                    this.sessions.local.isLocal = true;
                    this.addLog('Extension', `Mengirim ${localLinks.length} link ke Chrome Extension...`, 'text-rose-400');
                    
                    const localComments = localLinks.map(l => {
                        const c = getRandomComment();
                        const platName = l.toLowerCase().includes('instagram.com') ? 'IG' : 'TT';
                        this.addLog('Randomizer', `Extension (${platName}): ${l.substring(0,20)}... -> "${c}"`, 'text-slate-400');
                        return c;
                    });

                    window.dispatchEvent(new CustomEvent('PULSE_EXECUTE_LOCAL', {
                        detail: { links: localLinks, comments: localComments, mode: this.tiktokLocal.mode }
                    }));
                } else {
                    this.addLog('Warning', `Extension belum terinstall! Jalankan mode server (Visible Browser)...`, 'text-amber-500');
                    const randomizedComments = localLinks.map(l => {
                        const c = getRandomComment();
                        this.addLog('Randomizer', `Server Local: ${l.substring(0,20)}... -> "${c}"`, 'text-slate-400');
                        return c;
                    }).join('\n');
                    this.sendToBackend(localLinks, 'local', false, randomizedComments);
                }
            }

            // Start Main Session (PHANTOM/STEALTH)
            if (mainLinks.length > 0) {
                this.addLog('Action', `🚀 Memulai Sesi Utama (Phantom Mode)...`, 'text-purple-400');
                const randomizedComments = mainLinks.map(l => {
                    const c = getRandomComment();
                    this.addLog('Randomizer', `Main: ${l.substring(0,20)}... -> "${c}"`, 'text-slate-400');
                    return c;
                }).join('\n');
                this.sendToBackend(mainLinks, 'main', true, randomizedComments);
            }

            this.startStatusPolling();
        },

        async sendToBackend(links, sessionId, stealth, customComments) {
            try {
                const payload = { ...this.manual, links: links.join('\n') };
                if (customComments) {
                    payload.comments = customComments;
                }

                const response = await fetch('/api/pulse/execute-manual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identity: this.config,
                        payload: payload,
                        options: { sessionId, stealthMode: stealth }
                    })
                });
                const result = await response.json();
                if (!result.status === 'success') {
                    this.addLog('Error', `Gagal memulai sesi ${sessionId}: ${result.message}`, 'text-red-500');
                }
            } catch (err) {
                this.addLog('Error', `Fatal error sesi ${sessionId}: ${err.message}`, 'text-red-500');
            }
        },

        // AKTIVASI MODE OTOMATIS (MONITOR WA)
        async startAuto() {
            if(!this.config.name || !this.auto.monitorId || !this.auto.targetId) {
                this.addLog('Error', 'Lengkapi Identitas dan ID WhatsApp!', 'text-red-500');
                return;
            }

            this.isWaiting = false;
            this.addLog('Action', `Mengaktifkan The Watcher pada grup: ${this.auto.monitorId}`, 'text-emerald-400');

            try {
                const response = await fetch('/api/pulse/activate-watcher', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identity: this.config,
                        monitor: this.auto
                    })
                });

                const result = await response.json();

                if(response.ok && result.status) {
                    this.addLog('Active', result.message || 'Watcher aktif.', 'text-green-400');
                } else {
                    throw new Error(result.message || 'Gagal mengaktifkan watcher.');
                }
            } catch (error) {
                this.addLog('Fatal', error.message, 'text-red-500');
            } finally {
                this.isWaiting = true;
            }
        },

        async copyToClipboard() {
            try {
                await navigator.clipboard.writeText(this.captionPreview);
                this.showCopyFeedback = true;
                this.addLog('Success', 'Caption berhasil disalin ke clipboard!', 'text-emerald-400');
                setTimeout(() => {
                    this.showCopyFeedback = false;
                }, 2000);
            } catch (err) {
                this.addLog('Error', 'Gagal menyalin teks: ' + err.message, 'text-red-500');
            }
        }
    }));
});