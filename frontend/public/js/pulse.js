document.addEventListener('alpine:init', () => {
    Alpine.data('pulseController', () => ({
        mode: 'manual', // 'manual' atau 'automatic'
        isWaiting: true,
        
        // Memori Penyimpanan Input
        config: {
            name: '',
            ig: '',
            ig_email: '',
            ig_password: '',
            tt: '',
            tt_email: '',
            tt_password: ''
        },
        manual: {
            dates: '',
            links: '',
            comments: ''
        },
        auto: {
            monitorId: '',
            targetId: ''
        },

        // LCR Status & Results dari Backend
        lcrStatus: 'idle', // idle | running | done | error
        lcrResults: [],
        statusPollInterval: null,

        // Terminal Logs Array
        logs: [
            { time: new Date().toLocaleTimeString('id-ID'), type: 'System', message: 'Initializing LCR Engine...', color: 'text-blue-400' },
            { time: new Date().toLocaleTimeString('id-ID'), type: 'Ready', message: 'Awaiting Master Command...', color: 'text-emerald-400' }
        ],

        // Socket.io Connection
        socket: null,

        init() {
            // Connect Socket.io untuk terima log real-time dari backend
            if (typeof io !== 'undefined') {
                this.socket = io();

                this.socket.on('pulse_log', (data) => {
                    this.addLog(data.type || 'Server', data.message, this.getLogColor(data.type));
                });

                this.socket.on('pulse_progress', (data) => {
                    if (data.result) {
                        this.lcrResults.push(data.result);
                    }
                    this.addLog('Progress', `Link ${data.current}/${data.total} selesai.`, 'text-purple-400');
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
                    this.config = { ...this.config, ...parsed };
                } catch(e) { /* ignore */ }
            }
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
                'warning': 'text-amber-400',
                'error': 'text-red-500'
            };
            return map[type] || 'text-slate-300';
        },

        // Simpan config ke localStorage
        saveConfig() {
            localStorage.setItem('pulse_config', JSON.stringify({
                name: this.config.name,
                ig: this.config.ig,
                ig_email: this.config.ig_email,
                ig_password: this.config.ig_password,
                tt: this.config.tt,
                tt_email: this.config.tt_email,
                tt_password: this.config.tt_password
            }));
        },

        // POLLING STATUS DARI BACKEND
        startStatusPolling() {
            if (this.statusPollInterval) clearInterval(this.statusPollInterval);
            this.pollStatus();
            this.statusPollInterval = setInterval(() => this.pollStatus(), 5000);
        },

        stopStatusPolling() {
            if (this.statusPollInterval) {
                clearInterval(this.statusPollInterval);
                this.statusPollInterval = null;
            }
        },

        async pollStatus() {
            try {
                const res = await fetch('/api/pulse/status');
                const result = await res.json();
                if (result.status && result.data) {
                    this.lcrStatus = result.data.status;
                    
                    // Update results jika ada data baru
                    if (result.data.results && result.data.results.length > this.lcrResults.length) {
                        this.lcrResults = result.data.results;
                    }

                    // Stop polling jika sudah selesai atau error
                    if (result.data.status === 'done' || result.data.status === 'error') {
                        this.stopStatusPolling();
                        this.isWaiting = true;
                        
                        if (result.data.status === 'done') {
                            this.addLog('Done', `Semua link selesai diproses! Total: ${this.lcrResults.length}`, 'text-emerald-500');
                        }
                        if (result.data.error) {
                            this.addLog('Error', result.data.error, 'text-red-500');
                        }
                    }
                }
            } catch(e) {
                // Silent fail for polling
            }
        },

        // EKSEKUSI MODE MANUAL
        async startManual() {
            if(!this.config.name || !this.manual.links) {
                this.addLog('Error', 'Identitas atau Link tidak boleh kosong!', 'text-red-500');
                return;
            }

            this.isWaiting = false;
            this.lcrResults = [];
            this.lcrStatus = 'running';
            this.saveConfig();

            const linkCount = this.manual.links.split('\n').filter(l => l.trim()).length;
            this.addLog('Action', `Mengirim ${linkCount} link ke LCR Engine...`, 'text-purple-400');

            try {
                // Kirim data ke Backend API
                const response = await fetch('/api/pulse/execute-manual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identity: {
                            name: this.config.name,
                            ig: this.config.ig,
                            ig_email: this.config.ig_email,
                            ig_password: this.config.ig_password,
                            tt: this.config.tt,
                            tt_email: this.config.tt_email,
                            tt_password: this.config.tt_password
                        },
                        payload: this.manual
                    })
                });

                const result = await response.json();

                if(response.ok && result.status) {
                    this.addLog('Server', result.message || 'LCR Engine berjalan di background.', 'text-emerald-400');
                    this.addLog('Info', 'Pantau progress di terminal ini. Browser boleh tetap terbuka.', 'text-slate-400');
                    
                    // Mulai polling untuk update status
                    this.startStatusPolling();
                } else {
                    throw new Error(result.message || 'Gagal memulai LCR Engine.');
                }
            } catch (error) {
                this.addLog('Fatal', error.message, 'text-red-500');
                this.isWaiting = true;
                this.lcrStatus = 'error';
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
        }
    }));
});