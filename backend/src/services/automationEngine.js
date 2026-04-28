const db = require("../config/database");
const { fetchDparagonReport } = require("./dparagonService");
const { sendMessageViaWa } = require("./waEngine");

// Create automation_logs table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS automation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    time TEXT,
    color_class TEXT,
    label TEXT,
    text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// In-memory log cache per schedule
const scheduleLogs = {};

function addScheduleLog(scheduleId, colorClass, label, text) {
  if (!scheduleLogs[scheduleId]) scheduleLogs[scheduleId] = [];
  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
  const logEntry = { time, colorClass, label, text };

  scheduleLogs[scheduleId].push(logEntry);

  // Keep only last 50 entries in memory
  if (scheduleLogs[scheduleId].length > 50) {
    scheduleLogs[scheduleId] = scheduleLogs[scheduleId].slice(-50);
  }

  // Persist to database
  try {
    db.prepare(
      "INSERT INTO automation_logs (schedule_id, time, color_class, label, text) VALUES (?, ?, ?, ?, ?)",
    ).run(scheduleId, time, colorClass, label, text);

    // Trim DB to latest 50 per schedule
    db.prepare(
      `
      DELETE FROM automation_logs WHERE schedule_id = ? AND id NOT IN (
        SELECT id FROM automation_logs WHERE schedule_id = ? ORDER BY id DESC LIMIT 50
      )
    `,
    ).run(scheduleId, scheduleId);
  } catch (e) {
    // Ignore DB errors for logging
  }

  console.log(`[AUTOMATION #${scheduleId}] [${time}] ${label}: ${text}`);
}

function getScheduleLogs(scheduleId) {
  // Return in-memory cache if available
  if (scheduleLogs[scheduleId] && scheduleLogs[scheduleId].length > 0) {
    return scheduleLogs[scheduleId];
  }

  // Otherwise load from database (e.g. after server restart)
  try {
    const rows = db
      .prepare(
        "SELECT time, color_class, label, text FROM automation_logs WHERE schedule_id = ? ORDER BY id ASC LIMIT 50",
      )
      .all(scheduleId);

    if (rows.length > 0) {
      scheduleLogs[scheduleId] = rows.map((r) => ({
        time: r.time,
        colorClass: r.color_class,
        label: r.label,
        text: r.text,
      }));
      return scheduleLogs[scheduleId];
    }
  } catch (e) {
    // Ignore
  }

  return [];
}

function clearScheduleLogs(scheduleId) {
  scheduleLogs[scheduleId] = [];
  try {
    db.prepare("DELETE FROM automation_logs WHERE schedule_id = ?").run(
      scheduleId,
    );
  } catch (e) {
    // Ignore
  }
}

/**
 * Get today's date string in Asia/Jakarta timezone (YYYY-MM-DD)
 */
function getTodayDateWIB() {
  const now = new Date();
  // Convert to WIB
  const wib = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
  const y = wib.getFullYear();
  const m = String(wib.getMonth() + 1).padStart(2, "0");
  const d = String(wib.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get current time in HH:MM format in Asia/Jakarta timezone
 */
function getCurrentTimeWIB() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Process a single schedule's FETCH step
 */
async function processFetch(schedule) {
  const today = getTodayDateWIB();
  if (schedule.last_fetched_date === today) return; // Already fetched today

  addScheduleLog(
    schedule.id,
    "text-blue-400",
    "FETCH",
    "Memulai proses tarik data DParagon...",
  );

  try {
    const message = await fetchDparagonReport(
      schedule.dp_api_url,
      schedule.dp_email,
      schedule.dp_password,
    );

    const dataSizeMB = (
      Buffer.byteLength(message || "", "utf8") /
      (1024 * 1024)
    ).toFixed(3);

    // Save cached message and mark today as fetched
    db.prepare(
      "UPDATE automation_schedules SET cached_message = ?, last_fetched_date = ? WHERE id = ?",
    ).run(message, today, schedule.id);

    addScheduleLog(
      schedule.id,
      "text-emerald-400",
      "SUCCESS",
      `Data DParagon berhasil ditarik dan di-cache. (Size: ${dataSizeMB} MB)`,
    );
  } catch (err) {
    addScheduleLog(
      schedule.id,
      "text-red-500",
      "ERROR",
      `Gagal fetch: ${err.message}`,
    );
  }
}

/**
 * Process a single schedule's SEND step
 */
async function processSend(schedule) {
  const today = getTodayDateWIB();
  if (schedule.last_sent_date === today) return; // Already sent today

  // Reload schedule to get latest cached message
  const freshSchedule = db
    .prepare("SELECT * FROM automation_schedules WHERE id = ?")
    .get(schedule.id);
  const message = freshSchedule?.cached_message;

  if (!message) {
    addScheduleLog(
      schedule.id,
      "text-amber-400",
      "SKIP",
      "Tidak ada cached message. Fetch data terlebih dahulu.",
    );
    return;
  }

  addScheduleLog(
    schedule.id,
    "text-amber-400",
    "SEND",
    `Mengirim pesan ke WhatsApp (${schedule.target_number})...`,
  );

  try {
    const sendStartTime = Date.now();
    await sendMessageViaWa(
      schedule.api_key,
      schedule.target_number,
      message,
      "text",
    );
    const latencySec = ((Date.now() - sendStartTime) / 1000).toFixed(1);

    db.prepare(
      "UPDATE automation_schedules SET last_sent_date = ? WHERE id = ?",
    ).run(today, schedule.id);

    addScheduleLog(
      schedule.id,
      "text-emerald-400",
      "SUCCESS",
      `Pesan WhatsApp berhasil terkirim! (Latency: ${latencySec}s)`,
    );

    const summary = `[DAILY REPORT] Laporan berhasil terkirim ke ${schedule.target_number}`;
    db.prepare(
      "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)",
    ).run(schedule.api_key, schedule.target_number, summary, "SUCCESS");
  } catch (err) {
    addScheduleLog(
      schedule.id,
      "text-red-500",
      "ERROR",
      `Gagal kirim WA: ${err.message}`,
    );

    const summary = `[DAILY REPORT] Gagal mengirim laporan ke ${schedule.target_number}`;
    db.prepare(
      "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)",
    ).run(schedule.api_key, schedule.target_number, summary, "FAILED");
  }
}

/**
 * Process Otomatis run requests
 */
async function processManualRuns() {
  const manualSchedules = db
    .prepare(
      "SELECT * FROM automation_schedules WHERE manual_run_status = 'waiting'",
    )
    .all();

  for (const schedule of manualSchedules) {
    const currentTime = getCurrentTimeWIB();

    if (currentTime >= schedule.manual_run_time) {
      // Time has arrived, execute now
      db.prepare(
        "UPDATE automation_schedules SET manual_run_status = 'running' WHERE id = ?",
      ).run(schedule.id);

      addScheduleLog(
        schedule.id,
        "text-purple-400",
        "Otomatis RUN",
        `Waktu eksekusi tiba (${schedule.manual_run_time}). Memulai...`,
      );

      try {
        // Step 1-5: Fetch data
        addScheduleLog(
          schedule.id,
          "text-blue-400",
          "STEP 1-5",
          "Menjalankan fetch data DParagon...",
        );
        const message = await fetchDparagonReport(
          schedule.dp_api_url,
          schedule.dp_email,
          schedule.dp_password,
        );

        const dataSizeMB = (
          Buffer.byteLength(message || "", "utf8") /
          (1024 * 1024)
        ).toFixed(3);

        // Cache message
        const today = getTodayDateWIB();
        db.prepare(
          "UPDATE automation_schedules SET cached_message = ?, last_fetched_date = ? WHERE id = ?",
        ).run(message, today, schedule.id);
        addScheduleLog(
          schedule.id,
          "text-emerald-400",
          "SUCCESS",
          `Data berhasil ditarik. (Size: ${dataSizeMB} MB)`,
        );

        // Langsung kirim WA setelah data berhasil ditarik (Step 6)
        addScheduleLog(
          schedule.id,
          "text-amber-400",
          "STEP 6",
          `Mengirim ke WhatsApp (${schedule.target_number})...`,
        );
        const sendStartTime = Date.now();
        await sendMessageViaWa(
          schedule.api_key,
          schedule.target_number,
          message,
          "text",
        );
        const latencySec = ((Date.now() - sendStartTime) / 1000).toFixed(1);

        addScheduleLog(
          schedule.id,
          "text-emerald-400",
          "SUCCESS",
          `Otomatis run selesai! Pesan terkirim. (Latency: ${latencySec}s)`,
        );
        db.prepare(
          "UPDATE automation_schedules SET manual_run_status = 'done', last_sent_date = ? WHERE id = ?",
        ).run(today, schedule.id);
      } catch (err) {
        // NAH, DI SINI TEMPATNYA!
        console.error("Otomatis run gagal:", err.message);

        if (err.response) {
          console.error("Detail Error 500:", err.response.data);
        }
        addScheduleLog(
          schedule.id,
          "text-red-500",
          "ERROR",
          `Otomatis run gagal: ${err.message}`,
        );
        db.prepare(
          "UPDATE automation_schedules SET manual_run_status = 'error' WHERE id = ?",
        ).run(schedule.id);
      }
    }
  }
}

/**
 * Main engine tick — called every 30 seconds
 */
async function engineTick() {
  const currentTime = getCurrentTimeWIB();
  const today = getTodayDateWIB();
  const dayOfWeek = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  ).getDay();

  // 1. Process SCHEDULED automations
  const activeSchedules = db
    .prepare("SELECT * FROM automation_schedules WHERE is_active = 1")
    .all();

  for (const schedule of activeSchedules) {
    // Skip weekends if frequency = weekdays
    if (
      schedule.frequency === "weekdays" &&
      (dayOfWeek === 0 || dayOfWeek === 6)
    ) {
      continue;
    }

    // Check fetch time
    if (
      currentTime === schedule.fetch_time &&
      schedule.last_fetched_date !== today
    ) {
      await processFetch(schedule);
    }

    // Check send time
    if (
      currentTime === schedule.send_wa_time &&
      schedule.last_sent_date !== today
    ) {
      await processSend(schedule);
    }
  }

  // 2. Process Otomatis runs
  await processManualRuns();
}

let engineInterval = null;

/**
 * Start the automation engine
 */
function startAutomationEngine() {
  if (engineInterval) return;
  console.log("🤖 [AUTOMATION ENGINE] Started — checking every 5 seconds.");
  engineInterval = setInterval(engineTick, 5000);
  // Run immediately once
  engineTick().catch((err) =>
    console.error("[AUTOMATION ENGINE] Tick error:", err.message),
  );
}

/**
 * Stop the automation engine
 */
function stopAutomationEngine() {
  if (engineInterval) {
    clearInterval(engineInterval);
    engineInterval = null;
    console.log("🤖 [AUTOMATION ENGINE] Stopped.");
  }
}

module.exports = {
  startAutomationEngine,
  stopAutomationEngine,
  getScheduleLogs,
  clearScheduleLogs,
};
