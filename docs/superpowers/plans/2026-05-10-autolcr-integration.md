# AutoLCR Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate robust Instagram and TikTok automation logic from AutoLCR into Pulse Automation, including a newline-separated Comment Pool.

**Architecture:**
- **Frontend:** Update `pulse.js` to handle random comment selection from a multi-line pool.
- **Extension:** Add `instagram_bot.js`, update `manifest.json`, and refine `pulse_bridge.js` to support Instagram.
- **Backend:** Update `lcrEngine.js` with the latest robust selectors and interaction patterns from AutoLCR.

**Tech Stack:** JavaScript, Alpine.js, Puppeteer, Chrome Extension MV3.

---

### Task 1: UI Comment Pool & Randomization

**Files:**
- Modify: `frontend/public/js/pulse.js`

- [ ] **Step 1: Update `startManual` to pick random comments**
Update the loop that prepares links to also select a random comment for each link.

```javascript
// Modify startManual in pulse.js
async startManual() {
    // ... validation code ...
    const allLinks = this.manual.links.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const commentPool = this.manual.comments.split('\n').map(c => c.trim()).filter(c => c.length > 0);
    
    // ... partitioning links ...

    // When sending to Extension or Backend, ensure we pick a random comment
    const getComment = () => commentPool[Math.floor(Math.random() * commentPool.length)] || '';
    
    // Update individual task dispatch logic to use random comment
}
```

- [ ] **Step 2: Update `pulse.html` placeholder for Comments**
Modify the textarea placeholder to indicate it's a pool.

```html
<textarea x-model="manual.comments" ... placeholder="Awesome! 🔥\nGreat post!\nLove this!"></textarea>
```

- [ ] **Step 3: Test randomization**
Log the selected comment for each link to verify it picks different ones from the pool.

---

### Task 2: Extension Manifest & Bridge Update

**Files:**
- Modify: `frontend/public/extension/manifest.json`
- Modify: `frontend/public/extension/pulse_bridge.js`

- [ ] **Step 1: Update `manifest.json`**
Add Instagram host permissions and register the new content script.

```json
{
  "host_permissions": ["<all_urls>", "*://*.instagram.com/*"],
  "content_scripts": [
    {
      "matches": ["*://*.instagram.com/*"],
      "js": ["instagram_bot.js"],
      "run_at": "document_idle"
    }
    // ... existing ...
  ]
}
```

- [ ] **Step 2: Update `pulse_bridge.js`**
Add support for detecting and routing Instagram execution events.

```javascript
// Add listener for PULSE_EXECUTE_INSTAGRAM (similar to TIKTOK)
window.addEventListener('PULSE_EXECUTE_INSTAGRAM', (e) => {
    const { links, comment, mode } = e.detail;
    chrome.runtime.sendMessage({ type: 'START_QUEUE', platform: 'instagram', links, comment, mode });
});
```

- [ ] **Step 3: Update `background.js` in extension**
Ensure the background script can handle the `platform` parameter in `START_QUEUE`.

---

### Task 3: Instagram Bot Content Script

**Files:**
- Create: `frontend/public/extension/instagram_bot.js`

- [ ] **Step 1: Port AutoLCR Instagram logic**
Copy and adapt the logic from `temp_autolcr/src/content/instagram.js` to match the Pulse extension's communication style (using `chrome.runtime.sendMessage` for logs).

- [ ] **Step 2: Implement "Watch Time" simulation**
Add random delays before each action as seen in AutoLCR.

---

### Task 4: Backend LCR Engine Selector Update

**Files:**
- Modify: `backend/src/services/lcrEngine.js`

- [ ] **Step 1: Update IG Selectors**
Replace `SELS` in `instagramActions` with the robust versions from AutoLCR.

```javascript
const SELS = {
    likeSvg: 'svg[aria-label="Like"][height="24"], svg[aria-label="Suka"][height="24"]',
    unlikeSvg: 'svg[aria-label="Unlike"][height="24"], svg[aria-label="Tidak Suka"][height="24"]',
    commentSvg: 'svg[aria-label="Comment"], svg[aria-label="Komentar"]',
    commentInput: 'textarea[aria-label*="Add a comment" i], textarea[placeholder*="comment" i], textarea[placeholder*="komentar" i]',
    repostSvg: 'svg[aria-label="Repost"][height="24"]:not(:has(circle))'
};
```

- [ ] **Step 2: Update TikTok Selectors & Logic**
Refine `tiktokActions` with the `DataTransfer` paste method for comments if not already using it.

- [ ] **Step 3: Test Backend Execution**
Run a manual test for both IG and TT in Phantom mode.

---

### Task 5: Cleanup & Verification

- [ ] **Step 1: Remove temporary files**
Delete `temp_autolcr` directory.

- [ ] **Step 2: Final Integration Test**
Verify full flow: UI -> Extension (IG/TT) and UI -> Backend (IG/TT).
