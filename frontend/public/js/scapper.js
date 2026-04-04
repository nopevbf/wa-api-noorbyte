// 1. Trik SQA: Load dotenv biasa dulu, kalau gagal baru pake path manual
require('dotenv').config();
const axios = require('axios'); // Pastiin lo udah import axios di atas

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
        apiUrl: process.env.DPARAGON_API_URL_DEV,
        email: process.env.DPARAGON_EMAIL_DEV,
        password: process.env.DPARAGON_PASSWORD_DEV
    },
    production: {
        baseUrl: process.env.DPARAGON_URL,
        apiUrl: process.env.DPARAGON_API_URL_PROD,
        email: process.env.DPARAGON_EMAIL,
        password: process.env.DPARAGON_PASSWORD
    }
};

// Tambahkan parameter env (default 'development')
// Sekarang nerima 4 parameter dari Frontend!
async function scrapeDparagonAttendance(env, email, password, fullName, targetPage = 1) {
    // ==========================================
    // SQA TRANSLATOR: Samain persepsi singkatan!
    // ==========================================
    let mappedEnv = env;
    if (env === 'prod') mappedEnv = 'production';
    if (env === 'dev') mappedEnv = 'development';

    // Ambil config Base URL (https://management...) berdasarkan env dari Frontend
    const config = ENV_CONFIG[mappedEnv] || ENV_CONFIG['development'];

    // UBAH JADI GINI (Pake tanda tanya & OR biar aman):
    const safeEnv = mappedEnv || 'development';
    const safeName = fullName || 'UNKNOWN USER';
    sendLog(`[SYSTEM] Initiating Master Override untuk [${safeName.toUpperCase()}] di ENV [${safeEnv.toUpperCase()}]...`, 'info');

    const sessionDir = `browser_session_${mappedEnv}`;
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized'],
        userDataDir: path.join(__dirname, sessionDir)
    });

    const page = await browser.newPage();

    try {
        const encodedName = encodeURIComponent(fullName);
        const targetUrl = `${config.baseUrl}/hrd/reportAttendance?devision_filter=&location_filter=&area_filter=&name_filter=${encodedName}&date_range_filter=&status_filter=&page=${targetPage}`;

        sendLog(`[PROCESS] Membuka Base URL: ${config.baseUrl}`, "info");
        await page.goto(config.baseUrl, { waitUntil: 'networkidle2' });

        const currentUrl = page.url();

        // Kalau dilempar ke login page, eksekusi login pake kredensial dari UI
        if (currentUrl.includes('/login')) {
            sendLog(`[INFO] Session kosong. Melakukan otorisasi Web...`, 'info');

            await page.waitForSelector('input[id="username"]');
            await page.type('input[id="username"]', email, { delay: 50 });

            await page.waitForSelector('input[id="userpassword"]');
            await page.type('input[id="userpassword"]', password, { delay: 50 });

            sendLog("[PROCESS] Submit Kredensial...", "info");
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                page.click('button[type="submit"]')
            ]);
            sendLog(`[SUCCESS] Web Login Berhasil!`, 'success');
        } else {
            sendLog(`[SUCCESS] Otorisasi Bypass masih aktif. Melanjutkan...`, 'success');
        }

        sendLog(`[PROCESS] Menuju Direktori Absensi...`, "info");
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        // ==========================================
        // EXTRACT DATA TABEL (Kode scrape lo yang asli)
        // ==========================================
        await page.waitForSelector('table tbody tr');

        const attendanceData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            const extracted = [];

            const thElements = Array.from(document.querySelectorAll('table thead th'));
            const hasShiftJam = thElements.some(th => th.innerText.trim().toLowerCase() === 'shift jam');

            const idxFotoMasuk = 5;
            const idxWaktuMasuk = hasShiftJam ? 7 : 6;
            const idxFotoKeluar = hasShiftJam ? 8 : 7;
            const idxWaktuKeluar = hasShiftJam ? 9 : 8;
            const idxShift = hasShiftJam ? 6 : 11;

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 9) {
                    let textShift = "Regular Shift";
                    if (cells[idxShift]) textShift = cells[idxShift].innerText.replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

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
                            shift_info: textShift,
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

        sendLog(`[SUCCESS] Data Secure Acquired: ${attendanceData.length} records.`, 'success');
        return attendanceData;

    } catch (error) {
        sendLog(`[CRITICAL ERROR] Bypass Gagal: ${error.message}`, 'error');
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeDparagonAttendance };