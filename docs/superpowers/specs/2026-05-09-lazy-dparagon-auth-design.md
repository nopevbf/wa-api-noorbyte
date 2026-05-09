# Design Spec: Lazy D'Paragon Authentication for Jailbreak

## 1. Goal
Modify the authentication trigger on the Jailbreak (Check-in) page so that the D'Paragon login modal only appears when the user attempts to perform an action, rather than appearing automatically on page load.

## 2. Changes in `checkin.js`

### A. Initialization (`DOMContentLoaded`)
*   **Current:** Automatically shows `dparagonAuthModal` if session is missing or expired.
*   **New:** 
    *   If session is valid: Call `loadRecentAttendanceWidget()` and `startCamera()`.
    *   If session is invalid: Do nothing (keep modal hidden).
    *   Ensure the camera stays in the `cameraPlaceholder` state.

### B. Action Trigger (`btnCapture`)
*   **Logic:**
    1.  Check `isJailbreakSessionValid()`.
    2.  If **Invalid**:
        *   Call `showJailbreakLoginModal()`.
        *   Abort further execution of the capture logic.
    3.  If **Valid**:
        *   Proceed with existing capture/presence logic.

### C. Post-Authentication Success
*   When the D'Paragon login is successful:
    1.  Hide the modal.
    2.  Automatically call `startCamera()`.
    3.  Initialize `loadRecentAttendanceWidget(true)`.
    4.  Reset the `jailbreak_last_activity` timer.

## 3. UI/UX Flow
1.  User enters Clock In page.
2.  User sees the Camera placeholder and the "Ambil & Kirim" button.
3.  User clicks "Ambil & Kirim".
4.  Modal "D'Paragon Auth" pops up.
5.  User enters credentials and submits.
6.  Modal closes, Camera turns on.
7.  User can now use "Ambil & Kirim" to actually capture their presence.
