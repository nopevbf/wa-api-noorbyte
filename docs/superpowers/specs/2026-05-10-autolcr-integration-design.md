# Design Spec: AutoLCR Integration into Pulse Automation

**Date:** 2026-05-10
**Topic:** Integrating Instagram Local Mode, Robust Selectors, and Comment Pool from AutoLCR.

## 1. Overview
This project integrates the core functionality of the [AutoLCR](https://github.com/AZakkyMakarim/autolcr.git) extension into the existing **Pulse Automation** workspace. The goal is to enhance the success rate of automated engagement (Like, Comment, Repost) and provide more flexibility for Instagram automation.

## 2. Goals
- **Instagram Local Mode:** Expand the Pulse Chrome Extension to support Instagram automation, matching the current TikTok capabilities.
- **Robust Selectors:** Update the backend `lcrEngine.js` and extension scripts with AutoLCR's tested DOM selectors for Instagram and TikTok.
- **Comment Pool:** Transform the single-line comment input into a multi-line pool where one comment is randomly selected for each post.

## 3. Architecture
The integration follows a "Surgical" approach, updating existing files and adding one new content script to the extension.

### 3.1. Frontend UI (`frontend/public/`)
- **Comment Randomization:** `pulse.js` will split the `manual.comments` input by newline and pick a random index for every link in the queue.
- **IG Local Toggle:** The UI will now permit "Local Browser" mode for Instagram links if the Pulse extension is detected.

### 3.2. Chrome Extension (`frontend/public/extension/`)
- **New Script:** `instagram_bot.js` will be created using ported logic from AutoLCR.
- **Manifest:** Updated to include `instagram.com` host permissions and register the new content script.
- **Bridge:** `pulse_bridge.js` will be updated to handle a generic `PULSE_EXECUTE_LCR` event or separate IG/TT events.

### 3.3. Backend Service (`backend/src/services/`)
- **Selector Update:** `lcrEngine.js` will have its `SELECTORS` constants and interaction logic (Wait time, React Fiber bypass) updated to match AutoLCR's improved patterns.

## 4. Implementation Details

### 4.1. Comment Pool Logic (Alpine.js)
```javascript
const comments = this.manual.comments.split('\n').filter(c => c.trim());
const randomComment = comments[Math.floor(Math.random() * comments.length)] || '';
```

### 4.2. Extension Bridge Update
The bridge will listen for specific signals to trigger the `instagram_bot.js` logic, ensuring it handles the URL navigation and action sequence (Watch -> Like -> Comment -> Repost -> Screenshot).

## 5. Success Criteria
- [ ] Users can enter multiple comments in the UI.
- [ ] Instagram posts can be automated using the "Local Browser" mode.
- [ ] Backend "Phantom Mode" success rate improves for both IG and TikTok.
- [ ] Screenshots are captured correctly for both platforms in all modes.

## 6. Risk & Mitigation
- **Detection:** Ported logic includes random delays and "watch time" simulations to mimic human behavior.
- **Maintenance:** Centralizing selectors in the backend where possible, though content scripts must remain independent.
