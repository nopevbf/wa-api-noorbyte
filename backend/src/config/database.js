const Database = require("better-sqlite3");
const path = require("path");

// Deteksi jika berjalan di Fly.io (menggunakan ENV), jika tidak, gunakan db lokal.
const dbPath = process.env.DB_PATH || path.join(__dirname, "../../database.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    phone TEXT,
    api_key TEXT UNIQUE,
    webhook_url TEXT,
    status TEXT DEFAULT 'Disconnected',
    role TEXT DEFAULT 'user'
  );

  CREATE TABLE IF NOT EXISTS message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    target_number TEXT,
    message TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS automation_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    dp_api_url TEXT,
    dp_email TEXT,
    dp_password TEXT,
    target_number TEXT,
    fetch_time TEXT,
    send_wa_time TEXT,
    frequency TEXT DEFAULT 'daily',
    is_active INTEGER DEFAULT 0,
    cached_message TEXT,
    last_fetched_date TEXT,
    last_sent_date TEXT,
    manual_run_time TEXT,
    manual_run_status TEXT DEFAULT 'idle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    token TEXT UNIQUE,
    expires_at INTEGER,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrasi Database: Tambahkan kolom baru jika belum ada
const migrationColumns = [
  "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
  "ALTER TABLE automation_schedules ADD COLUMN start_date TEXT",
  "ALTER TABLE automation_schedules ADD COLUMN end_date TEXT",
  "ALTER TABLE automation_schedules ADD COLUMN custom_days TEXT",
  "ALTER TABLE automation_schedules ADD COLUMN excluded_dates TEXT",
];
migrationColumns.forEach((sql) => {
  try {
    db.exec(sql);
    const colName = sql.match(/ADD COLUMN ([a-zA-Z_][a-zA-Z0-9_]*)/)?.[1];
    if (colName) console.log(`[DATABASE] Kolom '${colName}' berhasil ditambahkan.`);
  } catch (error) {
    if (!error.message.includes("duplicate column name")) {
      console.error("[DATABASE] Gagal migrasi kolom:", error.message);
    }
  }
});

module.exports = db;
