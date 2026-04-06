const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized'],
        userDataDir: path.join(__dirname, 'public', 'js', 'browser_session_production')
    });

    const page = await browser.newPage();
    const baseUrl = "https://management.dparagon.com";
    
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'debug_home.html'), html);
    console.log("HTML homepage disimpan.");
    await browser.close();
})();
