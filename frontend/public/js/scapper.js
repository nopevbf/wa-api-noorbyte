// 1. Trik SQA: Load dotenv biasa dulu, kalau gagal baru pake path manual
require('dotenv').config();

// ==========================================
// HELPER: KIRIM LOG REAL-TIME KE FRONTEND
// ==========================================
function sendLog(message, type = 'info') {
    // Tetap print di terminal server
    console.log(message);

    // Kirim via Socket.io ke frontend kalau socketnya udah ready
    if (global.io) {
        global.io.emit('security_log', {
            message: message,
            type: type,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false })
        });
    }
}

if (!process.env.NODE_ENV) {
    // Fallback kalau path .env ada di folder root (luar folder controllers)
    require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
}

const puppeteer = require('puppeteer');
const path = require('path');

// 2. DEBUGGING: Print semua isi config biar keliatan beneran kebaca atau nggak!
console.log("==========================================");
console.log("[DEBUG ENV] NODE_ENV saat ini:", process.env.NODE_ENV || "TIDAK DITEMUKAN (FALLBACK KE DEV)");
console.log("[DEBUG ENV] URL PROD:", process.env.DPARAGON_URL || "TIDAK DITEMUKAN");
console.log("==========================================");

// ==========================================
// KONFIGURASI ENVIRONMENT
// ==========================================
const ENV_CONFIG = {
    development: {
        baseUrl: process.env.DPARAGON_URL_DEV,
        email: process.env.DPARAGON_EMAIL_DEV,
        password: process.env.DPARAGON_PASSWORD_DEV
    },
    production: {
        baseUrl: process.env.DPARAGON_URL,
        email: process.env.DPARAGON_EMAIL,
        password: process.env.DPARAGON_PASSWORD
    }
};

// Tambahkan parameter env (default 'development')
async function scrapeDparagonAttendance(fullName = "", targetPage = 1) {
    // Ambil config sesuai env (kalau env ngaco, fallback ke development)
    const env = process.env.NODE_ENV || 'development';
    const config = ENV_CONFIG[env] || ENV_CONFIG['development'];

    // console.log(`[SYSTEM] Initiating Puppeteer Engine for ENV: [${env.toUpperCase()}]...`);
    sendLog(`[SYSTEM] Initiating Puppeteer Engine for ENV: [${env.toUpperCase()}]...`, 'info');

    // Pisahkan folder session berdasarkan env biar cookies nggak bentrok!
    const sessionDir = `browser_session_${env}`;

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized'],
        userDataDir: path.join(__dirname, sessionDir)
    });

    const page = await browser.newPage();

    try {
        const encodedName = encodeURIComponent(fullName);

        // MASUKKAN targetPage KE DALAM URL!
        const targetUrl = `${config.baseUrl}/hrd/reportAttendance?devision_filter=&location_filter=&area_filter=&name_filter=${encodedName}&date_range_filter=&status_filter=&page=${targetPage}`;

        console.log(`[PROCESS] Membuka Target URL Page ${targetPage}: ${config.baseUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        const currentUrl = page.url();

        if (currentUrl.includes('/login')) {
            console.log(`[INFO] Session ${env.toUpperCase()} kosong. Memulai proses Login...`);

            // Inject kredensial dinamis dari config
            await page.waitForSelector('input[id="username"]');
            await page.type('input[id="username"]', config.email, { delay: 50 });

            await page.waitForSelector('input[id="userpassword"]');
            await page.type('input[id="userpassword"]', config.password, { delay: 50 });

            console.log("[PROCESS] Submit Credentials...");
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                page.click('button[type="submit"]')
            ]);

            // console.log(`[SUCCESS] Login ${env.toUpperCase()} Berhasil! Session tersimpan.`);
            sendLog(`[SUCCESS] Login ${env.toUpperCase()} Berhasil! Session tersimpan.`, 'success');

            console.log("[PROCESS] Berpindah ke Halaman Report...");
            await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        } else {
            // console.log(`[SUCCESS] Session Login ${env.toUpperCase()} masih AKTIF! Skip login...`);
            sendLog(`[SUCCESS] Session Login ${env.toUpperCase()} masih AKTIF! Skip login...`, 'success');
        }

        /// ==========================================
        // FASE 2: EXTRACT DATA (AUTO-DETECT STRUKTUR TABEL)
        // ==========================================
        await page.waitForSelector('table tbody tr');

        // Udah gak perlu passing variabel env lagi ke dalam evaluate
        const attendanceData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            const extracted = [];

            // 1. DETEKSI OTOMATIS: Cek apakah ada kolom "Shift Jam" di Header
            const thElements = Array.from(document.querySelectorAll('table thead th'));
            const hasShiftJam = thElements.some(th => th.innerText.trim().toLowerCase() === 'shift jam');

            // 2. SET INDEX DINAMIS Berdasarkan hasil deteksi
            const idxFotoMasuk = 5;
            const idxWaktuMasuk = hasShiftJam ? 7 : 6;
            const idxFotoKeluar = hasShiftJam ? 8 : 7;
            const idxWaktuKeluar = hasShiftJam ? 9 : 8;
            // Ambil index Shift (Prod di 6, Dev di 11)
            const idxShift = hasShiftJam ? 6 : 11;

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');

                if (cells.length >= 9) {

                    // Ekstrak Teks Shift & ratakan spasinya biar rapi
                    let textShift = "Regular Shift";
                    if (cells[idxShift]) {
                        textShift = cells[idxShift].innerText.replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                    }

                    const imgMasukEl = cells[idxFotoMasuk]?.querySelector('img');
                    const fotoMasuk = imgMasukEl ? imgMasukEl.src : null;
                    const waktuMasuk = cells[idxWaktuMasuk]?.innerText.trim() || null;

                    const imgKeluarEl = cells[idxFotoKeluar]?.querySelector('img');
                    const fotoKeluar = imgKeluarEl ? imgKeluarEl.src : null;
                    const waktuKeluar = cells[idxWaktuKeluar]?.innerText.trim() || null;

                    const validMasuk = waktuMasuk && waktuMasuk !== '-';
                    const validKeluar = waktuKeluar && waktuKeluar !== '-';

                    if (validMasuk || validKeluar) {
                        extracted.push({
                            shift_info: textShift, // <--- INI DATA BARUNYA
                            foto_masuk: fotoMasuk,
                            waktu_masuk: validMasuk ? waktuMasuk : null,
                            foto_keluar: fotoKeluar,
                            waktu_keluar: validKeluar ? waktuKeluar : null
                        });
                    }
                }
            });

            return extracted;
        });

        // console.log(`[SUCCESS] Scraping selesai! Ditemukan ${attendanceData.length} baris. atas nama ${fullName}`);
        sendLog(`[SUCCESS] Scraping selesai! Ditemukan ${attendanceData.length} baris. atas nama ${fullName}`, 'success');
        return attendanceData;

    } catch (error) {
        // console.error("[CRITICAL ERROR] Proses Scraping Terhenti!", error);
        sendLog(`[CRITICAL ERROR] Proses Scraping Terhenti: ${error.message}`, 'error');
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeDparagonAttendance };