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

// ==========================================
// MUTEX LOKAL AGAR BROWSER TIDAK CRASH (CONCURRENCY)
// ==========================================
let isScraping = false;
const scrapeQueue = [];

// Tambahkan parameter env (default 'development')
// Sekarang nerima 4 parameter dari Frontend!
async function scrapeDparagonAttendance(env, email, password, fullName, targetPage = 1) {
    return new Promise((resolve, reject) => {
        const executeTask = async () => {
            try {
                const result = await internalScrapeDparagonAttendance(env, email, password, fullName, targetPage);
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                if (scrapeQueue.length > 0) {
                    const nextTask = scrapeQueue.shift();
                    nextTask();
                } else {
                    isScraping = false;
                }
            }
        };

        if (!isScraping) {
            isScraping = true;
            executeTask();
        } else {
            sendLog(`[INFO] Menunggu giliran scraping untuk [${fullName || 'Unknown'}]... Browser sedang dipakai job lain.`, 'info');
            scrapeQueue.push(executeTask);
        }
    });
}

async function internalScrapeDparagonAttendance(env, email, password, fullName, targetPage = 1) {
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

    // Deteksi OS: di Linux server, gunakan system Chromium jika tersedia
    const isLinux = process.platform === 'linux';
    const chromiumPath = isLinux ? (
        require('fs').existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' :
        require('fs').existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
        require('fs').existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : null
    ) : null;

    if (isLinux && chromiumPath) {
        sendLog(`[SYSTEM] Menggunakan System Chromium: ${chromiumPath}`, 'info');
    }

    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--start-maximized'
        ],
        userDataDir: path.join(__dirname, sessionDir)
    });

    const page = await browser.newPage();

    try {
        const encodedName = encodeURIComponent(fullName);
        const targetUrl = `${config.baseUrl}/hrd/reportAttendance?devision_filter=&location_filter=&area_filter=&name_filter=${encodedName}&date_range_filter=&status_filter=&page=${targetPage}`;

        sendLog(`[PROCESS] Mengecek akses Direktori Absensi...`, "info");
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        let currentUrl = page.url();
        let htmlCheck = await page.content();

        // Kalau dilempar ke login page, ATAU kena 403 Forbidden, eksekusi login pake kredensial dari UI
        if (currentUrl.includes('/login') || (htmlCheck.includes('403') && htmlCheck.toLowerCase().includes('whoops'))) {
            if (htmlCheck.includes('403')) {
                sendLog(`[WARNING] Session tersimpan terkena 403 Forbidden. Membersihkan session yang salah...`, 'warning');
            } else {
                sendLog(`[INFO] Session kosong. Melakukan otorisasi Web...`, 'info');
            }

            // Bersihkan cookie supaya tidak terikat ke akun lama yang kena 403
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');

            // Kunjungi Base URL dan biarkan sistem DParagon redirect otomatis ke auth.dparagon.com/login
            await page.goto(config.baseUrl, { waitUntil: 'networkidle2' });
            
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

            // Balik lagi ke targetUrl setelah berhasil login
            sendLog(`[PROCESS] Melanjutkan Kembali ke Direktori Absensi...`, "info");
            await page.goto(targetUrl, { waitUntil: 'networkidle2' });
        } else {
            sendLog(`[SUCCESS] Otorisasi Bypass masih aktif dan sukses. Melanjutkan...`, 'success');
        }

        // ==========================================
        // EXTRACT DATA TABEL (Kode scrape lo yang asli)
        // ==========================================
        try {
            // Kita tunggu ID dari table nya langsung, untuk jaga-jaga kalau data di dalam tbodynya (tr) itu kosong
            await page.waitForSelector('table[id="sticky_table"]', { timeout: 15000 });
        } catch (e) {
            const currentUrlFail = page.url();
            sendLog(`[WARNING] Selector 'table[id="sticky_table"]' tidak ditemukan. Kemungkinan data kosong, atau halaman belum selesai load.`, 'warning');
            sendLog(`[WARNING] URL yang sedang diakses: ${currentUrlFail}`, 'warning');
            await page.screenshot({ path: path.join(__dirname, 'error_selector_not_found.png') });
            
            // DUMP HTML BUAT DEBUG!
            const htmlContent = await page.content();
            require('fs').writeFileSync(path.join(__dirname, 'error_page_dump.html'), htmlContent);
            sendLog(`[INFO] HTML halaman yang gagal telah disimpan ke error_page_dump.html untuk dicek.`, 'info');
            
            return [];
        }

        const attendanceData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table#sticky_table tbody tr'));
            const extracted = [];

            const thElements = Array.from(document.querySelectorAll('table#sticky_table thead th'));
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