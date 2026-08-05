// ==========================================
// KONFIGURASI GLOBAL
// ==========================================
const API_URL = "/api";
let NEXT_ACTION = "MASUK";
let isPreviewMode = false; // TDZ Fix: Diangkat ke scope terluas

// ==========================================
// FUNGSI GLOBAL SYSTEM ALERT (PENGGANTI ALERT BROWSER)
// ==========================================
function showSystemAlert(title, message, type = 'error', callback = null) {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        alert(`${title}: ${message}`);
    }
    
    if (typeof callback === 'function') {
        callback();
    }
}

/**
 * Helper to show Jailbreak Login Modal
 */
function showJailbreakLoginModal() {
    const authModal = document.getElementById('dparagonAuthModal');
    const authContent = document.getElementById('dparagonAuthContent');
    if (authModal) {
        authModal.classList.remove('hidden');
        if (authContent) {
            authContent.classList.remove('scale-95', 'opacity-0');
            authContent.classList.add('scale-100', 'opacity-100');
        }
    }
}
window.showJailbreakLoginModal = showJailbreakLoginModal;

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

    // ===================================
    // SOCKET.IO: LISTEN FOR TIMEBOMB SUCCESS
    // ===================================
    const socket = io();
    const myApiKey = localStorage.getItem('noorbyte_session');
    if (myApiKey) {
        socket.on(`timebomb-success-${myApiKey}`, (data) => {
            console.log("[SOCKET] Time-Bomb success received:", data);
            
            // 1. Tampilkan Alert Sukses
            showSystemAlert('TIME-BOMB SUCCESS', data.message, 'success');
            
            // 2. Reset Tombol Capture (jika sedang mode standby)
            const btnCapture = document.getElementById('btnCapture');
            if (btnCapture) {
                btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl md:text-2xl">photo_camera</span> Ambil & Kirim`;
                btnCapture.className = "w-full bg-red-600 hover:bg-red-700 text-white py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg";
                btnCapture.disabled = false;
            }
            
            // 3. Sembunyikan tombol cancel & munculkan tombol retake
            const cancelBtn = document.getElementById('btnCancelTimebomb');
            if (cancelBtn) cancelBtn.classList.add('hidden');
            const retakeBtn = document.getElementById('btnRetake');
            if (retakeBtn) retakeBtn.classList.remove('hidden');
            
            // 4. UPDATE LOCAL STORAGE STATE
            markAttendanceSuccessLocally();
        });

        socket.on(`timebomb-error-${myApiKey}`, (data) => {
            console.error("[SOCKET] Time-Bomb error received:", data);
            
            // 1. Tampilkan Alert Error
            showSystemAlert('TIME-BOMB FAILED', data.message, 'error');
            
            // 2. Reset Tombol Capture ke mode semula agar bisa coba lagi
            const btnCapture = document.getElementById('btnCapture');
            if (btnCapture) {
                btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl md:text-2xl">photo_camera</span> Ambil & Kirim`;
                btnCapture.className = "w-full bg-red-600 hover:bg-red-700 text-white py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg";
                btnCapture.disabled = false;
            }

            // 3. Sembunyikan tombol cancel & munculkan tombol retake
            const cancelBtn = document.getElementById('btnCancelTimebomb');
            if (cancelBtn) cancelBtn.classList.add('hidden');
            const retakeBtn = document.getElementById('btnRetake');
            if (retakeBtn) retakeBtn.classList.remove('hidden');

            localStorage.removeItem('active_timebomb_key');
        });
    }

    // ===================================
    // 0. CEK SESSION (STRICT GUARD)
    // ===================================
    if (typeof isJailbreakSessionValid === 'function' && isJailbreakSessionValid()) {
        console.log("[SYSTEM] Valid Jailbreak session detected.");
        if (authModal) authModal.classList.add('hidden');
        initAttendanceState();
        // Start camera slightly delayed to ensure DOM is ready
        setTimeout(() => {
            if (typeof startCamera === 'function') startCamera();
        }, 500);
    } else {
        console.warn("[SYSTEM] Invalid/Expired Jailbreak session. Redirecting to Jailbreak Terminal.");
        window.location.replace("/jailbreak");
        return;
    }

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
            // 0. VALIDASI SESSION (REAL-TIME)
            // ===================================
            if (typeof isJailbreakSessionValid === 'function' && !isJailbreakSessionValid()) {
                showSystemAlert('SESSION EXPIRED', 'Sesi D\'Paragon Anda telah berakhir. Anda akan diarahkan kembali ke Terminal.', 'error', () => {
                    window.location.replace("/jailbreak");
                });
                return;
            }
            if (typeof updateJailbreakActivity === 'function') updateJailbreakActivity();

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

                // DYNAMIC BUTTON COLOR & TEXT
                const btnColor = NEXT_ACTION === 'KELUAR' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700';
                btnCapture.className = `w-full ${btnColor} text-white py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg`;
                btnCapture.innerHTML = `ABSEN ${NEXT_ACTION}`;

                isPreviewMode = true;

            } else {
                // ===================================
                // 5. CEK SAKLAR TIME-BOMB / INSTANT
                // ===================================
                const toggleTimeBomb = document.getElementById('toggleTimeBomb');
                const isTimeBombActive = toggleTimeBomb ? toggleTimeBomb.checked : false;

                if (isTimeBombActive) {
                    // --- MODE TERJADWAL (TIME-BOMB) ---
                    const scheduleModal = document.getElementById('scheduleCheckinModal');
                    const hhInput = document.getElementById('scheduleTimeHH');
                    const mmInput = document.getElementById('scheduleTimeMM');

                    // Isi default input dengan jam sekarang (format 24 jam: HH:MM)
                    const now = new Date();
                    hhInput.value = String(now.getHours()).padStart(2, '0');
                    mmInput.value = String(now.getMinutes()).padStart(2, '0');

                    // Tampilkan Modal
                    scheduleModal.classList.remove('hidden');
                    scheduleModal.classList.add('flex');

                    // Logic Tombol Batal
                    document.getElementById('btnCancelSchedule').onclick = () => {
                        scheduleModal.classList.add('hidden');
                        scheduleModal.classList.remove('flex');
                    };

                    // Logic Tombol Jadwalkan (KIRIM KE SERVER)
                    document.getElementById('btnConfirmSchedule').onclick = async () => {
                        let hStr = document.getElementById('scheduleTimeHH').value;
                        let mStr = document.getElementById('scheduleTimeMM').value;
                        
                        if (!hStr || !mStr) {
                            showSystemAlert("Error", "Jam dan menit wajib diisi.");
                            return;
                        }

                        let h = parseInt(hStr);
                        let m = parseInt(mStr);
                        
                        if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
                            showSystemAlert("Error", "Format waktu tidak valid (HH: 0-23, MM: 0-59).");
                            return;
                        }

                        const targetTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        
                        // Tutup modal
                        scheduleModal.classList.add('hidden');
                        scheduleModal.classList.remove('flex');

                        // Siapin Koper (Data yang mau dikirim ke server)
                        const lat = document.getElementById('inputLat').value;
                        const lng = document.getElementById('inputLng').value;
                        const token = localStorage.getItem('access_token') || localStorage.getItem('dparagon_token');
                        const dpApiUrlInput = document.getElementById('dpApiUrl');
                        const dpUrl = dpApiUrlInput ? dpApiUrlInput.value : defaultDparagonApiUrl;

                        if (!token || !lat || !lng || !finalBase64Photo) {
                            showSystemAlert('ERROR', 'Payload tidak lengkap. Pastikan lokasi terkunci dan foto diambil.', 'error');
                            return;
                        }

                        // Ubah tombol jadi loading upload
                        btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl animate-spin">cloud_sync</span> UPLOADING KE SERVER...`;
                        btnCapture.disabled = true;
                        btnRetake.classList.add('hidden');

                        try {
                            console.log("[SYSTEM] Memindahkan bom waktu ke server Node.js...");

                            // Lempar koper ke backend
                            const res = await fetch('/api/attendance/schedule-timebomb', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    targetTime: targetTime,
                                    action: NEXT_ACTION,
                                    token: token,
                                    dpUrl: dpUrl,
                                    api_key: localStorage.getItem('noorbyte_session') || '',
                                    payload: {
                                        latitude: parseFloat(lat),
                                        longitude: parseFloat(lng),
                                        image: finalBase64Photo
                                    }
                                })
                            });

                            const data = await res.json();

                            if (data.status) {
                                // JIKA SERVER SUKSES NERIMA, UBAH WARNA TOMBOL JADI HIJAU
                                btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl">cloud_done</span> STANDBY DI SERVER`;
                                btnCapture.classList.remove('bg-red-600', 'hover:bg-red-700', 'bg-amber-500', 'hover:bg-amber-600');
                                btnCapture.classList.add('bg-emerald-600', 'hover:bg-emerald-700');

                                // Simpan timer_key yang dikembalikan server untuk keperluan cancel
                                if (data.timer_key) localStorage.setItem('active_timebomb_key', data.timer_key);

                                // Tampilkan tombol Batalkan Time-Bomb
                                const cancelBtn = document.getElementById('btnCancelTimebomb');
                                if (cancelBtn) cancelBtn.classList.remove('hidden')
                                btnRetake.classList.add('hidden');

                                // Kasih alert keren ngasih tau user bebas nutup browser
                                showSystemAlert('SERVER TIMER ACTIVE', `Data dikunci di server pusat. Absen akan ditembakkan jam ${targetTime}.\n\nAnda AMAN untuk menutup browser atau mematikan perangkat ini.`, 'success');
                            } else {
                                throw new Error(data.message);
                            }
                        } catch (err) {
                            showSystemAlert('SERVER UPLOAD ERROR', err.message, 'error');
                            btnCapture.innerHTML = `ABSEN ${NEXT_ACTION}`;
                            btnCapture.disabled = false;
                        }
                    };
                } else {
                    // --- MODE INSTANT KILL (EKSEKUSI LANGSUNG) ---
                    console.log(`[SYSTEM] Mode Instant Triggered. Melakukan eksekusi langsung...`);
                    submitPresence();
                }
            }
        });
    }

    // ==========================================
    // LOGIC TOMBOL CANCEL TIME-BOMB
    // ==========================================
    const btnCancelTimebomb = document.getElementById('btnCancelTimebomb');
    if (btnCancelTimebomb) {
        btnCancelTimebomb.addEventListener('click', async () => {
            btnCancelTimebomb.disabled = true;
            btnCancelTimebomb.innerHTML = `<span class="material-symbols-outlined text-base animate-spin">autorenew</span> Membatalkan...`;

            try {
                // Pakai timer_key yang tersimpan dari sesi schedule (berlaku untuk admin & user biasa)
                const apiKey = localStorage.getItem('active_timebomb_key')
                    || localStorage.getItem('noorbyte_session')
                    || '';
                const res = await fetch('/api/attendance/cancel-timebomb', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: apiKey })
                });
                const data = await res.json();

                if (data.status) {
                    // Bersihkan key dari localStorage
                    localStorage.removeItem('active_timebomb_key');
                    // Reset tombol capture ke mode awal
                    btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl md:text-2xl">photo_camera</span> Ambil & Kirim`;
                    btnCapture.className = "w-full bg-red-600 hover:bg-red-700 text-white py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg";
                    btnCapture.disabled = false;
                    btnRetake.classList.remove('hidden');
                    btnCancelTimebomb.classList.add('hidden');
                    showSystemAlert('TIMER CANCELLED', data.message, 'success');
                } else {
                    showSystemAlert('CANCEL GAGAL', data.message, 'error');
                    btnCancelTimebomb.disabled = false;
                    btnCancelTimebomb.innerHTML = `<span class="material-symbols-outlined text-base">timer_off</span> Batalkan Jadwal Absen`;
                }
            } catch (err) {
                showSystemAlert('ERROR', err.message, 'error');
                btnCancelTimebomb.disabled = false;
                btnCancelTimebomb.innerHTML = `<span class="material-symbols-outlined text-base">timer_off</span> Batalkan Jadwal Absen`;
            }
        });
    }

    // ==========================================
    // FUNGSI UTAMA: TEMBAK API ABSENSI
    // Tambah parameter isTimeBombMode buat ngenalin siapa yang manggil
    // ==========================================
    async function submitPresence(lateReason = "", isTimeBombMode = false) {
        try {
            // Ambil Access Token User yang sedang login
            const token = localStorage.getItem('access_token') || localStorage.getItem('dparagon_token');
            // ... (Kode validasi token, GPS, dan payload di sini TETAP SAMA) ...

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

                        if (response.ok && result.status !== false) {
                showSystemAlert('BYPASS SUCCESS', "Data kehadiran diterima. Memulai sinkronisasi log otomatis...", 'success');
                if (isTimeBombMode) {
                    btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl">cloud_done</span> STANDBY DI SERVER`;
                    // Ensure it turns emerald whether it was red (MASUK) or amber (KELUAR)
                    btnCapture.classList.remove('bg-red-600', 'hover:bg-red-700', 'bg-amber-500', 'hover:bg-amber-600');
                    btnCapture.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
                } else {
                    btnCapture.innerHTML = `<span class="material-symbols-outlined text-xl">check_circle</span> TERKIRIM`;
                }
                btnRetake.classList.remove('hidden');
                markAttendanceSuccessLocally();
            } else {
                // ==========================================
                // SQA X-RAY: BEDAH ERROR DARI SERVER
                // ==========================================
                let realError = "Ditolak oleh sistem.";

                if (result.errors) {
                    realError = JSON.stringify(result.errors);
                } else if (result.message) {
                    realError = typeof result.message === 'object' ? JSON.stringify(result.message) : result.message;
                }

                throw new Error(realError); // Lempar error yang udah dibedah ke catch di bawah!
            }

        } catch (error) {
            console.warn("Absen Ditolak:", error.message);

            // ==========================================
            // SQA AUTO-RESOLVE LOGIC (SMART DETECTOR)
            // ==========================================

            // Ngecek apakah error dari server BENERAN nanyain alasan telat
            const isLateError = error.message.includes('late_reason') || error.message.includes('Alasan');

            // Cuma aktif kalau emang belum ngirim alasan DAN server minta alasan
            if (lateReason === "" && isLateError) {

                if (isTimeBombMode) {
                    console.log("[SYSTEM] Time-Bomb ditolak (butuh alasan). Mengaktifkan Silent Auto-Resolve: 'Urusan Keluarga'...");
                    submitPresence("Urusan Keluarga", true);
                } else {
                    // Jika absen manual biasa, munculin popup minta alasan
                    const modal = document.getElementById('lateReasonModal');
                    if (modal) {
                        modal.classList.remove('hidden');
                        modal.classList.add('flex');
                    } else {
                        showSystemAlert('CRITICAL ERROR', "Modal alasan keterlambatan tidak ditemukan di HTML.", 'error');
                    }
                }

            } else {
                // JIKA ERROR BUKAN KARENA TELAT (Misal: Fake GPS, dll) 
                // ATAU UDAH MAKSA PAKAI ALASAN TAPI TETAP DITOLAK
                showSystemAlert('CRITICAL ERROR', error.message, 'error');

                // Kembalikan Tombol ke Mode Normal biar bisa retake
                btnCapture.innerHTML = `ABSEN ${NEXT_ACTION}`;
                btnCapture.disabled = false;
            }
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
            btnCapture.innerHTML = `ABSEN ${NEXT_ACTION}`;
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

            // Reset warna dan teks tombol ke mode awal
            btnCapture.className = "w-full bg-red-600 hover:bg-red-700 text-white py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg";
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

    // Modal showing is now handled lazily by user actions (like btnCapture)
    // or manually triggered when needed, rather than automatically on page load.

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
                if (typeof updateJailbreakActivity === 'function') updateJailbreakActivity(true);

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
                    const detectedEnv = apiInputUrl.includes('dparagon6') ? 'dev' : 'prod';
                    localStorage.setItem('active_env', detectedEnv);

                    console.log(`[AUTH] Environment diset ke: ${detectedEnv.toUpperCase()}`);

                    // ==========================================
                    // SUNTIKAN SQA: SURUH PUPPETEER JALAN DI BACKGROUND!
                    // ==========================================
                    // Langsung pake variabel email & password yang udah ada di paling atas!
                    fetch('/api/jailbreak/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            env: detectedEnv,
                            email: email, // <-- Pake variabel dari atas
                            password: password, // <-- Pake variabel dari atas
                            fullName: extractedName
                        })
                    }).catch(err => console.error("Gagal memanggil Scraper:", err));

                    // PENTING: Lanjut baca peringatan di bawah soal baris ini!
                    // window.location.href = '/jailbreak/terminal';

                } else {
                    console.warn("[AUTH] Gagal menangkap nama user dari payload.");
                    // Tampilkan pesan error ke user (Password salah / dll)
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
                        if (typeof updateJailbreakActivity === 'function') updateJailbreakActivity();
                        if (typeof startCamera === 'function') startCamera();
                        initAttendanceState();
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
    // LOGIC SWITCH ACTION MANUAL
    // ==========================================
    const btnSwitchAction = document.getElementById('btnSwitchAction');
    if (btnSwitchAction) {
        btnSwitchAction.addEventListener('click', () => {
            NEXT_ACTION = NEXT_ACTION === 'MASUK' ? 'KELUAR' : 'MASUK';
            renderAttendanceStateUI();
            
            // Animasi kecil di tombol saat di-klik
            btnSwitchAction.querySelector('span').classList.add('animate-spin');
            setTimeout(() => {
                btnSwitchAction.querySelector('span').classList.remove('animate-spin');
            }, 500);

            showSystemAlert('MANUAL OVERRIDE', `Status Absen diubah paksa menjadi: ${NEXT_ACTION}`, 'success');
        });
    }

});

// ==========================================
// LOCAL ATTENDANCE STATE (PENGGANTI HISTORY)
// ==========================================
function markAttendanceSuccessLocally() {
    if (NEXT_ACTION === 'MASUK') {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('last_checkin_date', today);
    }
    initAttendanceState();
}

function renderAttendanceStateUI() {
    // Ubah breadcrumb Label
    const labelAbsen = document.getElementById('labelAbsen');
    if (labelAbsen) {
        labelAbsen.innerText = `Absen ${NEXT_ACTION}`;
        if (NEXT_ACTION === 'KELUAR') {
            labelAbsen.classList.replace('text-red-600', 'text-amber-500');
        } else {
            labelAbsen.classList.replace('text-amber-500', 'text-red-600');
        }
    }

    // Ubah Button Capture (jika tidak sedang dalam TimeBomb)
    const btnCapture = document.getElementById('btnCapture');
    const isTimeBombActive = document.getElementById('toggleTimeBomb')?.checked;
    if (btnCapture && !isTimeBombActive && btnCapture.innerText?.includes('Ambil & Kirim')) {
        // Biarkan 'Ambil & Kirim'
    } else if (btnCapture && !isTimeBombActive) {
        const btnColor = NEXT_ACTION === 'KELUAR' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700';
        btnCapture.className = `w-full ${btnColor} text-white py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg`;
        btnCapture.innerHTML = `ABSEN ${NEXT_ACTION}`;
    }
}

function initAttendanceState() {
    const today = new Date().toISOString().split('T')[0];
    const lastCheckin = localStorage.getItem('last_checkin_date');
    
    // Jika hari ini sudah pernah absen (MASUK), maka selanjutnya KELUAR
    if (lastCheckin === today) {
        NEXT_ACTION = 'KELUAR';
    } else {
        NEXT_ACTION = 'MASUK';
    }

    renderAttendanceStateUI();
}