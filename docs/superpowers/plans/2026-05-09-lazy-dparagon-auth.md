# Lazy D'Paragon Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the D'Paragon authentication flow so the login modal only appears when clicking the action button, not on page load.

**Architecture:** 
- Modify `checkin.js` initialization to suppress the modal on load if the session is missing.
- Add a session check to the capture button to trigger the modal lazily.
- Link successful authentication to camera initialization.

**Tech Stack:** Vanilla JavaScript.

---

### Task 1: Update Initialization Logic

**Files:**
- Modify: `frontend/public/js/checkin.js`

- [ ] **Step 1: Remove auto-modal display on load**
Find the `DOMContentLoaded` block and modify the session check logic. It should no longer call `showJailbreakLoginModal()` if the session is invalid.

```javascript
// BEFORE
    } else {
        const mainSession = localStorage.getItem("noorbyte_session");
        if (!mainSession) {
            window.location.replace("/login");
            return;
        }
        console.log("[SYSTEM] No valid Jailbreak session. Showing login modal.");
        if (typeof clearJailbreakSession === 'function') clearJailbreakSession();
        showJailbreakLoginModal();
    }

// AFTER
    } else {
        const mainSession = localStorage.getItem("noorbyte_session");
        if (!mainSession) {
            window.location.replace("/login");
            return;
        }
        console.log("[SYSTEM] No valid Jailbreak session. Waiting for user action.");
        // Keep modal hidden, don't clear session yet to allow lazy check
    }
```

---

### Task 2: Implement Lazy Auth on Action

**Files:**
- Modify: `frontend/public/js/checkin.js`

- [ ] **Step 1: Update `btnCapture` to trigger modal**
In the `btnCapture` event listener, ensure that if the session is invalid, it clears the stale tokens and shows the modal.

```javascript
// Ensure this logic is at the start of the click listener
            if (typeof isJailbreakSessionValid === 'function' && !isJailbreakSessionValid()) {
                const mainSession = localStorage.getItem("noorbyte_session");
                if (!mainSession) {
                    window.location.replace("/login");
                    return;
                }
                
                // Clear stale credentials before showing modal
                if (typeof clearJailbreakSession === 'function') clearJailbreakSession();
                
                console.log("[SYSTEM] Action blocked. Showing D'Paragon login modal.");
                showJailbreakLoginModal();
                return; // Stop execution
            }
```

---

### Task 3: Update Login Success Handler

**Files:**
- Modify: `frontend/public/js/checkin.js`

- [ ] **Step 1: Initialize Camera after login**
In the `authForm` submit handler, find the success block where the modal is hidden. Add a call to `startCamera()` and `loadRecentAttendanceWidget()`.

```javascript
                // Inside the setTimeout that hides the modal:
                setTimeout(() => {
                    authModal.classList.add('hidden');
                    if (typeof startCamera === 'function') startCamera();
                    // Load widget after login
                    if (typeof loadRecentAttendanceWidget === 'function') loadRecentAttendanceWidget(true);
                }, 500);
```

---

### Task 4: Verification

- [ ] **Step 1: Test Page Load**
1. Clear `localStorage` of `access_token` and `dparagon_token`.
2. Reload `checkin.html`.
3. **Verify:** Modal is NOT visible. Camera is offline.

- [ ] **Step 2: Test Lazy Trigger**
1. Click "Ambil & Kirim".
2. **Verify:** D'Paragon login modal appears.

- [ ] **Step 3: Test Post-Login**
1. Enter valid D'Paragon credentials.
2. Submit.
3. **Verify:** Modal closes, Camera turns on, "Ambil & Kirim" button is ready for use.
