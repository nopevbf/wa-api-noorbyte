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
    manual_tasks TEXT,
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
const migrations = [
  { table: 'users', column: 'role', sql: "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'" },
  { table: 'automation_schedules', column: 'start_date', sql: "ALTER TABLE automation_schedules ADD COLUMN start_date TEXT" },
  { table: 'automation_schedules', column: 'end_date', sql: "ALTER TABLE automation_schedules ADD COLUMN end_date TEXT" },
  { table: 'automation_schedules', column: 'custom_days', sql: "ALTER TABLE automation_schedules ADD COLUMN custom_days TEXT" },
  { table: 'automation_schedules', column: 'excluded_dates', sql: "ALTER TABLE automation_schedules ADD COLUMN excluded_dates TEXT" },
  { table: 'automation_schedules', column: 'manual_tasks', sql: "ALTER TABLE automation_schedules ADD COLUMN manual_tasks TEXT" },
];

migrations.forEach(({ table, column, sql }) => {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
    const columnExists = tableInfo.some(info => info.name === column);
    
    if (!columnExists) {
      db.exec(sql);
      console.log(`[DATABASE] Kolom '${column}' berhasil ditambahkan ke tabel '${table}'.`);
    }
  } catch (error) {
    console.error(`[DATABASE] Gagal memeriksa atau menambah kolom ${column}:`, error.message);
  }
});

module.exports = db;
