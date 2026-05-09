# Jailbreak Session Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 30-minute inactivity timeout for the Jailbreak page and ensure it is strictly tied to the main system session and logout.

**Architecture:** 
- Use `localStorage` to track `jailbreak_last_activity`.
- Implement a global activity watcher in `sidebar.js` that resets the timer on user interaction.
- Add a periodic background check that clears Jailbreak tokens if the session expires or the main system session is lost.
- Modify the Jailbreak pages (`checkin.js`, `jailbreak.js`) to verify the session before allowing any "BYPASS" actions.

**Tech Stack:** Vanilla JavaScript, LocalStorage.

---

### Task 1: Core Session Management & Activity Watcher

**Files:**
- Modify: `frontend/public/js/sidebar.js`

- [ ] **Step 1: Define global session management functions**
Add these helper functions to the top of `sidebar.js` (or after initial setup) to handle Jailbreak session state.

```javascript
// ==========================================
// JAILBREAK SESSION UTILITIES
// ==========================================
function clearJailbreakSession() {
    console.log("[SESSION] Clearing Jailbreak credentials...");
    localStorage.removeItem("full_name");
    localStorage.removeItem("active_env");
    localStorage.removeItem("dparagon_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("jailbreak_last_activity");
    localStorage.removeItem("active_timebomb_key");
}

function updateJailbreakActivity() {
    // Hanya update jika session utama masih ada
    if (localStorage.getItem('noorbyte_session')) {
        localStorage.setItem('jailbreak_last_activity', Date.now().toString());
    }
}

function isJailbreakSessionValid() {
    const mainSession = localStorage.getItem('noorbyte_session');
    if (!mainSession) return false;

    const lastActivity = localStorage.getItem('jailbreak_last_activity');
    if (!lastActivity) return false;

    const thirtyMinutes = 30 * 60 * 1000;
    if (Date.now() - parseInt(lastActivity) > thirtyMinutes) {
        return false;
    }

    // Pastikan token minimal ada salah satu (dparagon_token atau access_token)
    if (!localStorage.getItem('dparagon_token') && !localStorage.getItem('access_token')) {
        return false;
    }

    return true;
}

// Export to window so other scripts can access
window.clearJailbreakSession = clearJailbreakSession;
window.updateJailbreakActivity = updateJailbreakActivity;
window.isJailbreakSessionValid = isJailbreakSessionValid;
```

- [ ] **Step 2: Implement Background Session Monitor**
Add a watcher that runs every 10 seconds to check for timeout or logout.

```javascript
function startJailbreakSessionWatcher() {
    setInterval(() => {
        const currentPath = window.location.pathname;
        // Hanya jalan jika di halaman jailbreak
        if (currentPath.includes('jailbreak') || currentPath.includes('checkin')) {
            if (!localStorage.getItem('noorbyte_session')) {
                console.warn("[SESSION] Main session lost. Cleaning up...");
                clearJailbreakSession();
                window.location.href = "/login";
                return;
            }

            if (!isJailbreakSessionValid()) {
                const hasTokens = localStorage.getItem('dparagon_token') || localStorage.getItem('access_token');
                if (hasTokens) {
                    console.warn("[SESSION] Jailbreak session expired (30m idle).");
                    clearJailbreakSession();
                    // Munculkan modal login jika fungsi tersedia (di checkin.js)
                    if (typeof showJailbreakLoginModal === 'function') {
                        showJailbreakLoginModal();
                    } else {
                        window.location.reload(); // Fallback
                    }
                }
            }
        }
    }, 10000); // Cek setiap 10 detik
}

// Panggil di akhir loadSidebar
// startJailbreakSessionWatcher();
```

- [ ] **Step 3: Implement Global Interaction Tracking**
Add listeners to capture any activity.

```javascript
function initJailbreakActivityTracking() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => {
        document.addEventListener(name, updateJailbreakActivity, { passive: true });
    });
}
// initJailbreakActivityTracking();
```

- [ ] **Step 4: Update Sidebar initialization**
Ensure these are called inside `loadSidebar`.

- [ ] **Step 5: Verify changes**
Check that `sidebar.js` compiles and `isJailbreakSessionValid` is accessible via console.

---

### Task 2: Synchronized Logout Cleanup

**Files:**
- Modify: `frontend/public/js/sidebar.js`

- [ ] **Step 1: Ensure `btnConfirmLogout` calls cleanup**
Modify the existing `btnConfirmLogout` event listener to include `clearJailbreakSession()`.

```javascript
      btnConfirmLogout.addEventListener("click", () => {
        btnConfirmLogout.innerHTML = `<span class="material-symbols-outlined text-xl animate-spin">autorenew</span>`;
        btnConfirmLogout.disabled = true;
        btnCancelLogout.disabled = true;

        setTimeout(() => {
          // Sapu bersih session jailbreak
          if (typeof clearJailbreakSession === 'function') {
              clearJailbreakSession();
          }

          // --- SAPU BERSIH SESSION SISTEM UTAMA ---
          localStorage.removeItem("noorbyte_session");
          localStorage.removeItem("noorbyte_username");
          localStorage.removeItem("noorbyte_phone");
          localStorage.removeItem("connectApi_loggedIn");
          localStorage.removeItem("automationSelectedDevice");

          // TENDANG KE HALAMAN LOGIN
          window.location.href = "/login";
        }, 800);
      });
```

---

### Task 3: Jailbreak Action Validation (Check-in Page)

**Files:**
- Modify: `frontend/public/js/checkin.js`

- [ ] **Step 1: Add modal helper**
Expose a function to show the auth modal when the session is expired.

```javascript
function showJailbreakLoginModal() {
    const authModal = document.getElementById('dparagonAuthModal');
    if (authModal) {
        authModal.classList.remove('hidden');
        // Reset progress bar dsb jika perlu
    }
}
window.showJailbreakLoginModal = showJailbreakLoginModal;
```

- [ ] **Step 2: Update session check on load**
Modify the `DOMContentLoaded` logic to strictly check `isJailbreakSessionValid()`.

```javascript
    // ===================================
    // 0. CEK SESSION (AUTO-BYPASS MODAL)
    // ===================================
    if (typeof isJailbreakSessionValid === 'function' && isJailbreakSessionValid()) {
        console.log("[SYSTEM] Session valid. Bypassing auth modal...");
        if (authModal) authModal.classList.add('hidden');
        loadRecentAttendanceWidget();
        setTimeout(() => {
            if (typeof startCamera === 'function') startCamera();
        }, 500);
    } else {
        console.log("[SYSTEM] No valid Jailbreak session. Showing auth modal.");
        if (authModal) authModal.classList.remove('hidden');
        // Clear tokens just in case
        if (typeof clearJailbreakSession === 'function') clearJailbreakSession();
    }
```

- [ ] **Step 3: Update action button listeners**
Modify `btnCapture` to check the session before doing anything.

```javascript
    if (btnCapture) {
        btnCapture.addEventListener('click', () => {
            // VERIFIKASI SESSION SEBELUM AKSI
            if (typeof isJailbreakSessionValid === 'function' && !isJailbreakSessionValid()) {
                showSystemAlert('SESSION EXPIRED', "Sesi Jailbreak Anda telah berakhir. Silakan login ulang ke D'Paragon.", 'error');
                showJailbreakLoginModal();
                return;
            }
            // ... rest of original logic
        });
    }
```

- [ ] **Step 4: Update Login Success**
Ensure `jailbreak_last_activity` is set upon successful D'Paragon login.

---

### Task 4: Terminal Page Lockdown (Jailbreak Page)

**Files:**
- Modify: `frontend/public/js/jailbreak.js`

- [ ] **Step 1: Implement Session Check**
Add the same session check on load for `jailbreak.html`'s logic.

```javascript
document.addEventListener("DOMContentLoaded", () => {
  // VERIFIKASI SESSION
  if (typeof isJailbreakSessionValid === 'function' && !isJailbreakSessionValid()) {
      window.location.href = "/checkin"; // Redirect ke halaman absen biar login ulang
      return;
  }
  // ... rest of logic
});
```

---

### Task 5: Testing & Verification

- [ ] **Step 1: Test Inactivity Timeout**
1. Login to D'Paragon.
2. Manually set `jailbreak_last_activity` in console to a value older than 30 minutes.
3. Wait 10 seconds for the watcher to run.
4. Verify that tokens are cleared and the login modal appears.

- [ ] **Step 2: Test Synchronized Logout**
1. Login to System & D'Paragon.
2. Click Logout in sidebar.
3. Verify `noorbyte_session` AND `access_token` are gone.
4. Login back to System.
5. Go to Jailbreak page; verify it asks for D'Paragon login again.

- [ ] **Step 3: Test Activity Refresh**
1. Login to D'Paragon.
2. Note the timestamp in `jailbreak_last_activity`.
3. Move mouse or scroll.
4. Verify the timestamp has updated.
