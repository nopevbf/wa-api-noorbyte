'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ==========================================
// HELPER: RANDOM DELAY ANTI-BOT (3-8 detik)
// ==========================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 3000, max = 8000) => sleep(Math.floor(Math.random() * (max - min)) + min);

// ==========================================
// HELPER: LOG REAL-TIME VIA SOCKET.IO
// ==========================================
function sendPulseLog(message, type = 'info') {
    console.log(`[PULSE] ${message}`);
    if (global.io) {
        global.io.emit('pulse_log', {
            message,
            type,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false })
        });
    }
}

// ==========================================
// MUTEX: Cegah double-run browser crash
// ==========================================
let isRunning = false;
let currentResults = [];
let currentStatus = 'idle'; 
let currentError = null;

function getLcrStatus() {
    return { status: currentStatus, results: currentResults, error: currentError };
}

// ==========================================
// HELPER: INJECT PRO UTILITIES (React Fiber Bypass)
// ==========================================
async function injectLcrUtilities(page) {
    await page.evaluate(() => {
        window.__LCR_UTILS__ = {
            sleep: ms => new Promise(r => setTimeout(r, ms)),

            findClickable: (svgSelector) => {
                const svg = document.querySelector(svgSelector);
                if (!svg) return null;
                return svg.closest('[role="button"], button, a') || svg.parentElement;
            },

            reactClick: (el) => {
                const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
                if (!fiberKey) return false;
                let fiber = el[fiberKey];
                while (fiber) {
                    const props = fiber.memoizedProps || fiber.pendingProps;
                    if (props && typeof props.onClick === 'function') {
                        props.onClick({
                            type: 'click', target: el, currentTarget: el,
                            bubbles: true, cancelable: true,
                            preventDefault: () => {}, stopPropagation: () => {},
                            nativeEvent: new MouseEvent('click'),
                        });
                        return true;
                    }
                    fiber = fiber.return;
                }
                return false;
            },

            triggerClick: (el) => {
                if (!el) return;
                el.scrollIntoView({ block: 'center' });
                if (!window.__LCR_UTILS__.reactClick(el)) {
                    const opts = { bubbles: true, cancelable: true, view: window };
                    el.dispatchEvent(new MouseEvent('mousedown', opts));
                    el.dispatchEvent(new MouseEvent('mouseup', opts));
                    el.dispatchEvent(new MouseEvent('click', opts));
                }
            },

            simulateTyping: (el, text) => {
                el.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                document.execCommand('insertText', false, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            },

            simulatePaste: (el, text) => {
                el.focus();
                const dt = new DataTransfer();
                dt.setData('text/plain', text);
                el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            },

            waitForEnabled: (selector, timeoutMs = 5000) => {
                return new Promise((resolve, reject) => {
                    const check = () => {
                        const el = document.querySelector(selector);
                        return el && !el.disabled ? el : null;
                    };
                    const found = check();
                    if (found) return resolve(found);
                    const obs = new MutationObserver(() => {
                        const el = check();
                        if (el) { obs.disconnect(); resolve(el); }
                    });
                    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
                    setTimeout(() => { obs.disconnect(); reject(new Error('Timed out')); }, timeoutMs);
                });
            }
        };
    });
}

// ==========================================
// DETECT PLATFORM DARI URL
// ==========================================
function detectPlatform(url) {
    if (/instagram\.com/i.test(url)) return 'instagram';
    if (/tiktok\.com/i.test(url)) return 'tiktok';
    return 'unknown';
}

// ==========================================
// GATEKEEPER: Penjaga Halaman Postingan (X-Ray Vision)
// ==========================================
async function waitForPostReady(page, platform) {
    for (let w = 0; w < 60; w++) { // Maksimal 5 Menit
        const isBlocked = await page.evaluate((plat) => {
            const isVisible = (el) => el && el.offsetWidth > 0 && el.offsetHeight > 0;
            if (plat === 'instagram') {
                const loginInput = document.querySelector('input[name="username"]');
                const loginModalBtn = document.querySelector('[data-testid="royal_login_button"], a[href*="/accounts/login/"]');
                const isChallenge = window.location.href.includes('challenge') || window.location.href.includes('checkpoint');
                return isVisible(loginInput) || isVisible(loginModalBtn) || isChallenge;
            } else if (plat === 'tiktok') {
                const loginModal = document.querySelector('[data-e2e="login-modal"]');
                const isCaptcha = window.location.href.includes('captcha') || window.location.href.includes('verification');
                return isVisible(loginModal) || isCaptcha;
            }
            return false;
        }, platform);

        if (!isBlocked) {
            if (w > 0) sendPulseLog(`✅ Halangan teratasi oleh Master! Melanjutkan eksekusi detik ini juga...`, 'success');
            else sendPulseLog(`✅ Jalur aman (Tidak ada Login Wall). Langsung eksekusi!`, 'success');
            return true; 
        }

        if (w === 0) sendPulseLog(`🚨 [GATEKEEPER] Tembok Login menghalangi Postingan! Silakan login di browser...`, 'warning');
        else if (w % 6 === 0) sendPulseLog(`⏳ [GATEKEEPER] Menunggu Bos login... (Sisa waktu: ${(5 - (w / 12)).toFixed(1)} menit)`, 'warning');
        
        await sleep(5000);
    }
    return false;
}

// ==========================================
// LAUNCH BROWSER (DYNAMIC MODE: VISIBLE/PHANTOM)
// ==========================================
// 😈 Tambahkan parameter "isStealth" untuk menerima perintah dari UI
async function launchBrowser(sessionName, isStealth) { 
    const sessionDir = path.join(__dirname, `lcr_session_${sessionName}`);
    const isLinux = process.platform === 'linux';
    const chromiumPath = isLinux ? (
        fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' :
        fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
        fs.existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : null
    ) : null;

    // 😈 BACA STATUS DARI SAKLAR UI (Sudah tidak memakai TARGET_MODE lagi!)
    const isHeadless = isStealth ? 'new' : false;

    return puppeteer.launch({
        headless: isHeadless, 
        defaultViewport: { width: 1280, height: 900 }, // Desktop Default
        ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-notifications',
            '--window-size=1280,900',
            '--disable-blink-features=AutomationControlled',
            '--disable-session-crashed-bubble',
            '--hide-crash-restore-bubble',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        userDataDir: sessionDir
    });
}

// ==========================================
// INSTAGRAM: LOGIN
// ==========================================
async function instagramLogin(page, username, password) {
    sendPulseLog('🔐 Mengecek status login Instagram...', 'info');
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    const html = await page.content();
    const url = page.url();
    const isLoggedIn = !url.includes('/login') && !html.includes('loginForm') && !html.includes('desktop_dynamic_landing_dialog');

    if (isLoggedIn) {
        sendPulseLog('✅ Instagram session masih aktif.', 'success');
        return true;
    }

    if (!username || !password) {
        sendPulseLog('⚠️ Kredensial kosong. Menunggu campur tangan Master...', 'warning');
    } else {
        sendPulseLog('🔑 Mulai proses login otomatis IG...', 'info');
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);

        try {
            await page.waitForSelector('input[name="username"]', { timeout: 10000 });
            await page.evaluate((u, p) => {
                const userInp = document.querySelector('input[name="username"]');
                const passInp = document.querySelector('input[name="password"]');
                window.__LCR_UTILS__.simulateTyping(userInp, u);
                window.__LCR_UTILS__.simulateTyping(passInp, p);
            }, username, password);

            await sleep(1500);
            await page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) window.__LCR_UTILS__.triggerClick(btn);
            });
            await sleep(5000);
        } catch (err) {
            sendPulseLog('⚠️ Auto-fill gagal, langsung masuk ke mode manual.', 'warning');
        }
    }

    sendPulseLog(`🚨 [HOLD] Sistem menahan progress! Silakan isi kredensial / 2FA di browser. (Waktu: 5 Menit)`, 'warning');
    let isSafe = false;
    for(let w = 0; w < 60; w++) { 
        await sleep(5000);
        const currentUrl = page.url();
        const currentHtml = await page.content();
        
        const isLogin = currentUrl.includes('/login') || currentHtml.includes('loginForm') || currentHtml.includes('desktop_dynamic_landing_dialog');
        const isChallenge = currentUrl.includes('/challenge') || currentUrl.includes('two_factor');
        const isSaveInfo = currentUrl.includes('/onetap') || currentHtml.includes('Save Your Login Info') || currentHtml.includes('Simpan Info Login');
        
        if (!isLogin && !isChallenge && !isSaveInfo) {
            isSafe = true;
            break;
        }
        if (w % 6 === 0 && w > 0) sendPulseLog(`⏳ [HOLD] Masih menunggu bos selesai login... JANGAN TERBURU-BURU.`, 'warning');
    }

    if (isSafe) {
        sendPulseLog('✅ Deteksi layar bersih! Sesi diamankan...', 'success');
        await sleep(3000);
        return true;
    } else {
        sendPulseLog('❌ Waktu manual (5 Menit) habis dan layar masih tersangkut.', 'error');
        return false;
    }
}

// ==========================================
// TIKTOK: LOGIN
// ==========================================
async function tiktokLogin(page, username, password) {
    sendPulseLog('🔐 Mengecek status login TikTok...', 'info');
    await page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    const html = await page.content();
    const isLoggedIn = (html.includes('Upload') || html.includes('profile-icon') || html.includes('avatar'))
        && !html.includes('login-button')
        && !html.includes('Log in');

    if (isLoggedIn) {
        sendPulseLog('✅ TikTok session masih aktif.', 'success');
        return true;
    }

    sendPulseLog('🔑 Mulai proses login TikTok...', 'info');
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    if (username && password) {
        try {
            await page.waitForSelector('input[type="password"]', { timeout: 10000 });
            await page.evaluate((u, p) => {
                const userInp = document.querySelector('input[name="username"], input[placeholder*="email" i], input[type="text"]');
                const passInp = document.querySelector('input[type="password"]');
                window.__LCR_UTILS__.simulateTyping(userInp, u);
                window.__LCR_UTILS__.simulateTyping(passInp, p);
            }, username, password);

            await sleep(1500);
            await page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"], button[data-e2e="login-button"]');
                if (btn) window.__LCR_UTILS__.triggerClick(btn);
            });
            await sleep(5000);
        } catch (err) {
            sendPulseLog('⚠️ Auto-fill gagal, masuk ke mode manual.', 'warning');
        }
    }

    sendPulseLog(`🚨 [HOLD] Sistem menahan progress! Silakan selesaikan login / Captcha di browser. (Waktu: 5 Menit)`, 'warning');
    let isSafe = false;
    for(let w = 0; w < 60; w++) { 
        await sleep(5000);
        const currentUrl = page.url();
        const currentHtml = await page.content();
        
        const isLogin = currentUrl.includes('/login') || currentHtml.includes('login-modal');
        const isCaptcha = currentUrl.includes('/verification') || currentUrl.includes('captcha');
        
        if (!isLogin && !isCaptcha && (currentHtml.includes('Upload') || currentHtml.includes('profile-icon'))) {
            isSafe = true;
            break;
        }
        if (w % 6 === 0 && w > 0) sendPulseLog(`⏳ [HOLD] Masih menunggu bos menyelesaikan Captcha/Login TikTok...`, 'warning');
    }

    if (isSafe) {
        sendPulseLog('✅ Deteksi layar bersih! Sesi diamankan...', 'success');
        await sleep(3000);
        return true;
    } else {
        sendPulseLog('❌ Waktu manual (5 Menit) habis dan layar masih tersangkut.', 'error');
        return false;
    }
}

// ==========================================
// INSTAGRAM: ACTIONS
// ==========================================
async function instagramActions(page, commentText) {
    return await page.evaluate(async (cmt) => {
        const utils = window.__LCR_UTILS__;
        const results = [];
        
        const SELS = {
            likeSvg: 'svg[aria-label="Like"][height="24"], svg[aria-label="Suka"][height="24"]',
            unlikeSvg: 'svg[aria-label="Unlike"][height="24"], svg[aria-label="Tidak Suka"][height="24"]',
            commentSvg: 'svg[aria-label="Comment"], svg[aria-label="Komentar"]',
            commentInput: 'textarea[aria-label*="Add a comment" i], textarea[placeholder*="comment" i], textarea[placeholder*="komentar" i]',
            repostSvg: 'svg[aria-label="Repost"][height="24"]:not(:has(circle))'
        };

        try {
            if (document.querySelector(SELS.unlikeSvg)) {
                results.push({ action: 'like', skipped: true });
            } else {
                const btn = utils.findClickable(SELS.likeSvg);
                if (btn) {
                    utils.triggerClick(btn);
                    await utils.sleep(1000);
                    results.push({ action: 'like', skipped: false });
                } else {
                    results.push({ action: 'like', skipped: true, error: 'Like button not found' });
                }
            }
        } catch (e) { results.push({ action: 'like', error: e.message }); }

        await utils.sleep(1500);

        try {
            if (cmt) {
                let input = document.querySelector(SELS.commentInput);
                if (!input) {
                    const trig = utils.findClickable(SELS.commentSvg);
                    if (trig) { utils.triggerClick(trig); await utils.sleep(1000); }
                }
                input = document.querySelector(SELS.commentInput);
                if (input) {
                    utils.simulateTyping(input, cmt);
                    await utils.sleep(800);
                    const postBtn = [...document.querySelectorAll('[role="button"], button')].find(el => /^(Post|Kirim)$/i.test(el.textContent.trim()));
                    if (postBtn) {
                        utils.triggerClick(postBtn);
                        await utils.sleep(2000);
                        results.push({ action: 'comment', skipped: false });
                    } else {
                        results.push({ action: 'comment', error: 'Post button not found' });
                    }
                } else {
                    results.push({ action: 'comment', error: 'Input not found' });
                }
            } else {
                results.push({ action: 'comment', skipped: true });
            }
        } catch (e) { results.push({ action: 'comment', error: e.message }); }

        await utils.sleep(1500);

        try {
            const repostSvg = document.querySelector(SELS.repostSvg);
            if (repostSvg) {
                const pathD = repostSvg.querySelector('path')?.getAttribute('d') ?? '';
                if ((pathD.match(/[Mm]/g)?.length ?? 0) >= 3) {
                    results.push({ action: 'repost', skipped: true });
                } else {
                    const btn = utils.findClickable(SELS.repostSvg);
                    utils.triggerClick(btn);
                    await utils.sleep(1000);
                    results.push({ action: 'repost', skipped: false });
                }
            } else {
                const saveSvg = document.querySelector('svg[aria-label="Save"], svg[aria-label="Simpan"]');
                if (saveSvg) {
                    const isSaved = !!document.querySelector('svg[aria-label="Remove"], svg[aria-label="Hapus"]');
                    if (isSaved) {
                        results.push({ action: 'repost', skipped: true });
                    } else {
                        const btn = saveSvg.closest('[role="button"], button') || saveSvg.parentElement;
                        utils.triggerClick(btn);
                        await utils.sleep(1000);
                        results.push({ action: 'repost', skipped: false, note: 'Saved as fallback' });
                    }
                } else {
                    results.push({ action: 'repost', skipped: true, error: 'Repost/Save button not found' });
                }
            }
        } catch (e) { results.push({ action: 'repost', error: e.message }); }

        return results;
    }, commentText);
}

// ==========================================
// TIKTOK: ACTIONS
// ==========================================
async function tiktokActions(page, commentText) {
    return await page.evaluate(async (cmt) => {
        const utils = window.__LCR_UTILS__;
        const results = [];
        
        const SELS = {
            likeBtn: 'button:has([data-e2e="like-icon"])',
            likeBtnActive: 'button[aria-pressed="true"]:has([data-e2e="like-icon"])',
            commentBtn: 'button:has([data-e2e="comment-icon"])',
            commentInput: '[data-e2e="comment-text"] [contenteditable="true"]',
            commentPost: 'button[data-e2e="comment-post"]',
            shareBtn: 'button[aria-label*="Share video"]',
            repostOption: '[data-e2e="share-repost"]'
        };

        try {
            if (document.querySelector(SELS.likeBtnActive)) {
                results.push({ action: 'like', skipped: true });
            } else {
                const btn = document.querySelector(SELS.likeBtn);
                if (btn) {
                    utils.triggerClick(btn);
                    await utils.sleep(1000);
                    results.push({ action: 'like', skipped: false });
                } else {
                    results.push({ action: 'like', error: 'Like button not found' });
                }
            }
        } catch (e) { results.push({ action: 'like', error: e.message }); }

        await utils.sleep(1500);

        try {
            if (cmt) {
                let input = document.querySelector(SELS.commentInput);
                if (!input) {
                    const btn = document.querySelector(SELS.commentBtn);
                    if (btn) { utils.triggerClick(btn); await utils.sleep(1000); }
                }
                
                input = document.querySelector(SELS.commentInput);
                if (input) {
                    utils.simulatePaste(input, cmt);
                    await utils.sleep(800);
                    try {
                        const post = await utils.waitForEnabled(SELS.commentPost, 5000);
                        utils.triggerClick(post);
                        await utils.sleep(2000);
                        results.push({ action: 'comment', skipped: false });
                    } catch (err) {
                        results.push({ action: 'comment', error: 'Post btn never enabled' });
                    }
                } else {
                    results.push({ action: 'comment', error: 'Input not found' });
                }
            } else {
                results.push({ action: 'comment', skipped: true });
            }
        } catch (e) { results.push({ action: 'comment', error: e.message }); }

        await utils.sleep(1500);

        try {
            const share = document.querySelector(SELS.shareBtn);
            if (share) {
                utils.triggerClick(share);
                await utils.sleep(1500);
                const repost = document.querySelector(SELS.repostOption);
                if (repost) {
                    const label = repost.querySelector('p')?.textContent?.trim() ?? '';
                    if (/remove|hapus/i.test(label)) {
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        results.push({ action: 'repost', skipped: true });
                    } else {
                        utils.triggerClick(repost);
                        await utils.sleep(1000);
                        results.push({ action: 'repost', skipped: false });
                    }
                } else {
                    results.push({ action: 'repost', error: 'Repost option not found' });
                }
            } else {
                results.push({ action: 'repost', error: 'Share button not found' });
            }
        } catch (e) { results.push({ action: 'repost', error: e.message }); }

        return results;
    }, commentText);
}

// ==========================================
// MAIN: EXECUTE LCR (Entry Point)
// ==========================================
async function executeLCR(identity, payload, options = {}) {
    if (isRunning) {
        sendPulseLog('⚠️ LCR Engine sedang berjalan. Tunggu selesai.', 'warning');
        return { status: false, message: 'Engine sedang berjalan.' };
    }

    isRunning = true;
    currentStatus = 'running';
    currentResults = [];
    currentError = null;

    const links = (payload.links || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const comments = (payload.comments || '').split('\n').map(c => c.trim()).filter(c => c.length > 0);

    if (links.length === 0) {
        sendPulseLog('❌ Tidak ada link yang diberikan.', 'error');
        isRunning = false;
        currentStatus = 'error';
        currentError = 'No links provided';
        return { status: false, message: 'No links provided' };
    }

    // 😈 Menerima Kunci Phantom dari Frontend UI
    const isPhantom = options.stealthMode === true;
    const modeLabel = isPhantom ? 'PHANTOM (Headless)' : 'VISIBLE (UI)';

    sendPulseLog('═══════════════════════════════════', 'info');
    sendPulseLog(`🚀 LCR Pro Engine AKTIF [Mode: ${modeLabel}] | ${links.length} link terdeteksi`, 'info');
    sendPulseLog(`👤 Identity: ${identity.name || 'Unknown'}`, 'info');
    sendPulseLog('═══════════════════════════════════', 'info');

    const sessionName = (identity.name || 'default').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    let browser;
    try {
        sendPulseLog(`🌐 Meluncurkan browser stealth...`, 'info');
        
        // 😈 Lempar status Phantom ke peluncur browser!
        browser = await launchBrowser(sessionName, isPhantom);
        
        // ==========================================================
        // 🧹 PROTOKOL TAB TUNGGAL (PEMBERSIHAN SISA CRASH)
        // ==========================================================
        const pages = await browser.pages(); 
        const page = pages[0]; // Ambil alih tab pertama (biasanya about:blank)

        // Jika Chrome memulihkan tab dari masa lalu, BANTAI SEMUANYA!
        if (pages.length > 1) {
            sendPulseLog('🧹 Menghancurkan tab sisa dari misi sebelumnya...', 'info');
            for (let i = 1; i < pages.length; i++) {
                await pages[i].close();
            }
        }

        // Set Desktop default saat baru diluncurkan
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

        let loginDone = {};

        for (let i = 0; i < links.length; i++) {
            const url = links[i];
            const comment = comments[i] || comments[0] || '';
            const platform = detectPlatform(url);

            sendPulseLog(`\n──── Link ${i + 1}/${links.length} ────`, 'info');
            sendPulseLog(`📎 URL: ${url}`, 'info');

            await injectLcrUtilities(page);

            if (!loginDone[platform]) {
                if (platform === 'instagram' && identity.ig_email && identity.ig_password) {
                    loginDone['instagram'] = await instagramLogin(page, identity.ig_email, identity.ig_password);
                } else if (platform === 'tiktok' && identity.tt_email && identity.tt_password) {
                    loginDone['tiktok'] = await tiktokLogin(page, identity.tt_email, identity.tt_password);
                } else {
                    sendPulseLog('ℹ️  Mencoba pakai session tersimpan...', 'info');
                    loginDone[platform] = true;
                }
            }

            sendPulseLog('📡 Navigasi ke post...', 'info');
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (e) {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            }
            await sleep(4000);

            sendPulseLog('🛡️ Memeriksa status layar di halaman post...', 'info');
            const isReady = await waitForPostReady(page, platform);
            
            if (!isReady) {
                sendPulseLog(`❌ Waktu tunggu habis (5 Menit)! Halaman post masih terblokir. Melewati target ini...`, 'error');
                currentResults.push({ url, platform, error: 'Blocked by Login/Captcha Wall' });
                continue; 
            }

            await injectLcrUtilities(page);

            let actionResults;
            if (platform === 'instagram') {
                sendPulseLog('🔥 Eksekusi Pro Actions Instagram...', 'info');
                actionResults = await instagramActions(page, comment);
            } else if (platform === 'tiktok') {
                sendPulseLog('🔥 Eksekusi Pro Actions TikTok...', 'info');
                actionResults = await tiktokActions(page, comment);
            } else {
                sendPulseLog('⚠️ Platform tidak dikenal.', 'warning');
                continue;
            }

            actionResults.forEach(r => {
                const icon = r.action === 'like' ? '❤️' : r.action === 'comment' ? '💬' : '🔁';
                if (r.error) sendPulseLog(`   ❌ ${icon} ${r.action}: ERROR - ${r.error}`, 'error');
                else if (r.skipped) sendPulseLog(`   ⏭️  ${icon} ${r.action}: Skipped`, 'info');
                else sendPulseLog(`   ✅ ${icon} ${r.action}: Success!`, 'success');
            });

            // ==========================================================
            // 📸 PROTOKOL FOTO BUKTI (DYNAMIC MOBILE MORPHING) + SMART FOCUS
            // ==========================================================
            sendPulseLog('📸 Menyusutkan browser ke ukuran HP (Mobile View) untuk screenshot...', 'info');
            
            await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
            await sleep(2000);

            // Smart Focus: Lacak posisi tombol LCR
            await page.evaluate((plat) => {
                let actionTarget = null;
                if (plat === 'instagram') {
                    actionTarget = document.querySelector('svg[aria-label="Unlike"], svg[aria-label="Tidak Suka"], svg[aria-label="Like"], svg[aria-label="Suka"]');
                } else if (plat === 'tiktok') {
                    actionTarget = document.querySelector('[data-e2e="like-icon"], [data-e2e="comment-icon"]');
                }
                
                if (actionTarget) {
                    actionTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    window.scrollTo({ top: 0 }); 
                    window.scrollBy({ top: 300, behavior: 'smooth' });
                }
            }, platform);
            
            await sleep(1500); 

            let screenshotPath = null;
            try {
                const ssDir = path.join(__dirname, '../../../frontend/public/screenshots');
                if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
                screenshotPath = path.join(ssDir, `lcr_pro_${i + 1}_${Date.now()}.png`);
                
                await page.screenshot({ path: screenshotPath });
                sendPulseLog(`📸 Bukti LCR Mobile tersimpan!`, 'success');
            } catch (e) {
                sendPulseLog(`❌ Gagal mengambil screenshot: ${e.message}`, 'error');
            }

            // ==========================================================
            // 🖥️ KEMBALIKAN KE MODE DESKTOP 
            // ==========================================================
            sendPulseLog('🖥️ Mengembalikan browser ke ukuran Desktop...', 'info');
            await page.setViewport({ width: 1280, height: 900, isMobile: false, hasTouch: false });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await sleep(1000); 

            const finalResult = {
                url, platform,
                like: actionResults.find(r => r.action === 'like'),
                comment: actionResults.find(r => r.action === 'comment'),
                repost: actionResults.find(r => r.action === 'repost'),
                screenshot: screenshotPath ? `/screenshots/${path.basename(screenshotPath)}` : null
            };
            currentResults.push(finalResult);

            if (global.io) global.io.emit('pulse_progress', { current: i + 1, total: links.length, result: finalResult });

            if (i < links.length - 1) await randomDelay(5000, 10000);
        }

        sendPulseLog('\n═══════════════════════════════════', 'info');
        sendPulseLog(`✅ LCR PRO SELESAI`, 'success');
        sendPulseLog('═══════════════════════════════════', 'info');
        currentStatus = 'done';

    } catch (err) {
        sendPulseLog(`💥 FATAL ERROR: ${err.message}`, 'error');
        currentStatus = 'error';
        currentError = err.message;
    } finally {
        if (browser) await browser.close();
        isRunning = false;
    }

    return { status: true, results: currentResults };
}

module.exports = { executeLCR, getLcrStatus };