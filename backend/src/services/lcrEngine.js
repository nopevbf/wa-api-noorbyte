'use strict';

// ==========================================
// IMPORT WAJIB UNTUK STEALTH
// ==========================================
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const { normalizeUrl, detectPlatform } = require('../helpers/lcrUtils');

// Aktifkan mode stealth
puppeteer.use(StealthPlugin());

// ==========================================
// HELPER: RANDOM DELAY ANTI-BOT (3-8 detik)
// ==========================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 3000, max = 8000) => sleep(Math.floor(Math.random() * (max - min)) + min);

// ==========================================
// STATE MANAGEMENT (Session-based)
// ==========================================
const activeSessions = new Map(); // sessionId -> { status, results, error }

function getLcrStatus(sessionId = 'default') {
    return activeSessions.get(sessionId) || { status: 'idle', results: [], error: null };
}

// ==========================================
// HELPER: LOG REAL-TIME VIA SOCKET.IOATAU EMITTER
// ==========================================
function sendPulseLog(message, type = 'info', sessionId = 'default') {
    console.log(`[PULSE][${sessionId}] ${message}`);
    const session = activeSessions.get(sessionId);
    
    if (session && session.emitter) {
        session.emitter.emit('pulse_log', {
            message,
            type,
            sessionId,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false })
        });
    } else if (global.io) {
        global.io.emit('pulse_log', {
            message,
            type,
            sessionId,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false })
        });
    }
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

// normalizeUrl dan detectPlatform diimport dari '../helpers/lcrUtils'

// ==========================================
// GATEKEEPER: Penjaga Halaman Postingan (X-Ray Vision)
// ==========================================
async function waitForPostReady(page, platform, sessionId = 'default') {
    const session = activeSessions.get(sessionId);
    for (let w = 0; w < 60; w++) { // Maksimal 5 Menit
        if (session && session.abortSignal && session.abortSignal.aborted) {
            sendPulseLog('⚠️ Abort signal terdeteksi di Gatekeeper, membatalkan...', 'warning', sessionId);
            return false;
        }

        const loadStatus = await page.evaluate((plat) => {
            const isVisible = (el) => el && el.offsetWidth > 0 && el.offsetHeight > 0;
            
            // 1. Cek Login/Challenge Wall
            if (plat === 'instagram') {
                const loginInput = document.querySelector('input[name="username"]');
                const loginModalBtn = document.querySelector('[data-testid="royal_login_button"], a[href*="/accounts/login/"]');
                const isChallenge = window.location.href.includes('challenge') || window.location.href.includes('checkpoint');
                if (isVisible(loginInput) || isVisible(loginModalBtn) || isChallenge) return 'blocked';
                
                // 2. Cek apakah konten post sudah muncul (Image/Video atau Article)
                const postContent = document.querySelector('article, [role="main"] img, [role="main"] video');
                if (!postContent) return 'loading';
            } else if (plat === 'tiktok') {
                const loginModal = document.querySelector('[data-e2e="login-modal"]');
                const loginForm = document.querySelector('form[action*="login"]');
                const isCaptcha = window.location.href.includes('captcha') || window.location.href.includes('verification');
                if (isVisible(loginModal) || isVisible(loginForm) || isCaptcha) return 'blocked';

                // 2. Cek apakah video sudah muncul
                const video = document.querySelector('video');
                const commentArea = document.querySelector('[data-e2e="comment-list"]');
                if (!video && !commentArea) return 'loading';
            }
            return 'ready';
        }, platform);

        if (loadStatus === 'ready') {
            if (w > 0) sendPulseLog(`✅ Halangan teratasi dan konten termuat! Melanjutkan...`, 'success', sessionId);
            else sendPulseLog(`✅ Konten siap. Langsung eksekusi!`, 'success', sessionId);
            return true;
        }

        if (loadStatus === 'blocked') {
            // AUTO-ESC attempt for non-critical walls
            if (w % 2 === 0) {
                await page.keyboard.press('Escape');
                await page.evaluate(() => window.__LCR_UTILS__?.killPopups?.()).catch(() => { });
                await sleep(1000);
            }

            if (w === 0) sendPulseLog(`🚨 [GATEKEEPER] Tembok Login menghalangi Postingan! Silakan login di browser...`, 'warning', sessionId);
            else if (w % 6 === 0) sendPulseLog(`⏳ [GATEKEEPER] Menunggu Bos login... (Sisa waktu: ${(5 - (w / 12)).toFixed(1)} menit)`, 'warning', sessionId);
        } else {
            // Status: loading
            if (w % 6 === 0 && w > 0) sendPulseLog(`⏳ Menunggu konten ${platform} termuat sepenuhnya...`, 'info', sessionId);
        }

        if (session && session.abortSignal && session.abortSignal.aborted) {
            sendPulseLog('⚠️ Abort signal terdeteksi saat sleep, membatalkan...', 'warning', sessionId);
            return false;
        }
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
async function instagramLogin(page, username, password, sessionId = 'default') {
    sendPulseLog('🔐 Mengecek status login Instagram...', 'info', sessionId);
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);

    const cookies = await page.cookies();
    const isLoggedIn = cookies.some(c => c.name === 'sessionid');

    if (isLoggedIn) {
        sendPulseLog('✅ Instagram session masih aktif.', 'success', sessionId);
        return true;
    }

    if (!username || !password) {
        sendPulseLog('⚠️ Kredensial kosong. Menunggu campur tangan Master...', 'warning', sessionId);
    } else {
        sendPulseLog('🔑 Mulai proses login otomatis IG...', 'info', sessionId);
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
            sendPulseLog('⚠️ Auto-fill gagal, langsung masuk ke mode manual.', 'warning', sessionId);
        }
    }

    sendPulseLog(`🚨 [HOLD] Sistem menahan progress! Silakan isi kredensial / 2FA di browser. (Waktu: 5 Menit)`, 'warning', sessionId);
    let isSafe = false;
    const session = activeSessions.get(sessionId);
    for (let w = 0; w < 60; w++) {
        if (session && session.abortSignal && session.abortSignal.aborted) {
            sendPulseLog('⚠️ Abort signal terdeteksi di Login IG, membatalkan...', 'warning', sessionId);
            return false;
        }
        await sleep(5000);
        await page.evaluate(() => window.__LCR_UTILS__?.killPopups?.()).catch(() => { });
        const currentCookies = await page.cookies();
        const hasSession = currentCookies.some(c => c.name === 'sessionid');
        if (hasSession) {
            isSafe = true;
            break;
        }
        if (w % 6 === 0 && w > 0) sendPulseLog(`⏳ [HOLD] Masih belum mendeteksi session aktif... JANGAN TERBURU-BURU, silakan login.`, 'warning', sessionId);
    }

    if (isSafe) {
        sendPulseLog('✅ Deteksi layar bersih! Sesi diamankan...', 'success', sessionId);
        await sleep(3000);
        return true;
    } else {
        sendPulseLog('❌ Waktu manual (5 Menit) habis dan layar masih tersangkut.', 'error', sessionId);
        return false;
    }
}

// ==========================================
// TIKTOK: LOGIN
// ==========================================
async function tiktokLogin(page, username, password, sessionId = 'default', sessionState = {}) {
    const RATE_LIMIT_KEYWORDS = [
        'maximum number of attempts', 'too many attempts', 'try again later', 'too fast', 
        'too many login', 'maximum attempt', 'login too frequently'
    ];
    const checkRateLimit = async () => {
        const text = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '').catch(() => '');
        return RATE_LIMIT_KEYWORDS.some(k => text.includes(k));
    };

    const markForNuke = () => {
        if (sessionState) sessionState.nukeOnClose = true;
        sendPulseLog(`🚫 TikTok RATE LIMIT terdeteksi! Folder session akan dibersihkan setelah browser ditutup.`, 'error', sessionId);
    };

    sendPulseLog('🔐 Mengecek status login TikTok...', 'info', sessionId);
    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);

    const cookies = await page.cookies();
    const isLoggedIn = cookies.some(c => c.name === 'sessionid');

    if (isLoggedIn) {
        sendPulseLog('✅ TikTok session masih aktif.', 'success', sessionId);
        return true;
    }

    sendPulseLog('🔑 Mulai proses login TikTok...', 'info', sessionId);
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2000);

    if (await checkRateLimit()) {
        markForNuke();
        return false;
    }

    if (username && password) {
        try {
            await page.waitForSelector('input[type="password"]', { timeout: 10000 });
            await page.evaluate((u) => {
                const userInp = document.querySelector('input[name="username"], input[placeholder*="email" i], input[type="text"]');
                window.__LCR_UTILS__.simulateTyping(userInp, u);
            }, username);
            await sleep(1500);
            await page.evaluate((p) => {
                const passInp = document.querySelector('input[type="password"]');
                window.__LCR_UTILS__.simulateTyping(passInp, p);
            }, password);
            await sleep(2000);
            await page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"], button[data-e2e="login-button"]');
                if (btn) window.__LCR_UTILS__.triggerClick(btn);
            });
            await sleep(8000);

            if (await checkRateLimit()) {
                markForNuke();
                return false;
            }
        } catch (err) {
            sendPulseLog('⚠️ Auto-fill gagal, masuk ke mode manual.', 'warning', sessionId);
        }
    }

    sendPulseLog(`🚨 [HOLD] Sistem menahan progress! Silakan selesaikan login / Captcha di browser. (Waktu: 5 Menit)`, 'warning', sessionId);
    let isSafe = false;
    const session = activeSessions.get(sessionId);
    for (let w = 0; w < 60; w++) {
        if (session && session.abortSignal && session.abortSignal.aborted) {
            sendPulseLog('⚠️ Abort signal terdeteksi di Login TikTok, membatalkan...', 'warning', sessionId);
            return false;
        }
        await sleep(5000);
        await page.evaluate(() => window.__LCR_UTILS__?.killPopups?.()).catch(() => { });

        if (await checkRateLimit()) {
            markForNuke();
            return false;
        }

        const currentCookies = await page.cookies();
        const hasSession = currentCookies.some(c => c.name === 'sessionid');
        if (hasSession) {
            isSafe = true;
            break;
        }
        if (w % 6 === 0 && w > 0) sendPulseLog(`⏳ [HOLD] Masih menunggu bos menyelesaikan Captcha/Login TikTok...`, 'warning', sessionId);
    }

    if (isSafe) {
        sendPulseLog('✅ Deteksi layar bersih! Sesi diamankan...', 'success', sessionId);
        await sleep(3000);
        return true;
    } else {
        sendPulseLog('❌ Waktu manual (5 Menit) habis.', 'error', sessionId);
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
            repostSvg: 'svg[aria-label="Repost"][height="24"]:not(:has(circle))'
        };

        await utils.killPopups();

        // 1. LIKE
        try {
            if (document.querySelector(SELS.unlikeSvg)) {
                results.push({ action: 'like', skipped: true });
            } else {
                const btn = utils.findClickable(SELS.likeSvg);
                if (btn) {
                    utils.triggerClick(btn);
                    await utils.sleep(1500);
                    results.push({ action: 'like', skipped: false });
                } else {
                    results.push({ action: 'like', skipped: true, error: 'Like button not found' });
                }
            }
        } catch (e) { results.push({ action: 'like', error: e.message }); }

        const randomDelay = (min, max) => utils.sleep(min + Math.random() * (max - min));
        await randomDelay(3000, 5000);

        // 2. COMMENT
        try {
            if (cmt) {
                let input = document.querySelector(SELS.commentInput);
                if (!input) {
                    const trig = utils.findClickable(SELS.commentSvg);
                    if (trig) { 
                        utils.triggerClick(trig); 
                        await utils.sleep(2000); 
                    }
                }
                
                input = document.querySelector(SELS.commentInput);
                if (input) {
                    utils.simulateTyping(input, cmt);
                    await utils.sleep(1500);

                    const form = input.closest('form');
                    const findSubmit = () => [...document.querySelectorAll('[role="button"], button')].find(
                        el => /^(Post|Kirim|Bagikan)$/i.test(el.textContent.trim()) && (!form || el.closest('form') === form)
                    );
                    
                    let postBtn = findSubmit();
                    if (!postBtn) {
                        // Wait a bit if not immediately found (SPA behavior)
                        await utils.sleep(1000);
                        postBtn = findSubmit();
                    }

                    if (postBtn) {
                        utils.triggerClick(postBtn);
                        await utils.sleep(3000);
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

        await utils.sleep(2000);

        // 3. REPOST
        try {
            const scope = document.querySelector('article') || document;
            const repostSvg = scope.querySelector(SELS.repostSvg);
            
            if (repostSvg) {
                const pathD = repostSvg.querySelector('path')?.getAttribute('d') ?? '';
                // Robust check for already reposted: path 'd' attribute usually has more 'M' commands when active
                if ((pathD.match(/[Mm]/g)?.length ?? 0) >= 3) {
                    results.push({ action: 'repost', skipped: true });
                } else {
                    const btn = utils.findClickable(SELS.repostSvg);
                    utils.triggerClick(btn);
                    await utils.sleep(2000);
                    results.push({ action: 'repost', skipped: false });
                }
            } else {
                // FALLBACK: TRY SAVE IF REPOST NOT FOUND
                const saveSvg = document.querySelector('svg[aria-label="Save"], svg[aria-label="Simpan"]');
                if (saveSvg) {
                    const isSaved = !!document.querySelector('svg[aria-label="Remove"], svg[aria-label="Hapus"]');
                    if (isSaved) {
                        results.push({ action: 'repost', skipped: true });
                    } else {
                        const btn = saveSvg.closest('[role="button"], button') || saveSvg.parentElement;
                        utils.triggerClick(btn);
                        await utils.sleep(2000);
                        results.push({ action: 'repost', skipped: false, note: 'Saved as fallback' });
                    }
                } else {
                    results.push({ action: 'repost', skipped: true, error: 'Repost/Save button not found' });
                }
            }
        } catch (e) { results.push({ action: 'repost', error: e.message }); }

        // Scroll back to top so screenshot captures the post from the beginning
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await utils.sleep(1500);

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

        if (!window.__AUTO_LCR_TT__) {
            window.__AUTO_LCR_TT__ = true;
        }

        const SELS = {
            likeBtn: 'button:has([data-e2e="like-icon"])',
            likeBtnActive: 'button[aria-pressed="true"]:has([data-e2e="like-icon"]), button:has([data-e2e="like-icon"][style*="fill: rgb(255, 43, 85)"]), button:has([data-e2e="like-icon"][style*="fill: rgb(254, 44, 85)"])',
            commentBtn: 'button:has([data-e2e="comment-icon"])',
            commentInput: '[data-e2e="comment-text"] [contenteditable="true"]',
            commentPost: 'button[data-e2e="comment-post"]',
            shareBtn: 'button[aria-label*="Share video"]',
            repostOption: '[data-e2e="share-repost"]',
            loginIndicator: 'form[action*="login"], [data-e2e="login-modal"]',
        };

        const waitForEnabled = (selector, timeoutMs = 5000) => {
            return new Promise((resolve) => {
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
                setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
            });
        };

        const randomDelay = (min, max) => utils.sleep(min + Math.random() * (max - min));

        const checkLiked = () => {
            if (document.querySelector(SELS.likeBtnActive)) return true;
            const activeIcon = document.querySelector('[data-e2e="like-active-icon"]');
            if (activeIcon) return true;
            const icon = document.querySelector('[data-e2e="like-icon"]');
            if (!icon) return false;
            const btn = icon.closest('button');
            return (btn && btn.getAttribute('aria-pressed') === 'true') || 
                   /255,\s*43,\s*85|254,\s*44,\s*85|255,\s*59,\s*92|255,\s*76,\s*58/.test(window.getComputedStyle(icon).fill || '');
        };

        await utils.killPopups();

        // 1. LIKE
        try {
            if (checkLiked()) {
                results.push({ action: 'like', skipped: true });
            } else {
                const selector = '[data-e2e="like-icon"]';
                if (window.puppeteerClickLcr) await window.puppeteerClickLcr(selector);
                else {
                    const btn = document.querySelector(SELS.likeBtn);
                    if (btn) utils.triggerClick(btn);
                }
                await utils.sleep(2000);
                results.push({ action: 'like', skipped: !checkLiked() });
            }
        } catch (e) { results.push({ action: 'like', error: e.message }); }

        await randomDelay(3000, 5000);

        // 2. COMMENT
        try {
            if (cmt) {
                let input = document.querySelector(SELS.commentInput);
                if (!input) {
                    const btn = document.querySelector(SELS.commentBtn);
                    if (btn) {
                        if (window.puppeteerClickLcr) await window.puppeteerClickLcr(SELS.commentBtn);
                        else utils.triggerClick(btn);
                        await utils.sleep(2000);
                    }
                }

                input = await utils.waitForEl(SELS.commentInput, 7000);
                if (window.puppeteerClickLcr) await window.puppeteerClickLcr(SELS.commentInput);
                else utils.triggerClick(input);
                await utils.sleep(1000);
                input.focus();

                utils.simulatePaste(input, cmt);
                await utils.sleep(1500);

                const postBtn = await waitForEnabled(SELS.commentPost, 5000);
                if (postBtn) {
                    if (window.puppeteerClickLcr) await window.puppeteerClickLcr(SELS.commentPost);
                    else utils.triggerClick(postBtn);
                    await utils.sleep(3000);
                    results.push({ action: 'comment', skipped: false });
                } else {
                    results.push({ action: 'comment', error: 'Post button not found' });
                }
            } else {
                results.push({ action: 'comment', skipped: true });
            }
        } catch (e) { results.push({ action: 'comment', error: e.message }); }

        await randomDelay(3000, 5000);

        // 3. REPOST
        try {
            const shareBtn = document.querySelector(SELS.shareBtn);
            if (shareBtn) {
                if (window.puppeteerClickLcr) await window.puppeteerClickLcr(SELS.shareBtn);
                else utils.triggerClick(shareBtn);
                await utils.sleep(2000);

                const repostEl = await utils.waitForEl(SELS.repostOption, 7000);
                const label = repostEl.querySelector('p')?.textContent.trim() ?? '';
                if (/remove|hapus/i.test(label)) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await utils.sleep(500);
                    results.push({ action: 'repost', skipped: true });
                } else {
                    if (window.puppeteerClickLcr) await window.puppeteerClickLcr(SELS.repostOption);
                    else utils.triggerClick(repostEl);
                    await utils.sleep(3000);
                    results.push({ action: 'repost', skipped: false });
                }
            } else {
                results.push({ action: 'repost', skipped: true, error: 'Share button not found' });
            }
        } catch (e) { results.push({ action: 'repost', error: e.message }); }

        // 4. FINAL VALIDATION (RE-LIKE IF FAILED) BEFORE SCREENSHOT
        try {
            if (!checkLiked()) {
                const selector = '[data-e2e="like-icon"]';
                if (window.puppeteerClickLcr) await window.puppeteerClickLcr(selector);
                else {
                    const btn = document.querySelector(SELS.likeBtn);
                    if (btn) utils.triggerClick(btn);
                }
                await utils.sleep(2000);
            }
        } catch (e) { }

        // Scroll back to top so screenshot captures the post from the beginning
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await utils.sleep(1500);

        return results;
    }, commentText);
}

// ==========================================
// MAIN: EXECUTE LCR (Entry Point)
// ==========================================
async function executeLCR(identity, payload, options = {}) {
    const sessionId = options.sessionId || 'default';
    
    if (activeSessions.get(sessionId)?.status === 'running') {
        sendPulseLog(`⚠️ Sesi ${sessionId} sedang berjalan.`, 'warning', sessionId);
        return { status: false, message: 'Session already running.' };
    }

    const sessionState = { 
        status: 'running', 
        results: [], 
        error: null,
        emitter: options.eventEmitter || null,
        abortSignal: options.abortSignal || null
    };
    activeSessions.set(sessionId, sessionState);

    const links = (payload.links || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const comments = (payload.comments || '').split('\n').map(c => c.trim()).filter(c => c.length > 0);

    if (links.length === 0) {
        sendPulseLog('❌ Tidak ada link.', 'error', sessionId);
        sessionState.status = 'error';
        sessionState.error = 'No links provided';
        return { status: false, message: 'No links provided' };
    }

    const isPhantom = options.stealthMode !== false;
    const modeLabel = isPhantom ? 'PHANTOM' : 'VISIBLE';

    sendPulseLog('═══════════════════════════════════', 'info', sessionId);
    sendPulseLog(`🚀 [${sessionId}] Engine AKTIF [${modeLabel}] | ${links.length} link`, 'info', sessionId);
    sendPulseLog('═══════════════════════════════════', 'info', sessionId);

    const profileName = (identity.name || 'default').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const sessionName = `${profileName}_${isPhantom ? 'stealth' : 'visible'}`;
    
    if (!global.__lcrSessionNames) global.__lcrSessionNames = {};
    global.__lcrSessionNames[sessionId] = sessionName;

    let browser;
    try {
        sendPulseLog(`🌐 Meluncurkan browser...`, 'info', sessionId);
        browser = await launchBrowser(sessionName, isPhantom);
        const pages = await browser.pages();
        const page = pages[0];

        if (!isPhantom) await page.bringToFront().catch(()=>{});

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

        if (!page.puppeteerClickExposed) {
            await page.exposeFunction('puppeteerClickLcr', async (selector) => {
                try {
                    await page.hover(selector);
                    await new Promise(r => setTimeout(r, 500));
                    await page.click(selector, { delay: 50 });
                    return true;
                } catch (e) { return false; }
            });
            await page.exposeFunction('browserLogLcr', (msg, type) => {
                sendPulseLog(msg, type || 'info', sessionId);
            });
            page.puppeteerClickExposed = true;
        }

        let loginDone = {};

        for (let i = 0; i < links.length; i++) {
            if (sessionState.abortSignal && sessionState.abortSignal.aborted) {
                sendPulseLog('❌ Eksekusi Dibatalkan oleh AbortSignal.', 'warning', sessionId);
                sessionState.status = 'aborted';
                break;
            }

            let url = normalizeUrl(links[i]);
            const comment = comments[i] || comments[0] || '';
            const platform = detectPlatform(url);

            sendPulseLog(`\n──── Link ${i + 1}/${links.length} ────`, 'info', sessionId);
            await injectLcrUtilities(page);

            if (!loginDone[platform]) {
                if (platform === 'instagram') {
                    loginDone['instagram'] = await instagramLogin(page, identity.ig_email, identity.ig_password, sessionId);
                } else if (platform === 'tiktok') {
                    loginDone['tiktok'] = await tiktokLogin(page, identity.tt_email, identity.tt_password, sessionId, sessionState);
                } else {
                    loginDone[platform] = true;
                }
            }

            if (loginDone[platform] === false) {
                sendPulseLog(`🛑 Login ${platform} gagal. Melewati link ini.`, 'error', sessionId);
                sessionState.results.push({ url, platform, error: 'Login failed' });
                continue;
            }

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await sleep(4000);
                
                // 🛠️ RE-INJECT after goto (Navigation clears window)
                await injectLcrUtilities(page);

                const isReady = await waitForPostReady(page, platform, sessionId);
                if (!isReady) throw new Error('Post not ready');

                // 🛠️ RE-INJECT after post is ready (just in case of redirects)
                await injectLcrUtilities(page);
                let actionResults = platform === 'instagram' ? await instagramActions(page, comment) : await tiktokActions(page, comment);
                
                // Fallback to empty array if actions return null/undefined to prevent .find crashes
                if (!Array.isArray(actionResults)) {
                    actionResults = [];
                }

                const finalResult = {
                    url, platform,
                    like: actionResults.find(r => r.action === 'like'),
                    comment: actionResults.find(r => r.action === 'comment'),
                    repost: actionResults.find(r => r.action === 'repost')
                };

                // 📸 SCREENSHOT LOGIC (Ported from service_worker.js)
                try {
                    const screenshotDir = path.join(process.cwd(), 'screenshots');
                    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

                    const timestamp = Date.now();
                    const hostname = new URL(url).hostname.replace('www.', '');
                    const filename = `auto-lcr-${hostname}-${timestamp}.png`;
                    const screenshotPath = path.join(screenshotDir, filename);

                    await page.screenshot({ path: screenshotPath, fullPage: false });
                    sendPulseLog(`📸 Screenshot tersimpan: ${filename}`, 'success', sessionId);
                    finalResult.screenshot = filename;
                } catch (ssErr) {
                    sendPulseLog(`⚠️ Gagal mengambil screenshot: ${ssErr.message}`, 'warning', sessionId);
                }

                sessionState.results.push(finalResult);
                
                if (sessionState.emitter) {
                    sessionState.emitter.emit('pulse_progress', { sessionId, current: i + 1, total: links.length, result: finalResult });
                } else if (global.io) {
                    global.io.emit('pulse_progress', { sessionId, current: i + 1, total: links.length, result: finalResult });
                }

            } catch (e) {
                sendPulseLog(`❌ Error: ${e.message}`, 'error', sessionId);
                sessionState.results.push({ url, platform, error: e.message });
            }

            if (i < links.length - 1) {
                sendPulseLog(`⏳ Menunggu 30 detik sebelum link berikutnya (Cooling down)...`, 'info', sessionId);
                for (let s = 0; s < 30; s++) {
                    if (sessionState.abortSignal && sessionState.abortSignal.aborted) {
                        sendPulseLog('❌ Eksekusi Dibatalkan oleh AbortSignal saat cooling down.', 'warning', sessionId);
                        sessionState.status = 'aborted';
                        break;
                    }
                    await sleep(1000);
                }
                if (sessionState.status === 'aborted') break;
            }
        }

        if (sessionState.status !== 'aborted') {
            sessionState.status = 'done';
            sendPulseLog('✅ Misi Selesai!', 'success', sessionId);
        }

    } catch (err) {
        sendPulseLog(`💥 FATAL: ${err.message}`, 'error', sessionId);
        sessionState.status = 'error';
        sessionState.error = err.message;
    } finally {
        if (browser) {
            const userDataDir = browser.process()?.spawnargs.find(arg => arg.startsWith('--user-data-dir='))?.split('=')[1];
            await browser.close();
            
            // 🛠️ CLEANUP: Nuke folder session jika ditandai (e.g. Rate Limit)
            if (sessionState.nukeOnClose && userDataDir && fs.existsSync(userDataDir)) {
                try {
                    // Beri jeda sedikit agar OS melepas lock file
                    await sleep(2000);
                    fs.rmSync(userDataDir, { recursive: true, force: true });
                    sendPulseLog(`🗑️ Folder session dibersihkan karena Rate Limit.`, 'info', sessionId);
                } catch (e) {
                    sendPulseLog(`⚠️ Gagal membersihkan folder session: ${e.message}`, 'warning', sessionId);
                }
            }
        }
    }

    const isSuccess = sessionState.status === 'done';
    return { status: isSuccess, state: sessionState.status, results: sessionState.results };
}

module.exports = { executeLCR, getLcrStatus };
