# Design: Project-wide Renaming from ConnectAPI to NoorByteAPI

This document outlines the changes required to rename "ConnectAPI" to "NoorByteAPI" across the project, including display names and `localStorage` keys.

## Objective
Update the branding and technical identifiers from "ConnectAPI" to "NoorByteAPI" to align with the new brand identity.

## Proposed Changes

### 1. Brand Name (Display)
The main brand name displayed in the UI will be updated.

- **Target File:** `frontend/public/components/sidebar.html`
- **Change:** `ConnectAPI` -> `NoorByteAPI`

### 2. LocalStorage Keys
Identifiers used for session management and settings in the browser's `localStorage` will be updated.

- **Key Changes:**
  - `connectApi_loggedIn` -> `noorbyte_loggedIn`
  - `connectApiSettings` -> `noorbyteSettings`

- **Target Files:**
  - `backend/src/navbar-logic.js`
  - `frontend/public/js/automation.js`
  - `frontend/public/js/dashboard.js`
  - `frontend/public/js/devices.js`
  - `frontend/public/js/groups.js`
  - `frontend/public/js/login.js`
  - `frontend/public/js/sidebar.js`
  - `frontend/public/js/tester.js`

## Impact and Mitigation
- **User Sessions:** Users currently logged in will be logged out because the old `connectApi_loggedIn` key will no longer be checked. This is expected during a brand migration.
- **Settings:** Users will lose their saved settings in `connectApiSettings`. They will need to re-configure them, or we could add a one-time migration script (though likely not necessary for this project).

## Verification Plan
1.  **Manual Verification:**
    - Open the application and verify the title in the sidebar.
    - Log in and verify that `noorbyte_loggedIn` is set in `localStorage`.
    - Check settings in Automation page and verify `noorbyteSettings` is used.
2.  **Search:** Run `grep_search` again to ensure no "ConnectAPI" or "connectApi" remains in the codebase (except for potential historical logs or comments if any).
