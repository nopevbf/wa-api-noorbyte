# Design Spec: Daily Report Dashboard Summary

This specification outlines the integration of Daily Report automation events into the main dashboard's Activity Feed.

## 1. Objective
Enable users and admins to track the success or failure of Daily Report automation runs directly from the main Dashboard, similar to how manual test messages are tracked.

## 2. Requirements
- Log a summary message to `message_logs` table upon completion of an automation run.
- Use a short, descriptive summary instead of the full report body.
- Ensure summaries are associated with the correct `api_key` for proper access control (Admin vs. User view).
- Differentiate automation logs with a `[DAILY REPORT]` prefix.

## 3. Architecture & Data Flow

### 3.1. Database Integration
The existing `message_logs` table will be used. No schema changes are required.

- **Table**: `message_logs`
- **Columns to populate**:
    - `api_key`: The API Key of the device that sent the report.
    - `target_number`: The recipient's WhatsApp number.
    - `message`: Short summary text.
    - `status`: `SUCCESS` or `FAILED`.

### 3.2. Logic Implementation
The logic will be added to `backend/src/services/automationEngine.js` in two main locations:

1.  **`processSend(schedule)`**: For scheduled daily runs.
2.  **`processManualRuns()`**: For "Run Automation Now" requests.

#### Success Log Logic:
```javascript
const summary = `[DAILY REPORT] Laporan berhasil terkirim ke ${schedule.target_number}`;
db.prepare(
  "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)"
).run(schedule.api_key, schedule.target_number, summary, "SUCCESS");
```

#### Failure Log Logic:
```javascript
const summary = `[DAILY REPORT] Gagal mengirim laporan ke ${schedule.target_number}`;
db.prepare(
  "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)"
).run(schedule.api_key, schedule.target_number, summary, "FAILED");
```

## 4. User Interface Impact
- **Main Dashboard**: The "Activity Feed" will now show entries like:
    - ✅ `[DAILY REPORT] Laporan berhasil terkirim ke 628123456789`
- **Access Control**: Users will only see their own reports. Admins will see all reports.

## 5. Testing Strategy
1.  **Manual Trigger**: Trigger an automation run via the "Run Automation Now" button in the UI.
2.  **Verification**: 
    - Check the "Activity Feed" on the main Dashboard.
    - Verify that the log entry exists and contains the correct prefix and status.
    - Verify that the entry is visible only to the owning user (and all entries visible to Admin).
