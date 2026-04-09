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
let currentStatus = 'idle'; // idle | running | done | error
let currentError = null;

function getLcrStatus() {
    return {
        status: currentStatus,
        results: currentResults,
        error: currentError
    };
}

// ==========================================
// HELPER: INJECT PRO UTILITIES (React Fiber Bypass)
// Diambil dari saran user ("Pro Logic" IG & TT)
// ==========================================
async function injectLcrUtilities(page) {
    await page.evaluate(() => {
        window.__LCR_UTILS__ = {
            sleep: ms => new Promise(r => setTimeout(r, ms)),

            // Find clickable parent
            findClickable: (svgSelector) => {
                const svg = document.querySelector(svgSelector);
                if (!svg) return null;
                return svg.closest('[role="button"], button, a') || svg.parentElement;
            },

            // React Fiber Bypass: Panggil onClick handler langsung dari React tree
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

            // Trigger click dengan fallback
            triggerClick: (el) => {
                if (!el) return;
                el.scrollIntoView({ block: 'center' });
                // Coba bypass React dulu
                if (!window.__LCR_UTILS__.reactClick(el)) {
                    // Fallback mouse events
                    const opts = { bubbles: true, cancelable: true, view: window };
                    el.dispatchEvent(new MouseEvent('mousedown', opts));
                    el.dispatchEvent(new MouseEvent('mouseup', opts));
                    el.dispatchEvent(new MouseEvent('click', opts));
                }
            },

            // Simulate typing via execCommand
            simulateTyping: (el, text) => {
                el.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                document.execCommand('insertText', false, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            },

            // Simulate paste event (khusus DraftEditor TikTok)
            simulatePaste: (el, text) => {
                el.focus();
                const dt = new DataTransfer();
                dt.setData('text/plain', text);
                el.dispatchEvent(new ClipboardEvent('paste', {
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true,
                }));
            },

            // Wait for element to become enabled
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
                    obs.observe(document.body, {
                        childList: true, subtree: true,
                        attributes: true, attributeFilter: ['disabled'],
                    });
                    setTimeout(() => { obs.disconnect(); reject(new Error('Timed out waiting for enabled: ' + selector)); }, timeoutMs);
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
// LAUNCH BROWSER (Stealth)
// ==========================================
async function launchBrowser(sessionName) {
    const sessionDir = path.join(__dirname, `lcr_session_${sessionName}`);

    const isLinux = process.platform === 'linux';
    const chromiumPath = isLinux ? (
        fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' :
        fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
        fs.existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : null
    ) : null;

    return puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1280, height: 900 },
        ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--window-size=1280,900',
            '--disable-blink-features=AutomationControlled'
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

    const currentUrl = page.url();
    const html = await page.content();

    const isLoggedIn = !currentUrl.includes('/accounts/login')
        && !html.includes('loginForm')
        && !html.includes('Log in')
        && !html.includes('Masuk')
        && !html.includes('log_in')
        && !html.includes('desktop_dynamic_landing_dialog');

    if (isLoggedIn) {
        // Cek lebih dalam apakah ada modal "Sign up for Instagram" (Login Wall)
        const hasLoginWall = await page.evaluate(() => {
            return !!document.querySelector('a[href*="desktop_dynamic_landing_dialog"]') || 
                   !!document.querySelector('[data-testid="royal_login_button"]') ||
                   (document.body.innerText.includes('Sign up for Instagram') && document.body.innerText.includes('Log in'));
        });

        if (!hasLoginWall) {
            sendPulseLog('✅ Instagram session masih aktif.', 'success');
            return true;
        }
        sendPulseLog('⚠️ Terdeteksi Login Wall (Interstitial modal).', 'warning');
    }

    if (!username || !password) {
        sendPulseLog('⚠️ Membutuhkan login tapi kredensial kosong!', 'warning');
        return false;
    }

    sendPulseLog('🔑 Belum login atau terdeteksi Login Wall, memulai proses login Instagram...', 'info');

    // Jika kita di landing dialog, navigasi ke login page
    if (html.includes('desktop_dynamic_landing_dialog') || currentUrl.includes('source=desktop_dynamic_landing_dialog')) {
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
    }
    await sleep(2000);

    try {
        await page.waitForSelector('input[name="username"]');
        await page.evaluate((u, p) => {
            const userInp = document.querySelector('input[name="username"]');
            const passInp = document.querySelector('input[name="password"]');
            window.__LCR_UTILS__.simulateTyping(userInp, u);
            window.__LCR_UTILS__.simulateTyping(passInp, p);
        }, username, password);

        await sleep(1000);
        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            window.__LCR_UTILS__.triggerClick(btn);
        });

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(3000);

        sendPulseLog('✅ Login Instagram berhasil!', 'success');
        return true;
    } catch (err) {
        sendPulseLog(`❌ Login Instagram gagal: ${err.message}`, 'error');
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
        && !html.includes('Log in')
        && !html.includes('Masuk');

    if (isLoggedIn) {
        sendPulseLog('✅ TikTok session masih aktif.', 'success');
        return true;
    }

    if (!username || !password) {
        sendPulseLog('⚠️ Membutuhkan login tapi kredensial kosong!', 'warning');
        return false;
    }

    sendPulseLog('🔑 Memulai proses login TikTok...', 'info');
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    try {
        await page.waitForSelector('input[type="password"]');
        await page.evaluate((u, p) => {
            const userInp = document.querySelector('input[name="username"], input[placeholder*="email" i], input[type="text"]');
            const passInp = document.querySelector('input[type="password"]');
            window.__LCR_UTILS__.simulateTyping(userInp, u);
            window.__LCR_UTILS__.simulateTyping(passInp, p);
        }, username, password);

        await sleep(1000);
        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"], button[data-e2e="login-button"]');
            window.__LCR_UTILS__.triggerClick(btn);
        });

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(3000);

        sendPulseLog('✅ Login TikTok berhasil!', 'success');
        return true;
    } catch (err) {
        sendPulseLog(`❌ Login TikTok gagal: ${err.message}`, 'error');
        return false;
    }
}

// ==========================================
// INSTAGRAM: ACTIONS (Pro version synced)
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

        // 1. LIKE
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

        // 2. COMMENT
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

        // 3. REPOST
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
                // Fallback to Save
                const saveSvg = document.querySelector('svg[aria-label="Save"], svg[aria-label="Simpan"]');
                if (saveSvg) {
                    const isSaved = !!document.querySelector('svg[aria-label="Remove"], svg[aria-label="Hapus"]');
                    if (isSaved) {
                        results.push({ action: 'repost', skipped: true });
                    } else {
                        const btn = saveSvg.closest('[role="button"], button') || saveSvg.parentElement;
                        utils.triggerClick(btn);
                        await utils.sleep(1000);
                        results.push({ action: 'repost', skipped: false, note: 'Saved as fallback for repost' });
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
// TIKTOK: ACTIONS (Pro version synced)
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

        // 1. LIKE
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

        // 2. COMMENT
        try {
            if (cmt) {
                let input = document.querySelector(SELS.commentInput);
                if (!input) {
                    const btn = document.querySelector(SELS.commentBtn);
                    if (btn) { utils.triggerClick(btn); await utils.sleep(1000); }
                }
                
                input = document.querySelector(SELS.commentInput);
                if (input) {
                    // Gunakan paste bypass untuk TikTok DraftEditor
                    utils.simulatePaste(input, cmt);
                    await utils.sleep(800);
                    
                    // Tunggu button Post jadi enabled
                    try {
                        const post = await utils.waitForEnabled(SELS.commentPost, 5000);
                        utils.triggerClick(post);
                        await utils.sleep(2000);
                        results.push({ action: 'comment', skipped: false });
                    } catch (err) {
                        results.push({ action: 'comment', error: 'Post button never enabled or not found' });
                    }
                } else {
                    results.push({ action: 'comment', error: 'Input not found' });
                }
            } else {
                results.push({ action: 'comment', skipped: true });
            }
        } catch (e) { results.push({ action: 'comment', error: e.message }); }

        await utils.sleep(1500);

        // 3. REPOST
        try {
            const share = document.querySelector(SELS.shareBtn);
            if (share) {
                utils.triggerClick(share);
                await utils.sleep(1500);
                const repost = document.querySelector(SELS.repostOption);
                if (repost) {
                    const label = repost.querySelector('p')?.textContent?.trim() ?? '';
                    if (/remove|hapus/i.test(label)) {
                        // Close popup
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
async function executeLCR(identity, payload) {
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

    sendPulseLog('═══════════════════════════════════', 'info');
    sendPulseLog(`🚀 LCR Pro Engine AKTIF | ${links.length} link terdeteksi`, 'info');
    sendPulseLog(`👤 Identity: ${identity.name || 'Unknown'}`, 'info');
    sendPulseLog('═══════════════════════════════════', 'info');

    const sessionName = (identity.name || 'default').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    let browser;
    try {
        sendPulseLog('🌐 Meluncurkan browser stealth...', 'info');
        browser = await launchBrowser(sessionName);
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

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

            let screenshotPath = null;
            try {
                const ssDir = path.join(__dirname, '../../../frontend/public/screenshots');
                if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
                screenshotPath = path.join(ssDir, `lcr_pro_${i + 1}_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
            } catch (e) {}

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
