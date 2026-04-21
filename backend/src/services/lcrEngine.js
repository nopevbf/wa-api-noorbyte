'use strict';

// ==========================================
// IMPORT WAJIB UNTUK STEALTH
// ==========================================
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

// Aktifkan mode stealth
puppeteer.use(StealthPlugin());

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
                            preventDefault: () => { }, stopPropagation: () => { },
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

            waitForEl: (selector, timeoutMs = 7000) => {
                return new Promise((resolve, reject) => {
                    const check = () => document.querySelector(selector);
                    const found = check();
                    if (found) return resolve(found);

                    const obs = new MutationObserver(() => {
                        const el = check();
                        if (el) { obs.disconnect(); clearInterval(poll); resolve(el); }
                    });
                    obs.observe(document.body, { childList: true, subtree: true });

                    const poll = setInterval(() => {
                        const el = check();
                        if (el) { obs.disconnect(); clearInterval(poll); resolve(el); }
                    }, 500);

                    setTimeout(() => {
                        obs.disconnect();
                        clearInterval(poll);
                        reject(new Error(`Timeout: ${selector}`));
                    }, timeoutMs);
                });
            },

            killPopups: async () => {
                // 1. Press Escape
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await window.__LCR_UTILS__.sleep(400);

                // 2. Agresive Button Hunt (X Buttons & Text Buttons)
                const buttons = [...document.querySelectorAll('button, [role="button"], a')];
                for (const btn of buttons) {
                    try {
                        const txt = (btn.innerText || btn.textContent || '').toLowerCase();
                        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();

                        // Deteksi Tombol Silang (X) atau Teks Penolakan
                        const isClose = aria.includes('close') || aria.includes('tutup') || aria.includes('dismiss');
                        const isNotNow = /not now|lain kali|maybe later|cancel|nanti saja|close|tutup|ignore|no thanks|bukan sekarang/i.test(txt);
                        if ((isClose || isNotNow) && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                            window.__LCR_UTILS__.triggerClick(btn);
                            await window.__LCR_UTILS__.sleep(300);
                        }
                    } catch (e) { }
                }
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
                const loginForm = document.querySelector('form[action*="login"]');
                const isCaptcha = window.location.href.includes('captcha') || window.location.href.includes('verification');
                return isVisible(loginModal) || isVisible(loginForm) || isCaptcha;
            }
            return false;
        }, platform);

        if (!isBlocked) {
            if (w > 0) sendPulseLog(`✅ Halangan teratasi oleh Master! Melanjutkan eksekusi detik ini juga...`, 'success');
            else sendPulseLog(`✅ Jalur aman (Tidak ada Login Wall). Langsung eksekusi!`, 'success');
            return true;
        }

        // AUTO-ESC attempt for non-critical walls
        if (w % 2 === 0) {
            await page.keyboard.press('Escape');
            await page.evaluate(() => window.__LCR_UTILS__?.killPopups?.()).catch(() => { });
            await sleep(1000);
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
async function launchBrowser(sessionName, isStealth) {
    const sessionDir = path.join(__dirname, `lcr_session_${sessionName}`);

    // 🛠️ FIX 1: Universal OS Chrome Path Wajib buat ngibulin bot detector
    let executablePath = null;
    if (process.platform === 'linux') {
        executablePath = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' :
            fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' :
                fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
                    fs.existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : null;
    } else if (process.platform === 'win32') {
        executablePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' :
            fs.existsSync('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : null;
    } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }

    const isHeadless = isStealth ? true : false;

    return puppeteer.launch({
        headless: isHeadless,
        defaultViewport: { width: 1280, height: 900 },
        ...(executablePath ? { executablePath } : {}), // Paksa pakai Chrome Asli
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-notifications',
            '--disable-infobars',
            '--window-size=1280,900',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-session-crashed-bubble',
            '--disable-restore-session-state',
            // 🛡️ MOBILE PROXY (Bypass Captcha Puzzle & TikTok Softban)
            '--proxy-server=socks5://0.tcp.ap.ngrok.io:10525',
            'about:blank',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: sessionDir,
        ignoreHTTPSErrors: true
    });
}

// ==========================================
// INSTAGRAM: LOGIN
// ==========================================
async function instagramLogin(page, username, password) {
    sendPulseLog('🔐 Mengecek status login Instagram...', 'info');
    // 🛠️ FIX 2: Ganti networkidle2 ke domcontentloaded agar tidak timeout
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);

    const cookies = await page.cookies();
    const isLoggedIn = cookies.some(c => c.name === 'sessionid');

    if (isLoggedIn) {
        sendPulseLog('✅ Instagram session masih aktif.', 'success');
        return true;
    }

    if (!username || !password) {
        sendPulseLog('⚠️ Kredensial kosong. Menunggu campur tangan Master...', 'warning');
    } else {
        sendPulseLog('🔑 Mulai proses login otomatis IG...', 'info');
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 45000 });
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
    for (let w = 0; w < 60; w++) {
        await sleep(5000);
        // Auto-kill popups during wait
        await page.evaluate(() => window.__LCR_UTILS__?.killPopups?.()).catch(() => { });
        const currentCookies = await page.cookies();
        const hasSession = currentCookies.some(c => c.name === 'sessionid');
        if (hasSession) {
            isSafe = true;
            break;
        }
        if (w % 6 === 0 && w > 0) sendPulseLog(`⏳ [HOLD] Masih belum mendeteksi session aktif... JANGAN TERBURU-BURU, silakan login.`, 'warning');
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
    // 🛠️ FIX 10: Helper — cek rate limit keywords di halaman
    const RATE_LIMIT_KEYWORDS = [
        'maximum number of attempts',
        'too many attempts',
        'try again later',
        'too fast',
        'too many login',
        'maximum attempt',
        'login too frequently'
    ];
    const checkRateLimit = async () => {
        const text = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '').catch(() => '');
        return RATE_LIMIT_KEYWORDS.some(k => text.includes(k));
    };

    // 🛠️ FIX 11: Helper — nuke session folder dari disk (bukan cuma cookies di memory)
    const nukeSessionDir = () => {
        const sessionDir = path.join(__dirname, `lcr_session_${(global.__lcrSessionName || 'default')}`);
        if (fs.existsSync(sessionDir)) {
            try {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                sendPulseLog(`🗑️ Folder session "${path.basename(sessionDir)}" dihapus dari disk.`, 'info');
            } catch (e) {
                sendPulseLog(`⚠️ Gagal hapus folder session: ${e.message}`, 'warning');
            }
        }
    };

    sendPulseLog('🔐 Mengecek status login TikTok...', 'info');
    // 🛠️ FIX 2: Ganti networkidle2 ke domcontentloaded agar tidak timeout
    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);

    const cookies = await page.cookies();
    const isLoggedIn = cookies.some(c => c.name === 'sessionid');

    if (isLoggedIn) {
        sendPulseLog('✅ TikTok session masih aktif.', 'success');
        return true;
    }

    sendPulseLog('🔑 Mulai proses login TikTok...', 'info');
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2000);

    // 🛠️ FIX 12: Early detection — cek rate limit SEBELUM isi form
    if (await checkRateLimit()) {
        sendPulseLog('🚫 TikTok RATE LIMIT terdeteksi SEBELUM login! Browser profile sudah di-flag.', 'error');
        nukeSessionDir();
        sendPulseLog('⏳ Session dihapus dari disk. Tunggu 10-15 menit lalu coba lagi.', 'warning');
        return false;
    }

    if (username && password) {
        try {
            await page.waitForSelector('input[type="password"]', { timeout: 10000 });
            await page.evaluate((u, p) => {
                const userInp = document.querySelector('input[name="username"], input[placeholder*="email" i], input[type="text"]');
                const passInp = document.querySelector('input[type="password"]');
                window.__LCR_UTILS__.simulateTyping(userInp, u);
            }, username, password);
            // 🛠️ FIX 4: Delay natural antara field username → password
            await sleep(Math.floor(Math.random() * 1000) + 1000);
            await page.evaluate((p) => {
                const passInp = document.querySelector('input[type="password"]');
                window.__LCR_UTILS__.simulateTyping(passInp, p);
            }, password);
            // 🛠️ FIX 5: Delay natural sebelum submit (2-3 detik)
            await sleep(Math.floor(Math.random() * 1000) + 2000);
            await page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"], button[data-e2e="login-button"]');
                if (btn) window.__LCR_UTILS__.triggerClick(btn);
            });
            // 🛠️ FIX 6: Delay lebih panjang setelah submit (8 detik)
            await sleep(8000);

            // 🛠️ FIX 7: Deteksi "Maximum Attempt" / Rate Limit setelah submit
            if (await checkRateLimit()) {
                sendPulseLog('🚫 TikTok RATE LIMIT setelah submit! Menghapus session dari disk...', 'error');
                nukeSessionDir();
                sendPulseLog('⏳ Session dihapus. Tunggu 10-15 menit lalu coba lagi.', 'warning');
                return false;
            }
        } catch (err) {
            sendPulseLog('⚠️ Auto-fill gagal, masuk ke mode manual.', 'warning');
        }
    }

    sendPulseLog(`🚨 [HOLD] Sistem menahan progress! Silakan selesaikan login / Captcha di browser. (Waktu: 5 Menit)`, 'warning');
    let isSafe = false;
    for (let w = 0; w < 60; w++) {
        await sleep(5000);
        // Auto-kill popups during wait
        await page.evaluate(() => window.__LCR_UTILS__?.killPopups?.()).catch(() => { });

        // 🛠️ FIX 8: Cek rate limit juga selama loop tunggu manual
        if (await checkRateLimit()) {
            sendPulseLog('🚫 Rate limit masih aktif di halaman. Menghentikan tunggu...', 'error');
            nukeSessionDir();
            sendPulseLog('🧹 Session dihapus dari disk. Coba lagi nanti (10-15 menit).', 'warning');
            return false;
        }

        const currentCookies = await page.cookies();
        const hasSession = currentCookies.some(c => c.name === 'sessionid');
        if (hasSession) {
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
            commentInput: 'textarea[aria-label*="Add a comment" i], textarea[placeholder*="comment" i], textarea[placeholder*="komentar" i], [role="textbox"]',
            repostSvg: 'svg[aria-label="Repost"][height="24"]:not(:has(circle)), svg[aria-label="Repost"]'
        };

        // AUTO-KILL POPUPS
        await utils.killPopups();

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

        // Guard against double-injection
        if (window.__AUTO_LCR_TT__) {
            // Already injected
        } else {
            window.__AUTO_LCR_TT__ = true;
        }

        const SELS = {
            likeBtn: 'button:has([data-e2e="like-icon"])',
            // Deteksi lebih kuat: aria-pressed OR warna merah (rgb 255, 43, 85)
            likeBtnActive: 'button[aria-pressed="true"]:has([data-e2e="like-icon"]), button:has([data-e2e="like-icon"][style*="fill: rgb(255, 43, 85)"])',
            commentBtn: 'button:has([data-e2e="comment-icon"])',
            commentInput: '[data-e2e="comment-text"] [contenteditable="true"]',
            commentPost: 'button[data-e2e="comment-post"]',
            shareBtn: 'button[aria-label*="Share video"]',
            repostOption: '[data-e2e="share-repost"]',
            loginIndicator: 'form[action*="login"], [data-e2e="login-modal"]',
        };

        // Helper: Wait for a button to lose its disabled attribute
        const waitForEnabled = (selector, timeoutMs = 5000) => {
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
                obs.observe(document.body, {
                    childList: true, subtree: true,
                    attributes: true, attributeFilter: ['disabled'],
                });
                setTimeout(() => { obs.disconnect(); reject(new Error('Post button never enabled')); }, timeoutMs);
            });
        };

        const randomDelay = (min, max) => utils.sleep(min + Math.random() * (max - min));

        // AUTO-KILL POPUPS
        await utils.killPopups();

        // 1. COMMENT
        try {
            if (cmt) {
                let input = document.querySelector(SELS.commentInput);
                if (!input) {
                    const btn = document.querySelector(SELS.commentBtn);
                    if (btn) { utils.triggerClick(btn); await utils.sleep(1500); }
                }

                input = await utils.waitForEl(SELS.commentInput, 7000);
                utils.triggerClick(input);
                await utils.sleep(500);
                input.focus();

                utils.simulatePaste(input, cmt);
                await utils.sleep(1000);

                const postBtn = await waitForEnabled(SELS.commentPost, 5000);
                utils.triggerClick(postBtn);
                await utils.sleep(3000);
                results.push({ action: 'comment', skipped: false });
            } else {
                results.push({ action: 'comment', skipped: true });
            }
        } catch (e) { results.push({ action: 'comment', error: e.message }); }

        await randomDelay(3000, 5000);

        // 2. REPOST
        try {
            const shareBtn = document.querySelector(SELS.shareBtn);
            if (!shareBtn) throw new Error('Share button not found');
            utils.triggerClick(shareBtn);
            await utils.sleep(1500);

            const repostEl = await utils.waitForEl(SELS.repostOption, 7000);
            const label = repostEl.querySelector('p')?.textContent.trim() ?? '';
            if (/remove|hapus/i.test(label)) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await utils.sleep(500);
                results.push({ action: 'repost', skipped: true });
            } else {
                utils.triggerClick(repostEl);
                await utils.sleep(3000);
                results.push({ action: 'repost', skipped: false });
            }
        } catch (e) { results.push({ action: 'repost', error: e.message }); }

        await randomDelay(3000, 5000);

        // 3. LIKE (FINAL TOUCH - Agar tidak diganggu aksi lain)
        try {
            const checkLiked = () => {
                const icon = document.querySelector('[data-e2e="like-icon"]');
                if (!icon) return false;
                const btn = icon.closest('button');
                return (btn && btn.getAttribute('aria-pressed') === 'true') || 
                       /255,\s*43,\s*85|254,\s*44,\s*85|255,\s*59,\s*92|255,\s*76,\s*58/.test(window.getComputedStyle(icon).fill || '');
            };

            if (checkLiked()) {
                results.push({ action: 'like', skipped: true });
            } else {
                const icon = await utils.waitForEl('[data-e2e="like-icon"]', 7000);
                const btn = icon.closest('button') || icon;

                if (window.browserLogLcr) await window.browserLogLcr(`🔍 [TRACE] Eksekusi LIKE di akhir biar gak kena interupsi aksi lain...`, 'info');
                
                utils.triggerClick(btn);

                if (window.browserLogLcr) await window.browserLogLcr(`🔍 [TRACE] Like terpasang. Menunggu 10 DETIK (Sync Period) biar server TikTok beneran nyatet...`, 'info');
                await utils.sleep(10000);

                if (!checkLiked()) {
                    if (window.browserLogLcr) await window.browserLogLcr(`❌ [TRACE] REVERTED! Server TikTok tetep narik Like-nya. Akun/IP lu butuh istirahat bos.`, 'error');
                } else {
                    if (window.browserLogLcr) await window.browserLogLcr(`✅ [TRACE] STABIL! Like tetep merah setelah 10 detik. Misi sukses.`, 'success');
                }
                results.push({ action: 'like', skipped: false });
            }
        } catch (e) { results.push({ action: 'like', error: e.message }); }

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
    // 🛠️ FIX 13: Simpan sessionName ke global agar tiktokLogin bisa nuke folder yang benar
    global.__lcrSessionName = sessionName;

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

        if (!isPhantom) await page.bringToFront();

        // Jika Chrome memulihkan tab dari masa lalu, BANTAI SEMUANYA!
        if (pages.length > 1) {
            sendPulseLog('🧹 Menghancurkan tab sisa dari misi sebelumnya...', 'info');
            for (let i = 1; i < pages.length; i++) {
                await pages[i].close();
            }
        }

        // Set Desktop default saat baru diluncurkan
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

        // Expose native puppeteer click to bypass isTrusted=false block on TikTok
        if (!page.puppeteerClickExposed) {
            await page.exposeFunction('puppeteerClickLcr', async (selector) => {
                try {
                    sendPulseLog(`🔍 [TRACE] Puppeteer mulai ngerakin mouse (hover) ke arah ${selector}...`, 'info');
                    // Simulasikan pergerakan mouse dari luar window ke target (sangat manusiawi)
                    await page.hover(selector);
                    // Tunggu hover santai seperti org milih tombol
                    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
                    sendPulseLog(`🔍 [TRACE] Puppeteer memencet tombol secara fisik layaknya manusia (isTrusted: true)...`, 'info');
                    // Klik dengan delay antara pencet dan lepas (Mousedown --> Mouseup delay)
                    await page.click(selector, { delay: 40 + Math.random() * 50 });
                    sendPulseLog(`🔍 [TRACE] Native click berhasil dieksekusi dengan mendarat sempurna!`, 'success');
                    return true;
                } catch (e) {
                    sendPulseLog(`⚠️ [TRACE] Error pas Native Click: ${e.message}`, 'warning');
                    return false;
                }
            });
            await page.exposeFunction('browserLogLcr', (msg, type) => {
                sendPulseLog(msg, type || 'info');
            });
            page.puppeteerClickExposed = true;
        }

        let loginDone = {};

        for (let i = 0; i < links.length; i++) {
            const url = links[i];
            const comment = comments[i] || comments[0] || '';
            const platform = detectPlatform(url);

            sendPulseLog(`\n──── Link ${i + 1}/${links.length} ────`, 'info');
            sendPulseLog(`📎 URL: ${url}`, 'info');

            await injectLcrUtilities(page);

            if (!loginDone[platform]) {
                if (platform === 'instagram') {
                    loginDone['instagram'] = await instagramLogin(page, identity.ig_email, identity.ig_password);
                } else if (platform === 'tiktok') {
                    loginDone['tiktok'] = await tiktokLogin(page, identity.tt_email, identity.tt_password);
                } else {
                    sendPulseLog('ℹ️  Mencoba pakai session tersimpan...', 'info');
                    loginDone[platform] = true;
                }
            }

            // 🛠️ FIX 9: Kalau login gagal (rate limit / timeout), STOP total — jangan lanjut navigasi
            if (loginDone[platform] === false) {
                sendPulseLog(`🛑 Login ${platform} gagal. Menghentikan seluruh operasi LCR.`, 'error');
                currentResults.push({ url, platform, error: `Login ${platform} failed (rate limit / timeout)` });
                break;
            }

            sendPulseLog('📡 Navigasi ke post...', 'info');
            // 🛠️ FIX 3: Strategi Navigasi Cerdas dan 404 handler
            try {
                const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                if (response && response.status() === 404) {
                    sendPulseLog(`❌ Postingan tidak ditemukan (404) atau sudah dihapus.`, 'error');
                    currentResults.push({ url, platform, error: 'Post 404 Not Found' });
                    continue;
                }
            } catch (e) {
                sendPulseLog(`⚠️ Peringatan Navigasi: ${e.message}. Memeriksa ketersediaan elemen...`, 'warning');
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
            // 📸 PROTOKOL FOTO BUKTI (DESKTOP MODE)
            // ==========================================================
            let screenshotPath = null;
            const ssDir = path.join(__dirname, '../../../frontend/public/screenshots');
            if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
            screenshotPath = path.join(ssDir, `lcr_pro_${i + 1}_${Date.now()}.png`);

            sendPulseLog(`📸 Memotret postingan ${platform} (Desktop Mode)...`, 'info');
            try {
                let targetSelector = '';
                if (platform === 'instagram') {
                    targetSelector = 'div.xh8yej3[style*="max-width: 673px"], article, div[role="dialog"] article';
                } else if (platform === 'tiktok') {
                    targetSelector = '[data-e2e="browser-video-container"], [data-e2e="video-player-container"], article';
                }

                const element = targetSelector ? await page.$(targetSelector) : null;

                if (element) {
                    if (platform !== 'tiktok') {
                        await element.scrollIntoView({ block: 'center' });
                        await sleep(1000);
                        await element.screenshot({ path: screenshotPath });
                    } else {
                        // Khusus TikTok, pake page Screenshot agar Puppeteer core gak diem-diem nge-scroll 
                        // ke elemen (scroll x/y) yg bisa men-trigger video berikutnya & menggagalkan Like.
                        await sleep(1000);
                        await page.screenshot({ path: screenshotPath, fullPage: false });
                    }
                    sendPulseLog(`📸 Bukti LCR Postingan ${platform} tersimpan!`, 'success');
                } else {
                    sendPulseLog(`⚠️ Kotak postingan spesifik ${platform} tidak ditemukan, memotret layar penuh...`, 'warning');
                    await page.screenshot({ path: screenshotPath, fullPage: false });
                    sendPulseLog(`📸 Bukti LCR Desktop tersimpan!`, 'success');
                }
            } catch (e) {
                sendPulseLog(`❌ Gagal element-screenshot: ${e.message}`, 'error');
                try { await page.screenshot({ path: screenshotPath, fullPage: false }); } catch (ssErr) { }
            }

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