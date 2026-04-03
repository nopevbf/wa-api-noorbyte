const puppeteer = require('puppeteer');
const path = require('path');

async function scrapeDparagonAttendance(fullName = "") {
    console.log("[SYSTEM] Initiating Puppeteer Engine...");

    // 1. Buka Browser dengan fitur USER DATA DIR (Session Storage)
    const browser = await puppeteer.launch({
        headless: "new", // Ubah ke false kalau mau liat UI-nya
        defaultViewport: null,
        args: ['--start-maximized'],
        // Ini kuncinya! Puppeteer akan bikin folder 'browser_session' buat nyimpen cookies
        userDataDir: path.join(__dirname, 'browser_session')
    });

    const page = await browser.newPage();

    try {
        const encodedName = encodeURIComponent(fullName);
        const targetUrl = `https://management.dparagon6.persona-it.com/hrd/reportAttendance?devision_filter=&location_filter=&area_filter=&name_filter=${encodedName}&date_range_filter=&status_filter=`;

        console.log(`[PROCESS] Mengecek Session & Membuka Target URL untuk: ${fullName || 'All Users'}...`);

        // Langsung tembak ke halaman Target (Bukan halaman login)
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        // Cek URL saat ini. Kalau web ngelempar kita ke halaman login, berarti session kosong/expired
        const currentUrl = page.url();

        if (currentUrl.includes('/login')) {
            // ==========================================
            // FASE 1: SESSION KOSONG -> LAKUKAN LOGIN
            // ==========================================
            console.log("[INFO] Session tidak ditemukan/expired. Memulai proses Login...");

            await page.waitForSelector('input[id="username"]');
            await page.type('input[id="username"]', 'superadmin@dparagon.com', { delay: 50 });

            await page.waitForSelector('input[id="userpassword"]');
            await page.type('input[id="userpassword"]', 'Merpati98', { delay: 50 });

            console.log("[PROCESS] Submit Credentials...");
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                page.click('button[type="submit"]')
            ]);

            console.log("[SUCCESS] Login Berhasil! Session telah tersimpan di sistem.");

            // Habis login biasanya dilempar ke Dashboard awal, jadi kita harus ke Target URL lagi
            console.log("[PROCESS] Berpindah ke Halaman Report...");
            await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        } else {
            // ==========================================
            // FASE 1 ALTERNATIF: SESSION AKTIF -> SKIP LOGIN
            // ==========================================
            console.log("[SUCCESS] Session Login masih AKTIF! Melewati proses auth...");
        }

        // ==========================================
        // FASE 2: EXTRACT DATA DARI TABEL
        // ==========================================
        console.log("[PROCESS] Memindai elemen tabel kehadiran...");
        await page.waitForSelector('table tbody tr');

        const attendanceData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            const extracted = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');

                if (cells.length >= 9) {
                    const imgMasukEl = cells[5]?.querySelector('img');
                    const fotoMasuk = imgMasukEl ? imgMasukEl.src : null;
                    const waktuMasuk = cells[6]?.innerText.trim() || null;

                    const imgKeluarEl = cells[7]?.querySelector('img');
                    const fotoKeluar = imgKeluarEl ? imgKeluarEl.src : null;
                    const waktuKeluar = cells[8]?.innerText.trim() || null;

                    const validMasuk = waktuMasuk && waktuMasuk !== '-';
                    const validKeluar = waktuKeluar && waktuKeluar !== '-';

                    if (validMasuk || validKeluar) {
                        extracted.push({
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

        console.log(`[SUCCESS] Scraping selesai! Ditemukan ${attendanceData.length} baris.`);
        return attendanceData;

    } catch (error) {
        console.error("[CRITICAL ERROR] Proses Scraping Terhenti!", error);
        throw error;
    } finally {
        await browser.close();
        console.log("[SYSTEM] Puppeteer Engine Shutdown.");
    }
}

module.exports = { scrapeDparagonAttendance };