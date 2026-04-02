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
    status TEXT DEFAULT 'Disconnected'
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
`);

module.exports = db;
