const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    const url = "https://management.dparagon.com/login";
    console.log(`Menuju ke: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    console.log("Current URL: ", page.url());
    
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'debug_login_page.html'), html);
    console.log("HTML login page tersimpan.");
    
    await browser.close();
})();
