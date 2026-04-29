# Daily Report Dashboard Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a short summary of Daily Report automation runs to the main dashboard's Activity Feed.

**Architecture:** Modify the automation engine to insert records into the `message_logs` table upon successful or failed message delivery.

**Tech Stack:** Node.js, SQLite (better-sqlite3).

---

### Task 1: Modify `processSend` in `automationEngine.js`

**Files:**
- Modify: `backend/src/services/automationEngine.js`

- [ ] **Step 1: Locate `processSend` function**
- [ ] **Step 2: Add log to `message_logs` on success**

```javascript
// Inside try block after sendMessageViaWa
const summary = `[DAILY REPORT] Laporan berhasil terkirim ke ${schedule.target_number}`;
db.prepare(
  "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)"
).run(schedule.api_key, schedule.target_number, summary, "SUCCESS");
```

- [ ] **Step 3: Add log to `message_logs` on failure**

```javascript
// Inside catch block
const summary = `[DAILY REPORT] Gagal mengirim laporan ke ${schedule.target_number}`;
db.prepare(
  "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)"
).run(schedule.api_key, schedule.target_number, summary, "FAILED");
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/automationEngine.js
git commit -m "feat: log scheduled daily report summary to dashboard"
```

---

### Task 2: Modify `processManualRuns` in `automationEngine.js`

**Files:**
- Modify: `backend/src/services/automationEngine.js`

- [ ] **Step 1: Locate `processManualRuns` function**
- [ ] **Step 2: Add log to `message_logs` on success**

```javascript
// Inside try block after sendMessageViaWa (Step 6)
const summary = `[DAILY REPORT] Laporan berhasil terkirim ke ${schedule.target_number}`;
db.prepare(
  "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)"
).run(schedule.api_key, schedule.target_number, summary, "SUCCESS");
```

- [ ] **Step 3: Add log to `message_logs` on failure**

```javascript
// Inside catch block
const summary = `[DAILY REPORT] Gagal mengirim laporan ke ${schedule.target_number}`;
db.prepare(
  "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)"
).run(schedule.api_key, schedule.target_number, summary, "FAILED");
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/automationEngine.js
git commit -m "feat: log manual daily report summary to dashboard"
```

---

### Task 3: Verification

- [ ] **Step 1: Restart backend server**
- [ ] **Step 2: Trigger "Run Automation Now" from UI**
- [ ] **Step 3: Check Main Dashboard Activity Feed**
- [ ] **Step 4: Verify log entry matches `[DAILY REPORT] Laporan berhasil terkirim ke ...`**
