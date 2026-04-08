const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized'],
        userDataDir: path.join(__dirname, 'public', 'js', 'browser_session_production')
    });

    const page = await browser.newPage();
    const baseUrl = "https://management.dparagon.com";
    
    console.log(`Membuka base url: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    
    console.log(`Current URL setelah load base url: ${page.url()}`);
    
    const html1 = await page.content();
    if(html1.includes('403') && html1.toLowerCase().includes('whoops')) {
        console.log("BASE URL MENGEMBALIKAN 403!");
    } else if(html1.includes('login') || page.url().includes('login')) {
        console.log("BASE URL KE LOGIN!");
    } else {
        console.log("BASE URL OK!");
    }
    
    await browser.close();
})();
