# Manual Task Merging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow manual tasks to be merged with automated DParagon tasks, with automatic expiration filtering and database persistence.

**Architecture:** Extend the `automation_schedules` table to store manual tasks. Modify the automation pipeline to filter expired manual tasks and append valid ones to the scraped results, ensuring reporting continues even if scraping yields no results.

**Tech Stack:** Node.js, Express, SQLite, Vanilla JavaScript.

---

### Task 1: Database Schema Update

**Files:**
- Modify: `backend/src/config/database.js`

- [ ] **Step 1: Update schema definition**
Add `manual_tasks TEXT` to the `automation_schedules` table definition.

```javascript
// backend/src/config/database.js
// Update the CREATE TABLE statement for automation_schedules
  CREATE TABLE IF NOT EXISTS automation_schedules (
    ...
    manual_tasks TEXT, -- Added this
    ...
  );
```

- [ ] **Step 2: Apply migration to existing database**
Run a one-time command to add the column if it doesn't exist.

Run: `pwsh -NoProfile -Command "& { node -e \"const db = require('./backend/src/config/database'); try { db.prepare('ALTER TABLE automation_schedules ADD COLUMN manual_tasks TEXT').run(); console.log('Column added'); } catch(e) { console.log('Column might already exist'); }\" }"`

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/database.js
git commit -m "db: add manual_tasks column to automation_schedules"
```

---

### Task 2: Frontend Payload Update

**Files:**
- Modify: `frontend/public/js/automation.js`

- [ ] **Step 1: Update `btnSaveSettings` payload**
Modify the click event listener for `#btnSaveSettings` to include `manual_tasks`.

```javascript
// Search for btnSaveSettings.addEventListener("click"
const formData = {
  ...
  manual_tasks: JSON.parse(localStorage.getItem("manualTasks") || "[]"),
  ...
};
```

- [ ] **Step 2: Update `btnRunManual` payload**
Modify the click event listener for `#btnRunManual` (or the logic inside `processRunManual`) to include `manual_tasks`.

```javascript
// Search for fetch(`${API_URL}/automation/run-manual`
const res = await fetch(`${API_URL}/automation/run-manual`, {
  method: "POST",
  ...
  body: JSON.stringify({
    ...
    manual_tasks: JSON.parse(localStorage.getItem("manualTasks") || "[]"),
  }),
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/js/automation.js
git commit -m "feat: send manualTasks in frontend automation requests"
```

---

### Task 3: Backend API Update - Save Settings

**Files:**
- Modify: `backend/src/routes/apiRoutes.js`

- [ ] **Step 1: Update `/automation/save-settings` route**
Extract `manual_tasks` from `req.body` and update the SQL queries.

```javascript
// backend/src/routes/apiRoutes.js
router.post("/automation/save-settings", ... (req, res) => {
  const { ..., manual_tasks } = req.body;
  const manualTasksStr = JSON.stringify(manual_tasks || []);
  
  // Update existing record
  db.prepare(`
    UPDATE automation_schedules
    SET ..., manual_tasks = ?
    WHERE api_key = ?
  `).run(..., manualTasksStr, effectiveApiKey);

  // Insert new record
  db.prepare(`
    INSERT INTO automation_schedules (..., manual_tasks)
    VALUES (?, ..., ?)
  `).run(..., manualTasksStr);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/apiRoutes.js
git commit -m "feat: save manual_tasks in /automation/save-settings"
```

---

### Task 4: Backend API Update - Run Manual

**Files:**
- Modify: `backend/src/routes/apiRoutes.js`

- [ ] **Step 1: Update `/automation/run-manual` route**
Extract `manual_tasks` from `req.body` and update the SQL queries.

```javascript
// backend/src/routes/apiRoutes.js
router.post("/automation/run-manual", ... (req, res) => {
  const { ..., manual_tasks } = req.body;
  const manualTasksStr = JSON.stringify(manual_tasks || []);

  db.prepare(`
    UPDATE automation_schedules 
    SET ..., manual_tasks = ? 
    WHERE api_key = ?
  `).run(..., manualTasksStr, api_key);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/apiRoutes.js
git commit -m "feat: save manual_tasks in /automation/run-manual"
```

---

### Task 5: Automation Engine - Helper Logic

**Files:**
- Modify: `backend/src/services/automationEngine.js`

- [ ] **Step 1: Implement `filterAndCleanManualTasks`**
Add a helper function to filter expired tasks and update the DB if necessary.

```javascript
function filterAndCleanManualTasks(scheduleId, manualTasks) {
  if (!Array.isArray(manualTasks)) return [];
  
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD
  
  const filtered = manualTasks.filter(task => {
    const dateStr = task.date || task.dates || "";
    const parts = dateStr.split(" - ");
    const endDateStr = parts[parts.length - 1].trim();
    
    if (!endDateStr) return true; // Keep if no date
    return endDateStr >= todayStr;
  });

  if (filtered.length !== manualTasks.length) {
    db.prepare("UPDATE automation_schedules SET manual_tasks = ? WHERE id = ?")
      .run(JSON.stringify(filtered), scheduleId);
  }
  
  return filtered.map(t => ({
    dates: t.date || t.dates,
    task_description: t.description || t.task_description
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/automationEngine.js
git commit -m "feat: add manual task filtering and cleaning logic"
```

---

### Task 6: Automation Engine - Scheduled & Manual Run Integration

**Files:**
- Modify: `backend/src/services/automationEngine.js`

- [ ] **Step 1: Update `processFetch`**
Fetch `manual_tasks` from DB, filter them, and pass to `fetchDparagonReport`.

```javascript
// In processFetch(schedule)
const manualTasksRaw = JSON.parse(schedule.manual_tasks || "[]");
const activeManualTasks = filterAndCleanManualTasks(schedule.id, manualTasksRaw);

const message = await fetchDparagonReport(
  ...,
  activeManualTasks // New argument
);
```

- [ ] **Step 2: Update Manual Run Logic**
Similarly update the manual run loop (around line 273).

```javascript
// In manual run loop
const manualTasksRaw = JSON.parse(schedule.manual_tasks || "[]");
const activeManualTasks = filterAndCleanManualTasks(schedule.id, manualTasksRaw);

const message = await fetchDparagonReport(
  ...,
  activeManualTasks // New argument
);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/automationEngine.js
git commit -m "feat: integrate manual task merging into automation engine"
```

---

### Task 7: DParagon Service - Scraper Signature Updates

**Files:**
- Modify: `backend/src/services/dparagonService.js`

- [ ] **Step 1: Update `fetchDparagonReport` signature**
Add `manualTasks = []` parameter and pass it to `executeStep1And2` and `runDailyReportViaBrowser`.

```javascript
async function fetchDparagonReport(dpApiUrl, dpEmail, dpPassword, logger = null, manualTasks = []) {
  ...
  const { dpToken, tasksList } = await executeStep1And2(..., manualTasks);
  ...
  return await runDailyReportViaBrowser(..., manualTasks);
}
```

- [ ] **Step 2: Update `executeStep1And2` and `runDailyReportViaBrowser` signatures**
Add `manualTasks` parameter to both.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dparagonService.js
git commit -m "refactor: update DParagon service signatures to accept manualTasks"
```

---

### Task 8: DParagon Service - Merge Logic (Step 2)

**Files:**
- Modify: `backend/src/services/dparagonService.js`

- [ ] **Step 1: Update Step 2 logic in `executeStep1And2`**
Implement the merge and empty-payload bypass.

```javascript
// Search for STEP 2 in executeStep1And2
const payloadData = taskRes.data.payload || [];
if (payloadData.length === 0 && manualTasks.length === 0) {
  throw new Error("Data payload kosong atau tidak ditemukan.");
}

const tasksList = payloadData.map((task) => ({
  dates: `${task.start_date || ""} - ${task.end_date || ""}`,
  task_description: task.task_description || "",
}));

// Merge manual tasks
if (manualTasks.length > 0) {
  tasksList.push(...manualTasks);
}
```

- [ ] **Step 2: Update Browser Fallback logic**
Implement similar logic in `runDailyReportViaBrowser`'s `STEP 2` block.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dparagonService.js
git commit -m "feat: implement task merging and empty payload bypass in Step 2"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Verify database migration**
Check if `manual_tasks` column exists.

- [ ] **Step 2: Test Manual Merge**
1. Add a manual task in frontend.
2. Trigger "Run Manual".
3. Check logs to see if "Step 2" shows "Ditemukan X tasks" (where X = auto + manual).
4. Verify the final report message contains the manual task.

- [ ] **Step 3: Test Empty Payload Bypass**
1. (Stub or simulate) DParagon returning 0 tasks.
2. Add a manual task.
3. Run automation.
4. Verify it succeeds using only the manual task.

- [ ] **Step 4: Test Auto-Clean**
1. Add a manual task with yesterday's date in DB.
2. Run automation.
3. Verify the task is removed from DB.