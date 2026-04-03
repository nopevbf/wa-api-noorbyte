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
});