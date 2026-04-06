const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log("Membuka browser dari session...");
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized'],
        userDataDir: path.join(__dirname, 'public', 'js', 'browser_session_production')
    });

    const page = await browser.newPage();
    const url = "https://management.dparagon.com/hrd/reportAttendance?devision_filter=&location_filter=&area_filter=&name_filter=FIRMAN%20AJI%20PRASETYO&date_range_filter=&status_filter=&page=1";
    console.log(`Menuju ke: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    console.log("Current URL: ", page.url());
    
    try {
        await page.waitForSelector('table#sticky_table', { timeout: 10000 });
        console.log("Tabel KETEMU!");
    } catch(e) {
        console.log("Tabel TIDAK ketemu.");
    }
    
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'debug_html.html'), html);
    console.log("HTML tersimpan di debug_html.html");
    
    const frames = page.frames();
    console.log(`Ada ${frames.length} frame(s) di halaman ini.`);
    frames.forEach((f, i) => console.log(`Frame ${i}: ${f.url()}`));
    
    await browser.close();
    console.log("Selesai");
})();
