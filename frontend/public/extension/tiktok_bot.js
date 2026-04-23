'use strict';

// Guard against double-injection
if (window.__AUTO_LCR_TT__) {
  chrome.runtime.sendMessage({ type: 'LOG', message: '⚠️ Script terdeteksi ganda, menghentikan salah satu.', logType: 'warning' });
} else {
  window.__AUTO_LCR_TT__ = true;

  const SELECTORS = {
    likeBtn:        'button:has([data-e2e="like-icon"])',
    likeBtnActive:  'button[aria-pressed="true"]:has([data-e2e="like-icon"]), button:has([data-e2e="like-icon"][style*="fill: rgb(255, 43, 85)"]), button:has([data-e2e="like-icon"][style*="fill: rgb(254, 44, 85)"])',
    commentBtn:     'button:has([data-e2e="comment-icon"])',
    commentInput:   '[data-e2e="comment-text"] [contenteditable="true"]',
    commentPost:    'button[data-e2e="comment-post"]',
    shareBtn:       'button[aria-label*="Share video"]',
    repostOption:   '[data-e2e="share-repost"]',
    loginIndicator: 'form[action*="login"], [data-e2e="login-modal"]',
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

  async function waitForEnabled(selector, timeoutMs = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const el = document.querySelector(selector);
      if (el && !el.disabled) return el;
      await sleep(500);
    }
    return null;
  }

  function reactClick(el) {
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return false;
    let fiber = el[fiberKey];
    while (fiber) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && typeof props.onClick === 'function') {
        props.onClick({ type: 'click', target: el, currentTarget: el, bubbles: true, cancelable: true, preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: new MouseEvent('click') });
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
    if (document.querySelector(SELECTORS.likeBtnActive)) {
      sendLog('❤️ Post sudah di-like. Melewati...', 'warning');
      return { action: 'like', skipped: true };
    }
    const btn = await waitForEl(SELECTORS.likeBtn);
    sendLog('❤️ Menekan tombol Like...', 'info');
    triggerClick(btn);
    await sleep(1500);
    return { action: 'like', skipped: false };
  }

  async function postComment(text) {
    if (!text) return { action: 'comment', skipped: true };
    let input = document.querySelector(SELECTORS.commentInput);
    if (!input) {
      const btn = document.querySelector(SELECTORS.commentBtn);
      if (btn) { sendLog('💬 Membuka panel komentar...', 'info'); triggerClick(btn); await sleep(1500); }
    }
    input = await waitForEl(SELECTORS.commentInput);
    sendLog(`💬 Mengetik komentar...`, 'info');
    triggerClick(input); await sleep(500); input.focus();
    const dt = new DataTransfer(); dt.setData('text/plain', text);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(1500);
    const postBtn = await waitForEnabled(SELECTORS.commentPost);
    if (postBtn) {
      triggerClick(postBtn); await sleep(2000);
      sendLog('✅ Komentar terkirim!', 'success');
      return { action: 'comment', skipped: false };
    }
    return { action: 'comment', error: 'Tombol post tidak aktif' };
  }

  async function repostPost() {
    const shareBtn = document.querySelector(SELECTORS.shareBtn);
    if (!shareBtn) return { action: 'repost', error: 'Tombol share tidak ada' };
    triggerClick(shareBtn); await sleep(1500);
    const repostEl = await waitForEl(SELECTORS.repostOption);
    const label = repostEl.querySelector('p')?.textContent.trim() ?? '';
    if (/remove|hapus/i.test(label)) {
      sendLog('🔁 Sudah di-repost. Melewati...', 'warning');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { action: 'repost', skipped: true };
    }
    sendLog('🔁 Melakukan Repost...', 'info');
    triggerClick(repostEl); await sleep(1500);
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
        sendLog('🚀 Memulai rangkaian aksi TikTok Local...', 'info');
        if (document.querySelector(SELECTORS.loginIndicator)) {
          throw new Error('Belum login ke TikTok!');
        }

        await waitForEl('[data-e2e="like-icon"]', 15000);
        sendLog('📌 Postingan siap dieksekusi.', 'success');

        const results = [];
        const randomDelay = async () => {
          const ms = 7000 + Math.random() * 4000; // Minimal 7 detik
          sendLog(`⏳ Jeda aman (${(ms/1000).toFixed(1)}s)...`, 'info');
          await sleep(ms);
        };

        // Jeda waktu tonton (Watch Time) sebelum Like
        await randomDelay();

        // 1. LIKE (Urutan Pertama sesuai request)
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
