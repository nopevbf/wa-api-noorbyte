# Design Spec: Jailbreak Credential Re-Authentication Management

## 1. Main Goal
Implement a strictly controlled session management system for the **Jailbreak** page to prevent D'Paragon credentials from being persisted indefinitely.

**Key Requirements:**
*   **30-Minute Inactivity Timeout:** If the user is idle for 30 minutes, Jailbreak credentials must expire.
*   **Mandatory Re-authentication:** When the Jailbreak session expires, users must re-enter D'Paragon credentials before performing any bypass actions.
*   **Synchronized Logout:** Logging out of the main system must immediately wipe all Jailbreak tokens and data.
*   **Fresh Session Requirement:** After a main system re-login, the Jailbreak page must start in an unauthenticated state, requiring a new D'Paragon login.

---

## 2. Unified Session Validation
The system will implement a **Dual-Layer Validation** check before any critical Jailbreak action.

### Layer 1: System Session
Check for the existence of the main system session (`noorbyte_session`).
*   **If missing:** Jailbreak credentials are treated as invalid, tokens are cleared, and the user is redirected to the main `/login` page.

### Layer 2: Jailbreak Activity Timeout
Check the `jailbreak_last_activity` timestamp stored in `localStorage`.
*   **Threshold:** 30 minutes.
*   **If expired:** Clear Jailbreak tokens (`dparagon_token`, `access_token`) and force the D'Paragon login modal to appear when a bypass action is clicked.

---

## 3. Activity Tracking
User interactions within the Jailbreak environment will refresh the `jailbreak_last_activity` timestamp.

**Tracked Events:**
*   Clicks (buttons, links)
*   Form submissions
*   Input activity (typing)
*   Mouse movement and scrolling
*   Touch events (mobile)

**Refresh Logic:** The timestamp only updates if the main system session is still valid and the Jailbreak session has not yet expired. Once expired, only a successful re-login to D'Paragon can reset the timer.

---

## 4. Automatic Inactivity Expiration
When the 30-minute idle threshold is reached:
1.  **Token Wipe:** Delete `dparagon_token`, `access_token`, and `full_name`.
2.  **State Reset:** Reset the internal `is_jailbreak_authenticated` state.
3.  **UI Lockdown:** The Jailbreak page remains open, but critical "BYPASS" buttons are locked. Clicking them triggers the login modal.

---

## 5. Verification Before Critical Actions
Actions like **BYPASS LOGIN** and **BYPASS ABSEN** must run a validation check immediately before execution:
1.  Verify `noorbyte_session` (Main login check).
2.  Verify existence of Jailbreak tokens.
3.  Verify `jailbreak_last_activity` is within the 30-minute window.
4.  If any check fails, block the action and prompt for D'Paragon credentials.

---

## 6. Synchronized Logout
The global logout logic (managed in `sidebar.js`) is updated to ensure atomic cleanup.

**Items to be cleared on Logout:**
*   `noorbyte_session`
*   `dparagon_token`
*   `access_token`
*   `full_name`
*   `jailbreak_last_activity`
*   Any other temporary Jailbreak cache.

---

## 7. Cross-Page Session Behavior
The 30-minute inactivity timer is based on `localStorage`, making it persistent across different pages or browser tabs.
*   If a user is logged into Jailbreak, navigates to the Dashboard, and stays idle there for 30 minutes, the Jailbreak session will be considered expired when they return to the Jailbreak page.

---

## 8. Expected Final Behavior
*   **Case 1 (Idle 30m):** User must re-authenticate with D'Paragon to bypass.
*   **Case 2 (Navigation + Idle 30m):** User must re-authenticate upon return.
*   **Case 3 (System Logout):** All Jailbreak data is purged. New login required after returning.
*   **Case 4 (Active User):** Activity refreshes the 30m timer; actions proceed without re-login.
