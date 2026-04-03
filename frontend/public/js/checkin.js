// ==========================================
// KONFIGURASI GLOBAL
// ==========================================
const API_URL = "/api";

// ==========================================
// FUNGSI GLOBAL SYSTEM ALERT (PENGGANTI ALERT BROWSER)
// ==========================================
function showSystemAlert(title, message, type = 'error', callback = null) {
    const modal = document.getElementById('systemAlertModal');
    const box = document.getElementById('systemAlertBox');
    const icon = document.getElementById('systemAlertIcon');
    const iconContainer = document.getElementById('systemAlertIconContainer');
    const topBar = document.getElementById('systemAlertTopBar');
    const titleEl = document.getElementById('systemAlertTitle');
    const msgEl = document.getElementById('systemAlertMessage');
    const btn = document.getElementById('btnAcknowledgeAlert');

    titleEl.innerText = title;
    msgEl.innerText = message;

    // Styling Berdasarkan Tipe (Success / Error)
    if (type === 'success') {
        icon.innerText = 'check_circle';
        iconContainer.className = 'w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-green-500/10 border border-green-500/30 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]';
        topBar.className = 'absolute top-0 left-0 w-full h-1 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,1)]';
        btn.className = 'w-full bg-green-600/20 hover:bg-green-600/30 text-green-500 border border-green-500/50 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95';
    } else {
        icon.innerText = 'warning';
        iconContainer.className = 'w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-error/10 border border-error/30 text-error shadow-[0_0_15px_rgba(239,68,68,0.3)]';
        topBar.className = 'absolute top-0 left-0 w-full h-1 bg-error shadow-[0_0_10px_rgba(239,68,68,1)]';
        btn.className = 'w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95';
    }

    // Tampilkan Modal dengan Animasi
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);

    // Logic Tombol Tutup
    btn.onclick = () => {
        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
            if (callback) callback(); // Eksekusi aksi lanjutan (misal pindah halaman)
        }, 300);
    };
}

// ==========================================
// LOGIC ANIMASI WAKTU REALTIME
// ==========================================
setInterval(() => {
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').substring(0, 23);
    const el = document.getElementById('liveTimestamp');
    if (el) el.innerText = `TS: ${ts}`;
}, 100);

// ==========================================
// LOGIC MODAL AUTH D'PARAGON & CHECK-IN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const authModal = document.getElementById('dparagonAuthModal');
    const authContent = document.getElementById('dparagonAuthContent');
    const authForm = document.getElementById('dparagonForm');
    const btnSubmit = document.getElementById('btnDpSubmit');
    const loadingArea = document.getElementById('dpLoadingText');
    const processLog = document.getElementById('dpProcessLog');
    const progressBar = document.getElementById('dpProgressBar');

    let defaultDparagonApiUrl = "";

    // ==========================================
    // LOGIC KAMERA & CAPTURE (PREVIEW MODE)
    // ==========================================
    const cameraFeed = document.getElementById('cameraFeed');
    const cameraPlaceholder = document.getElementById('cameraPlaceholder');
    const captureCanvas = document.getElementById('captureCanvas');
    const btnCapture = document.getElementById('btnCapture');
    const cameraFlash = document.getElementById('cameraFlash');

    const cameraPreview = document.getElementById('cameraPreview');
    const btnRetake = document.getElementById('btnRetake');

    let isPreviewMode = false;
    let finalBase64Photo = null;
    let isLocationLocked = false;

    async function startCamera() {
        try {
            const placeholderText = cameraPlaceholder.querySelector('span:nth-child(2)');
            if (placeholderText) placeholderText.innerText = "INITIATING OPTICS...";

            // Minta akses kamera dengan target HD (720p atau 1080p)
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 1920 }, // Minta resolusi lebar ideal 1280 (HD) atau 1920 (FHD)
                    height: { ideal: 1080 }  // Minta resolusi tinggi ideal 720 (HD) atau 1080 (FHD)
                },
                audio: false
            });

            cameraFeed.srcObject = stream;

            cameraFeed.onloadedmetadata = () => {
                cameraFeed.classList.remove('opacity-0');
                cameraPlaceholder.classList.add('opacity-0');
                setTimeout(() => cameraPlaceholder.classList.add('hidden'), 500);
            };
        } catch (err) {
            console.error("Gagal mengakses kamera:", err);
            const placeholderText = cameraPlaceholder.querySelector('span:nth-child(2)');
            if (placeholderText) {
                placeholderText.innerText = "ACCESS DENIED / NO CAMERA";
                placeholderText.classList.replace('text-slate-500', 'text-error');
            }
            showSystemAlert('HARDWARE ERROR', 'Akses modul optik ditolak atau perangkat tidak ditemukan.', 'error');
        }
    }

    // ==========================================
    // LOGIC TOMBOL CAPTURE / ABSEN
    // ==========================================
    if (btnCapture) {
        btnCapture.addEventListener('click', () => {

            // ===================================
            // VALIDASI: CEK LOKASI SUDAH DI-LOCK?
            // ===================================
            if (!isLocationLocked) {
                showSystemAlert('SECURITY HALT', "Silakan klik 'Set Location' untuk mengunci koordinat GPS sebelum mengambil data visual!", 'error');
                return; // Hentikan proses, gak boleh foto!
            }

            if (!cameraFeed.srcObject && !isPreviewMode) {
                showSystemAlert('HARDWARE ERROR', "Kamera belum aktif!", 'error');
                return;
            }

            if (!isPreviewMode) {
                // ===================================
                // 1. EFEK FLASH KAMERA
                // ===================================
                cameraFlash.classList.remove('opacity-0');
                cameraFlash.classList.add('opacity-100');
                setTimeout(() => {
                    cameraFlash.classList.remove('opacity-100');
                    cameraFlash.classList.add('opacity-0');
                }, 100);

                // ===================================
                // 2. CROP 1:1 (SQUARE) DARI TENGAH
                // ===================================
                const context = captureCanvas.getContext('2d');
                const minSize = Math.min(cameraFeed.videoWidth, cameraFeed.videoHeight);
                const startX = (cameraFeed.videoWidth - minSize) / 2;
                const startY = (cameraFeed.videoHeight - minSize) / 2;

                captureCanvas.width = minSize;
                captureCanvas.height = minSize;

                // Balik sumbu X agar hasil akhir tetap Mirror
                context.translate(minSize, 0);
                context.scale(-1, 1);

                // Potong dan gambar ke canvas
                context.drawImage(cameraFeed, startX, startY, minSize, minSize, 0, 0, minSize, minSize);

                // ===================================
                // 3. BYPASS COMPRESS (QA TESTING MODE)
                // ===================================
                // pake gambar aslinya tanpa compress
                finalBase64Photo = captureCanvas.toDataURL('image/jpeg');

                // ===================================
                // 4. TAMPILKAN PREVIEW & GANTI TOMBOL
                // ===================================
                cameraPreview.src = finalBase64Photo;
                cameraPreview.classList.remove('hidden');
                btnRetake.classList.remove('hidden');

                btnCapture.innerHTML = `ABSEN MASUK`;
                isPreviewMode = true;

            } else {
                // ===================================
                // 5. MODE: SUBMIT ABSEN MASUK (KE API)
                // ===================================
                submitPresence();
            }
        });
    }

    // ==========================================
    // FUNGSI UTAMA: TEMBAK API ABSENSI
    // ==========================================
    async function submitPresence(lateReason = "") {
        try {
            // Ambil Access Token User yang sedang login
            const token = localStorage.getItem('access_token') || localStorage.getItem('dparagon_token');

            if (!token) {
                showSystemAlert('ACCESS DENIED', "Bearer Token otorisasi tidak ditemukan. Harap re-initiate bypass.", 'error');
                return;
            }

            // Validasi Koordinat GPS
            const lat = document.getElementById('inputLat').value;
            const lng = document.getElementById('inputLng').value;
            if (!lat || !lng) {
                showSystemAlert('SECURITY HALT', "Silakan set & lock koordinat lokasi terlebih dahulu sebelum menginisiasi sinkronisasi.", 'error');
                return;
            }

            // 1. Ubah Tombol Jadi Loading
            btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl animate-spin">autorenew</span> MEMPROSES...`;
            btnCapture.disabled = true;

            // 2. Siapkan Payload Data
            const payload = {
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                image: finalBase64Photo
            };

            // Jika user mengirimkan alasan (karena sebelumnya ditolak)
            if (lateReason !== "") {
                payload.late_reason = lateReason;
            }

            // 3. Bangun Target Endpoint berdasarkan DParagon API URL yang aktif
            const dpApiUrlInput = document.getElementById('dpApiUrl');
            const dpUrl = dpApiUrlInput ? dpApiUrlInput.value : defaultDparagonApiUrl;
            const baseUrl = dpUrl ? dpUrl.replace(/\/$/, '') : "https://api.dparagon.com/v2";
            const targetEndpoint = `${baseUrl}/attendance/presence`;

            // Tembak API Absensi
            const response = await fetch(targetEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            // 4. Handle Response
            if (response.ok && result.status !== false) {
                // ABSEN SUKSES
                showSystemAlert('BYPASS SUCCESS', "Data kehadiran diterima. Memulai sinkronisasi log otomatis...", 'success');

                // Ubah tulisan tombol biar keren
                btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl">check_circle</span> TERKIRIM`;

                // ==========================================
                // MAGIC HAPPENS HERE: Panggil widget dengan nilai TRUE
                // Ini akan memaksa Puppeteer jalan di background!
                // ==========================================
                loadRecentAttendanceWidget(true);

            } else {
                // DITOLAK OLEH SERVER
                throw new Error(result.message || "Ditolak oleh sistem.");
            }

        } catch (error) {
            console.warn("Absen Ditolak:", error.message);

            // JIKA BELUM ADA ALASAN, TAMPILKAN POPUP MINTA ALASAN
            if (lateReason === "") {
                const modal = document.getElementById('lateReasonModal');
                if (modal) {
                    modal.classList.remove('hidden');
                    modal.classList.add('flex');
                } else {
                    showSystemAlert('CRITICAL ERROR', "Modal alasan keterlambatan tidak ditemukan di HTML.", 'error');
                }
            } else {
                // JIKA UDAH MAKSA PAKAI ALASAN TAPI TETAP DITOLAK
                showSystemAlert('CRITICAL ERROR', error.message, 'error');
            }

            // Kembalikan Tombol ke Mode Normal
            btnCapture.innerHTML = `ABSEN MASUK`;
            btnCapture.disabled = false;
        }
    }

    // ==========================================
    // LOGIC EVENT LISTENER MODAL LATE REASON
    // ==========================================
    const lateModal = document.getElementById('lateReasonModal');
    const btnCancelReason = document.getElementById('btnCancelReason');
    const btnSubmitReason = document.getElementById('btnSubmitReason');
    const inputReason = document.getElementById('lateReasonInput');

    if (btnCancelReason) {
        btnCancelReason.addEventListener('click', () => {
            lateModal.classList.remove('flex');
            lateModal.classList.add('hidden');
            inputReason.value = ""; // Bersihkan inputan

            // Kembalikan teks tombol utama jika dicancel
            btnCapture.innerHTML = `ABSEN MASUK`;
            btnCapture.disabled = false;
        });
    }

    if (btnSubmitReason) {
        btnSubmitReason.addEventListener('click', () => {
            const reasonText = inputReason.value.trim();
            if (reasonText === "") {
                showSystemAlert('VALIDATION FAILED', "Alasan keterlambatan tidak boleh kosong untuk mem-bypass firewall!", 'error');
                return;
            }

            // Tutup modal, lalu tembak API lagi dengan membawa alasan
            lateModal.classList.remove('flex');
            lateModal.classList.add('hidden');

            submitPresence(reasonText); // Retrigger submit dengan alasan

            inputReason.value = ""; // Bersihkan untuk safety
        });
    }

    if (btnRetake) {
        btnRetake.addEventListener('click', () => {
            isPreviewMode = false;
            finalBase64Photo = null;

            cameraPreview.classList.add('hidden');
            btnRetake.classList.add('hidden');
            cameraPreview.src = '';

            btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl md:text-2xl">photo_camera</span> Ambil & Kirim`;
            btnCapture.disabled = false;
        });
    }

    // ==========================================
    // 1. FETCH APP CONFIG (ENV-BASED DEFAULT URL)
    // ==========================================
    try {
        const configRes = await fetch(`${API_URL}/app-config`);
        const configData = await configRes.json();

        if (configData.status && configData.data) {
            defaultDparagonApiUrl = configData.data.dparagonApiUrl || "";

            const envBadge = document.getElementById("envBadge");
            if (envBadge) {
                const env = configData.data.env || "development";
                const isDev = env !== "production";

                envBadge.textContent = isDev ? "DEV_NODE" : "PROD_NODE";
                envBadge.classList.remove("hidden");

                if (isDev) {
                    envBadge.classList.add("bg-yellow-500/10", "text-yellow-500", "border", "border-yellow-500/30");
                } else {
                    envBadge.classList.add("bg-emerald-500/10", "text-emerald-500", "border", "border-emerald-500/30");
                }
            }

            const dpApiUrlInput = document.getElementById("dpApiUrl");
            if (dpApiUrlInput && !dpApiUrlInput.value) {
                dpApiUrlInput.value = defaultDparagonApiUrl;
            }
        }
    } catch (e) {
        console.warn("Gagal memuat app config:", e.message);
        const dpApiUrlInput = document.getElementById("dpApiUrl");
        if (dpApiUrlInput) dpApiUrlInput.value = "Offline Mode / Error";
    }

    setTimeout(() => {
        authContent.classList.remove('scale-95', 'opacity-0');
        authContent.classList.add('scale-100', 'opacity-100');
    }, 300);

    // ==========================================
    // 2. Handle Submit Form (DIRECT TO ENV TARGET NODE)
    // ==========================================
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const dpUrl = document.getElementById('dpApiUrl').value;
        const email = document.getElementById('dpEmail').value;
        const password = document.getElementById('dpPassword').value;

        btnSubmit.classList.add('hidden');
        loadingArea.classList.remove('hidden');
        loadingArea.classList.add('flex');

        document.getElementById('dpEmail').disabled = true;
        document.getElementById('dpPassword').disabled = true;

        progressBar.style.width = '20%';
        progressBar.classList.remove('bg-green-500');
        progressBar.classList.add('bg-error');
        processLog.classList.remove('text-green-500');
        processLog.classList.add('text-error');
        processLog.innerText = `[WAIT] ESTABLISHING SECURE CONNECTION...`;

        try {
            setTimeout(() => { progressBar.style.width = '60%'; }, 500);
            processLog.innerText = `[WAIT] VERIFYING CREDENTIALS ON TARGET NODE...`;

            // Bersihkan slash (/) di akhir base URL jika ada, lalu tambahkan /login
            const baseUrl = dpUrl.replace(/\/$/, '');
            const targetEndpoint = `${baseUrl}/login`;

            // TEMBAK LANGSUNG KE TARGET ENDPOINT
            const response = await fetch(targetEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const result = await response.json();

            // Pengecekan sukses lebih fleksibel (pakai response.ok)
            if (response.ok && result.message === "Login success") {

                progressBar.style.width = '100%';
                processLog.innerText = `[SUCCESS] ACCESS GRANTED.`;
                processLog.classList.remove('text-error');
                processLog.classList.add('text-green-500');
                progressBar.classList.replace('bg-error', 'bg-green-500');

                // ==========================================
                // 1. SIMPAN TOKEN (Sesuai wujud JSON asli)
                // ==========================================
                let token = "";
                if (result.payload && result.payload.access_token) {
                    token = result.payload.access_token;
                } else if (result.token) {
                    token = result.token; // Fallback jaga-jaga
                }

                if (token) {
                    // Simpan dua-duanya biar fungsi absen & fungsi history gak bingung nyari token
                    localStorage.setItem('dparagon_token', token);
                    localStorage.setItem('access_token', token);
                }

                // ==========================================
                // 2. SIMPAN NAMA LENGKAP (Sesuai wujud JSON asli)
                // ==========================================
                let extractedName = "";
                if (result.payload && result.payload.user && result.payload.user.full_name) {
                    extractedName = result.payload.user.full_name;
                }

                if (extractedName) {
                    localStorage.setItem('full_name', extractedName);
                    console.log("[AUTH] Nama User berhasil ditangkap:", extractedName);
                    const apiInputUrl = document.getElementById('dpApiUrl').value || "";
                    // Kalau URL-nya ada angka 6 nya (dparagon6), berarti DEV. Selain itu PROD.
                    const detectedEnv = apiInputUrl.includes('dparagon6') ? 'dev' : 'prod';
                    localStorage.setItem('active_env', detectedEnv);

                    console.log(`[AUTH] Environment diset ke: ${detectedEnv.toUpperCase()}`);
                } else {
                    console.warn("[AUTH] Gagal menangkap nama user dari payload.");
                }

                // ==========================================
                // 3. TUTUP MODAL & NYALAKAN KAMERA
                // ==========================================
                setTimeout(() => {
                    authContent.classList.replace('scale-100', 'scale-95');
                    authContent.classList.replace('opacity-100', 'opacity-0');
                    authModal.classList.replace('bg-slate-950/90', 'bg-transparent');

                    setTimeout(() => {
                        authModal.classList.add('hidden');
                        startCamera();
                    }, 500);
                }, 1500);

            } else {
                throw new Error(result.message || "Invalid Credentials");
            }

        } catch (error) {
            progressBar.style.width = '100%';
            processLog.innerText = `[ERROR] ${error.message.toUpperCase()}`;

            authContent.classList.add('animate-pulse');
            setTimeout(() => authContent.classList.remove('animate-pulse'), 500);

            setTimeout(() => {
                loadingArea.classList.remove('flex');
                loadingArea.classList.add('hidden');
                btnSubmit.classList.remove('hidden');

                document.getElementById('dpEmail').disabled = false;
                document.getElementById('dpPassword').disabled = false;

                const passInput = document.getElementById('dpPassword');
                passInput.value = '';
                passInput.focus();
            }, 2000);
        }
    });

    // ==========================================
    // LOGIC SET LOCATION (TOGGLE LOCK/UNLOCK)
    // ==========================================
    const inputLat = document.getElementById('inputLat');
    const inputLng = document.getElementById('inputLng');
    const btnSetLocation = document.getElementById('btnSetLocation');
    const iconLocation = document.getElementById('iconLocation');
    const textLocation = document.getElementById('textLocation');

    if (btnSetLocation) {
        btnSetLocation.addEventListener('click', () => {

            if (!isLocationLocked) {
                if (inputLat.value.trim() === '' || inputLng.value.trim() === '') {
                    showSystemAlert('VALIDATION FAILED', 'Koordinat Latitude dan Longitude tidak boleh kosong untuk menetapkan node GPS.', 'error');
                    return;
                }

                isLocationLocked = true;
                inputLat.readOnly = true;
                inputLng.readOnly = true;

                inputLat.classList.add('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');
                inputLng.classList.add('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');

                iconLocation.innerText = 'lock';
                textLocation.innerText = 'Unlock Location';

                btnSetLocation.className = "w-full bg-error/10 text-error border border-error/50 hover:bg-error/20 py-3 rounded-lg font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.1)]";

            } else {
                isLocationLocked = false;
                inputLat.readOnly = false;
                inputLng.readOnly = false;

                inputLat.classList.remove('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');
                inputLng.classList.remove('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');

                iconLocation.innerText = 'my_location';
                textLocation.innerText = 'Set Location';

                btnSetLocation.className = "w-full bg-slate-800 hover:bg-slate-700 hover:border-error/50 text-slate-200 border border-slate-700 py-3 rounded-lg font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm";
            }
        });
    }

    // ==========================================
    // LOGIC RIWAYAT ABSEN (PULL-UP TO LOAD MORE)
    // ==========================================
    const btnViewFullLog = document.getElementById('btnViewFullLog');
    const historyModal = document.getElementById('historyLogModal');
    const historyBox = document.getElementById('historyLogBox');
    const btnCloseHistory = document.getElementById('btnCloseHistory');
    const historyContainer = document.getElementById('historyListContainer');
    const loadingIndicator = document.getElementById('historyLoadingIndicator');
    const endIndicator = document.getElementById('historyEndIndicator');

    let historyPage = 1;
    let isFetchingHistory = false;
    let isHistoryEnd = false;

    // --- VARIABEL UNTUK EFEK BOUNCE TARIK ---
    let startY = 0;
    let currentY = 0;
    const PULL_THRESHOLD = 60; // Seberapa jauh harus ditarik sebelum meledak (load)

    async function loadHistoryData() {
        if (isFetchingHistory || isHistoryEnd) return;

        isFetchingHistory = true;
        // Ubah teks loading jadi mode memproses
        loadingIndicator.innerHTML = `
            <span class="material-symbols-outlined animate-spin text-emerald-500 text-2xl">autorenew</span>
            <p class="text-[9px] font-mono text-slate-400 uppercase mt-1 tracking-widest">Decrypting Page ${historyPage}...</p>
        `;
        loadingIndicator.classList.remove('hidden');

        try {
            const token = localStorage.getItem('access_token') || localStorage.getItem('dparagon_token');
            const fullName = localStorage.getItem('full_name') || '';

            // Tembak API dengan page yang sesuai (Gak usah pake limit lagi)
            const response = await fetch(`${API_URL}/attendance/history?page=${historyPage}&name=${encodeURIComponent(fullName)}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            const data = result.data || [];

            if (data.length === 0) {
                isHistoryEnd = true;
                endIndicator.classList.remove('hidden');
            } else {
                renderHistoryItems(data); // Tambahkan data ke bawah (gak ngehapus page 1)
                historyPage++; // Siapkan untuk tarikan berikutnya

                // Asumsi: Kalau data yang balik kurang dari 10 (atau jumlah baris standar DParagon), berarti itu halaman terakhir
                if (data.length < 5) {
                    isHistoryEnd = true;
                    endIndicator.classList.remove('hidden');
                }
            }
        } catch (error) {
            console.error("API Fetch Error:", error);
            showSystemAlert('API ERROR', 'Gagal memuat log dari server Node.', 'error');
        } finally {
            isFetchingHistory = false;
            loadingIndicator.classList.add('hidden');
            loadingIndicator.style.transform = `translateY(0px)`; // Kembalikan posisi bounce
        }
    }

    function renderHistoryItems(items) {
        items.forEach(item => {
            const isCheckin = item.status.toLowerCase() === 'checkin';
            const statusColor = isCheckin ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30' : 'text-orange-400 bg-orange-400/10 border-orange-500/30';
            const iconName = isCheckin ? 'login' : 'logout';

            let dateStr = "Unknown Date";
            let timeStr = "--:-- WIB";

            if (item.raw_time) {
                const parts = item.raw_time.split('\n');
                if (parts.length >= 2) {
                    dateStr = parts[0].trim();
                    timeStr = parts[1].trim();
                } else {
                    const timeMatch = item.raw_time.match(/\d{2}:\d{2}:\d{2}/);
                    if (timeMatch) {
                        dateStr = item.raw_time.substring(0, timeMatch.index).trim();
                        timeStr = item.raw_time.substring(timeMatch.index).trim();
                    } else {
                        timeStr = item.raw_time.trim();
                    }
                }
            }

            const shiftText = item.shift_info && item.shift_info !== "-" ? item.shift_info : "Regular Shift";

            const html = `
                <div class="flex items-center gap-4 p-3 bg-slate-950/80 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors shadow-sm">
                    <div class="w-14 h-14 rounded-lg overflow-hidden border border-slate-700 shrink-0 bg-slate-900 relative">
                        <img src="${item.image_url || item.image || item.photo}" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusColor} flex items-center gap-1 w-max">
                                <span class="material-symbols-outlined text-[11px]">${iconName}</span>
                                ${item.status}
                            </span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-sm text-slate-200 font-bold tracking-wide truncate">${shiftText}</span>
                            <span class="text-[10px] font-mono text-slate-500 mt-0.5">${dateStr} • ${timeStr}</span>
                        </div>
                    </div>
                </div>
            `;
            historyContainer.insertAdjacentHTML('beforeend', html);
        });
    }

    // ==========================================
    // MAGIC TOUCH: DETEKSI PULL UP (MOBILE)
    // ==========================================
    if (historyContainer) {
        historyContainer.addEventListener('touchstart', (e) => {
            // Cek apakah scroll sudah mentok di bawah
            if (historyContainer.scrollTop + historyContainer.clientHeight >= historyContainer.scrollHeight - 5) {
                startY = e.touches[0].clientY;
            } else {
                startY = 0;
            }
        });

        historyContainer.addEventListener('touchmove', (e) => {
            if (!startY || isFetchingHistory || isHistoryEnd) return;

            currentY = e.touches[0].clientY;
            const pullDistance = startY - currentY;

            // Jika ditarik ke atas (pullDistance positif)
            if (pullDistance > 0) {
                e.preventDefault(); // Cegah scroll bawaan browser
                loadingIndicator.classList.remove('hidden');

                // Efek mentul ke atas pelan-pelan
                const translateY = Math.min(pullDistance, PULL_THRESHOLD);
                loadingIndicator.style.transform = `translateY(-${translateY}px)`;

                if (pullDistance >= PULL_THRESHOLD) {
                    loadingIndicator.innerHTML = `
                        <span class="material-symbols-outlined text-emerald-500 text-3xl animate-bounce">arrow_upward</span>
                        <p class="text-[10px] font-bold text-emerald-500 uppercase mt-1 tracking-widest">Lepas untuk memuat...</p>
                    `;
                } else {
                    loadingIndicator.innerHTML = `
                        <span class="material-symbols-outlined text-slate-500 text-2xl">drag_handle</span>
                        <p class="text-[9px] font-mono text-slate-500 uppercase mt-1 tracking-widest">Tarik ke atas...</p>
                    `;
                }
            }
        });

        historyContainer.addEventListener('touchend', () => {
            if (!startY || !currentY || isFetchingHistory || isHistoryEnd) return;

            const pullDistance = startY - currentY;
            loadingIndicator.style.transform = `translateY(0px)`; // Kembalikan ke dasar

            if (pullDistance >= PULL_THRESHOLD) {
                // Eksekusi load data kalau tarikannya cukup kuat!
                loadHistoryData();
            } else {
                loadingIndicator.classList.add('hidden'); // Sembunyikan kalau tarikan nanggung
            }

            // Reset
            startY = 0;
            currentY = 0;
        });

        // Fallback untuk Desktop (Scroll pakai Mouse)
        historyContainer.addEventListener('scroll', () => {
            if (isFetchingHistory || isHistoryEnd) return;
            if (historyContainer.scrollTop + historyContainer.clientHeight >= historyContainer.scrollHeight - 2) {
                // Langsung load kalau pakai mouse mentok bawah
                loadHistoryData();
            }
        });
    }

    // Event Klik "View Full Log"
    if (btnViewFullLog) {
        btnViewFullLog.addEventListener('click', (e) => {
            e.preventDefault();
            historyContainer.innerHTML = '';
            historyPage = 1;
            isHistoryEnd = false;
            endIndicator.classList.add('hidden');

            historyModal.classList.remove('hidden');
            historyModal.classList.add('flex');
            setTimeout(() => {
                historyModal.classList.remove('opacity-0');
                historyBox.classList.remove('scale-95');
            }, 10);

            loadHistoryData();
        });
    }

    // Event Tutup Modal
    if (btnCloseHistory) {
        btnCloseHistory.addEventListener('click', () => {
            historyModal.classList.add('opacity-0');
            historyBox.classList.add('scale-95');
            setTimeout(() => {
                historyModal.classList.remove('flex');
                historyModal.classList.add('hidden');
            }, 300);
        });
    }

});

async function loadRecentAttendanceWidget(forceSync = false) {
    const container = document.getElementById('dashboardRecentLogs');
    if (!container) return;

    // Tampilkan efek loading animasi
    container.innerHTML = `<div class="text-center text-xs text-slate-500 animate-pulse py-4"><span class="material-symbols-outlined animate-spin mb-1 text-red-500">autorenew</span><br>Syncing node...</div>`;

    try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('dparagon_token');
        const fullName = localStorage.getItem('full_name') || '';    // Ambil nama dari storage

        // Selipkan &name= ke URL
        const url = forceSync
            ? `/api/attendance/recent?force=true&name=${encodeURIComponent(fullName)}`
            : `/api/attendance/recent?name=${encodeURIComponent(fullName)}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (result.status && result.data && result.data.length > 0) {
            container.innerHTML = ''; // Bersihkan container

            result.data.forEach(item => {
                // Formatting Teks Waktu
                let dateText = "Unknown Date";
                let timeText = "--:--";

                if (item.raw_time) {
                    const parts = item.raw_time.split('\n');
                    if (parts.length >= 2) {
                        dateText = parts[0].trim();
                        const rawTimeStr = parts[1].trim();
                        timeText = rawTimeStr.replace(' (WIB)', '');
                    } else {
                        timeText = item.raw_time.trim();
                    }
                }

                // ==========================================
                // DYNAMIC BADGE: Checkin (Hijau) | Checkout (Orange)
                // ==========================================
                const isCheckin = item.status.toLowerCase() === 'checkin';
                const badgeClass = isCheckin
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                    : "bg-orange-500/10 text-orange-500 border-orange-500/30";
                const dotClass = isCheckin ? "bg-emerald-500" : "bg-orange-500";

                const badgeHtml = `<span class="${badgeClass} border text-[10px] px-2 py-1 rounded-full font-bold uppercase flex items-center gap-1 shadow-sm"><div class="w-1.5 h-1.5 ${dotClass} rounded-full animate-pulse"></div> ${item.status}</span>`;

                // Render HTML Kartu
                const shiftText = item.shift_info && item.shift_info !== "-" ? item.shift_info : "D'Paragon Node";

                const html = `
                    <div class="flex items-center gap-4 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors shadow-sm">
                        <div class="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                            ${item.image_url
                        ? `<img src="${item.image_url}" class="w-full h-full object-cover">`
                        : `<span class="material-symbols-outlined text-slate-500 text-xl">person</span>`
                    }
                        </div>
                        
                        <div class="flex-1 min-w-0">
                            <h4 class="text-slate-200 text-xs font-bold truncate">${shiftText}</h4>
                            <p class="text-slate-500 text-[10px] mt-0.5 truncate">${dateText} • ${timeText}</p>
                        </div>
                        
                        <div>${badgeHtml}</div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
            });
        } else {
            // ==========================================
            // JIKA DATA KOSONG: Munculkan Info Klik View Log
            // ==========================================
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-5 bg-slate-950/50 rounded-xl border border-slate-800 border-dashed text-center">
                    <span class="material-symbols-outlined text-slate-600 mb-2 text-2xl">history_toggle_off</span>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum Ada Data Disinkronkan.</p>
                    <p class="text-[9px] text-slate-500 mt-1">Klik <span class="text-red-500 font-bold uppercase">View Full Log</span> terlebih dahulu.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Widget Error:", error);
        container.innerHTML = `
            <div class="flex items-center justify-center py-4 bg-error/10 border border-error/20 rounded-lg">
                <p class="text-[10px] font-bold text-error uppercase tracking-widest">Failed to sync node.</p>
            </div>
        `;
    }
}

// Langsung panggil fungsinya pas halaman dashboard beres dimuat
document.addEventListener('DOMContentLoaded', () => {
    loadRecentAttendanceWidget();
});