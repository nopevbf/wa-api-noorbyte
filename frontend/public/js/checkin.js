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

                // Hilangkan fungsi callback (window.location.href) biar gak pindah halaman
                showSystemAlert('BYPASS SUCCESS', "Data kehadiran diterima. Sinkronisasi node selesai.", 'success');

                // Opsional: Ubah tombol biar ngasih tau kalau udah kelar
                btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl">check_circle</span> TERKIRIM`;

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
            if (response.ok) {

                progressBar.style.width = '100%';
                processLog.innerText = `[SUCCESS] ACCESS GRANTED.`;
                processLog.classList.remove('text-error');
                processLog.classList.add('text-green-500');
                progressBar.classList.replace('bg-error', 'bg-green-500');

                // Simpan token 
                const token = result.token || result.access_token || (result.data && (result.data.token || result.data.access_token)) || (result.payload && (result.payload.token || result.payload.access_token));
                if (token) {
                    localStorage.setItem('dparagon_token', token);
                }

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
            }, 5000);
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
});