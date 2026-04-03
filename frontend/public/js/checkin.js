// ==========================================
// KONFIGURASI GLOBAL
// ==========================================
const API_URL = "/api";

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

    // 1. FETCH APP CONFIG (ENV-BASED DEFAULT URL)
    try {
        const configRes = await fetch(`${API_URL}/app-config`);
        const configData = await configRes.json();

        if (configData.status && configData.data) {
            defaultDparagonApiUrl = configData.data.dparagonApiUrl || "";

            // Tampilkan badge environment
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

            // Set default value kalau belum ada input
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

    // 2. Munculkan modal otomatis
    setTimeout(() => {
        authContent.classList.remove('scale-95', 'opacity-0');
        authContent.classList.add('scale-100', 'opacity-100');
    }, 300);

    // 3. Handle Submit Form
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const dpUrl = document.getElementById('dpApiUrl').value;
        const email = document.getElementById('dpEmail').value;
        const password = document.getElementById('dpPassword').value;

        // Ubah UI jadi mode Loading
        btnSubmit.classList.add('hidden');
        loadingArea.classList.remove('hidden');
        loadingArea.classList.add('flex');

        document.getElementById('dpEmail').disabled = true;
        document.getElementById('dpPassword').disabled = true;

        setTimeout(() => { progressBar.style.width = '100%'; }, 100);

        // Animasi Teks Terminal
        setTimeout(() => { processLog.innerText = `[OK] ESTABLISHING LINK TO ${dpUrl}...`; }, 800);
        setTimeout(() => { processLog.innerText = `[OK] DECRYPTING KREDENSIAL: ${email}...`; }, 1600);
        setTimeout(() => {
            processLog.innerText = `[SUCCESS] ACCESS GRANTED.`;
            processLog.classList.remove('text-error');
            processLog.classList.add('text-green-500');
            progressBar.classList.replace('bg-error', 'bg-green-500');
        }, 2500);

        // Selesai & Tutup Modal
        setTimeout(() => {
            localStorage.setItem('dparagon_target_url', dpUrl);
            localStorage.setItem('dparagon_target_email', email);
            localStorage.setItem('dparagon_target_password', password);

            authContent.classList.replace('scale-100', 'scale-95');
            authContent.classList.replace('opacity-100', 'opacity-0');
            authModal.classList.replace('bg-slate-950/90', 'bg-transparent');

            setTimeout(() => {
                authModal.classList.add('hidden');
            }, 500);
        }, 3000);
    });

    // ==========================================
    // LOGIC SET LOCATION (TOGGLE LOCK/UNLOCK)
    // ==========================================
    const inputLat = document.getElementById('inputLat');
    const inputLng = document.getElementById('inputLng');
    const btnSetLocation = document.getElementById('btnSetLocation');
    const iconLocation = document.getElementById('iconLocation');
    const textLocation = document.getElementById('textLocation');

    // Variabel penyimpan status (Awalnya tidak terkunci)
    let isLocationLocked = false;

    if (btnSetLocation) {
        btnSetLocation.addEventListener('click', () => {

            if (!isLocationLocked) {
                // ====================================
                // PROSES MENGUNCI LOKASI
                // ====================================
                if (inputLat.value.trim() === '' || inputLng.value.trim() === '') {
                    alert('Koordinat Latitude dan Longitude tidak boleh kosong!');
                    return;
                }

                isLocationLocked = true; // Ubah status
                inputLat.readOnly = true;
                inputLng.readOnly = true;

                // UI Input (Redup dan dilarang klik)
                inputLat.classList.add('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');
                inputLng.classList.add('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');

                // UI Button (Tema Merah Terkunci)
                iconLocation.innerText = 'lock';
                textLocation.innerText = 'Unlock Location';

                // Ganti class tombol jadi aura Jailbreak/Alert
                btnSetLocation.className = "w-full bg-error/10 text-error border border-error/50 hover:bg-error/20 py-3 rounded-lg font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.1)]";

            } else {
                // ====================================
                // PROSES MEMBUKA KUNCI LOKASI
                // ====================================
                isLocationLocked = false; // Ubah status kembali
                inputLat.readOnly = false;
                inputLng.readOnly = false;

                // UI Input (Kembali normal)
                inputLat.classList.remove('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');
                inputLng.classList.remove('cursor-not-allowed', 'opacity-60', 'bg-slate-950/50');

                // UI Button (Kembali normal)
                iconLocation.innerText = 'my_location';
                textLocation.innerText = 'Set Location';

                // Ganti class tombol balik ke awal
                btnSetLocation.className = "w-full bg-slate-800 hover:bg-slate-700 hover:border-error/50 text-slate-200 border border-slate-700 py-3 rounded-lg font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm";
            }
        });
    }
});