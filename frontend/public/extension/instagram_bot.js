'use strict';

// Guard against double-injection
if (window.__AUTO_LCR_IG__) {
  chrome.runtime.sendMessage({ type: 'LOG', message: '⚠️ Script Instagram terdeteksi ganda, menghentikan salah satu.', logType: 'warning' });
} else {
  window.__AUTO_LCR_IG__ = true;

  const SELECTORS = {
    // height="24" = post action bar; height="16" = comment like — this is the diff
    likeSvg:        'svg[aria-label="Like"][height="24"], svg[aria-label="Suka"][height="24"]',
    unlikeSvg:      'svg[aria-label="Unlike"][height="24"], svg[aria-label="Tidak Suka"][height="24"]',

    // Comment icon SVG
    commentSvg:     'svg[aria-label="Comment"], svg[aria-label="Komentar"]',
    commentInput:   'textarea[aria-label="Add a comment\u2026"], textarea[placeholder*="comment" i], textarea[placeholder*="komentar" i]',

    // Repost button — height="24" excludes the h22 corner badge;
    // :not(:has(circle)) excludes the purple circular floating badge (has <circle> inside SVG)
    repostSvg: 'svg[aria-label="Repost"][height="24"]:not(:has(circle))',
  };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForEl(selector, timeoutMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(500);
    }
    throw new Error(`Timeout: Elemen ${selector} tidak muncul.`);
  }

  function findClickable(svgSelector) {
    const svg = document.querySelector(svgSelector);
    if (!svg) return null;
    return svg.closest('[role="button"], button, a') || svg.parentElement;
  }

  function reactClick(el) {
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
            nativeEvent: new MouseEvent('click') 
        });
        return true;
      }
      fiber = fiber.return;
    }
    return false;
  }

  function triggerClick(el) {
    el.scrollIntoView({ block: 'center' });
    if (!reactClick(el)) {
      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    }
  }

  function sendLog(message, type = 'info') {
    chrome.runtime.sendMessage({ type: 'LOG', message, logType: type }).catch(()=>{});
  }

  async function likePost() {
    if (document.querySelector(SELECTORS.unlikeSvg)) {
      sendLog('❤️ Post sudah di-like. Melewati...', 'warning');
      return { action: 'like', skipped: true };
    }
    const svg = document.querySelector(SELECTORS.likeSvg);
    if (!svg) throw new Error('Tombol Like tidak ditemukan');
    const btn = findClickable(SELECTORS.likeSvg);
    sendLog('❤️ Menekan tombol Like...', 'info');
    triggerClick(btn || svg);
    await sleep(1500);
    return { action: 'like', skipped: false };
  }

  async function postComment(text) {
    if (!text) return { action: 'comment', skipped: true };
    let input = document.querySelector(SELECTORS.commentInput);
    if (!input) {
      const trigger = findClickable(SELECTORS.commentSvg);
      if (trigger) { 
          sendLog('💬 Membuka panel komentar...', 'info'); 
          triggerClick(trigger); 
          await sleep(1500); 
      }
    }
    input = await waitForEl(SELECTORS.commentInput);
    sendLog(`💬 Mengetik komentar...`, 'info');
    
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    await sleep(1000);

    const form = input.closest('form');
    const findSubmit = () => [...document.querySelectorAll('[role="button"], button')].find(
        el => (el.textContent.trim() === 'Post' || el.textContent.trim() === 'Bagikan') && (!form || el.closest('form') === form)
    );
    
    const submitBtn = findSubmit();
    if (submitBtn) {
      triggerClick(submitBtn); 
      await sleep(2000);
      sendLog('✅ Komentar terkirim!', 'success');
      return { action: 'comment', skipped: false };
    }
    return { action: 'comment', error: 'Tombol post tidak ditemukan' };
  }

  async function repostPost() {
    const scope = document.querySelector('article') || document;
    const svg = scope.querySelector(SELECTORS.repostSvg);
    if (!svg) {
        sendLog('🔁 Tombol Repost tidak ditemukan.', 'warning');
        return { action: 'repost', error: 'Tombol repost tidak ada' };
    }

    const pathD = svg.querySelector('path')?.getAttribute('d') ?? '';
    if ((pathD.match(/[Mm]/g)?.length ?? 0) >= 3) {
      sendLog('🔁 Sudah di-repost. Melewati...', 'warning');
      return { action: 'repost', skipped: true };
    }

    sendLog('🔁 Melakukan Repost...', 'info');
    const btn = findClickable(SELECTORS.repostSvg);
    triggerClick(btn || svg); 
    await sleep(1500);
    sendLog('✅ Repost sukses!', 'success');
    return { action: 'repost', skipped: false };
  }

  let isRunning = false;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') { sendResponse({ ok: true }); return true; }
    if (message.type !== 'RUN_ACTIONS') return false;

    if (isRunning) {
      sendResponse({ received: true });
      return true;
    }
    
    isRunning = true;
    sendResponse({ received: true });

    (async () => {
      try {
        sendLog('🚀 Memulai rangkaian aksi Instagram Local...', 'info');
        if (document.querySelector('input[name="username"], [data-testid="royal_login_button"]')) {
          throw new Error('Belum login ke Instagram!');
        }

        await waitForEl(SELECTORS.likeSvg, 15000);
        sendLog('📌 Postingan siap dieksekusi.', 'success');

        const results = [];
        const randomDelay = async () => {
          const ms = 5000 + Math.random() * 3000; 
          sendLog(`⏳ Jeda aman (${(ms/1000).toFixed(1)}s)...`, 'info');
          await sleep(ms);
        };

        // Watch Time
        await randomDelay();

        // 1. LIKE
        results.push(await likePost());
        await randomDelay();

        // 2. COMMENT
        results.push(await postComment(message.comment));
        await randomDelay();

        // 3. REPOST
        results.push(await repostPost());
        await randomDelay();

        sendLog('📸 Menyiapkan screenshot...', 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await sleep(2000);
        
        chrome.runtime.sendMessage({ type: 'ACTIONS_DONE', results });
      } catch (err) {
        sendLog(`❌ Error: ${err.message}`, 'error');
        chrome.runtime.sendMessage({ type: 'ACTIONS_ERROR', error: err.message });
      }
    })();
    return true;
  });
}
