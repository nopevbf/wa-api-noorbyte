# Renaming to NoorByteAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "ConnectAPI" to "NoorByteAPI" across the entire project and update related `localStorage` keys.

**Architecture:** Global search and replace of branding and technical identifiers.

**Tech Stack:** JavaScript, HTML.

---

### Task 1: Update UI Branding

**Files:**
- Modify: `frontend/public/components/sidebar.html`

- [ ] **Step 1: Update sidebar brand name**

Replace:
```html
<h1 class="text-base font-bold leading-none tracking-tight">ConnectAPI</h1>
```
With:
```html
<h1 class="text-base font-bold leading-none tracking-tight">NoorByteAPI</h1>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/components/sidebar.html
git commit -m "chore: rename brand to NoorByteAPI in sidebar"
```

### Task 2: Update LocalStorage Keys (Part 1 - Auth)

**Files:**
- Modify: `backend/src/navbar-logic.js`
- Modify: `frontend/public/js/automation.js`
- Modify: `frontend/public/js/dashboard.js`
- Modify: `frontend/public/js/devices.js`
- Modify: `frontend/public/js/groups.js`
- Modify: `frontend/public/js/login.js`
- Modify: `frontend/public/js/sidebar.js`
- Modify: `frontend/public/js/tester.js`

- [ ] **Step 1: Replace `connectApi_loggedIn` with `noorbyte_loggedIn`**

Perform global replacement of `connectApi_loggedIn` with `noorbyte_loggedIn` in the listed files.

- [ ] **Step 2: Commit**

```bash
git add backend/src/navbar-logic.js frontend/public/js/*.js
git commit -m "chore: update auth localStorage key to noorbyte_loggedIn"
```

### Task 3: Update LocalStorage Keys (Part 2 - Settings)

**Files:**
- Modify: `frontend/public/js/automation.js`

- [ ] **Step 1: Replace `connectApiSettings` with `noorbyteSettings`**

Perform global replacement of `connectApiSettings` with `noorbyteSettings` in `frontend/public/js/automation.js`.

- [ ] **Step 2: Commit**

```bash
git add frontend/public/js/automation.js
git commit -m "chore: update settings localStorage key to noorbyteSettings"
```

### Task 4: Final Verification

- [ ] **Step 1: Run global search for any remaining "ConnectAPI" or "connectApi"**

Run:
```bash
grep -ri "ConnectAPI" .
grep -ri "connectApi" .
```

Verify that no relevant occurrences remain.

---
