const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../../database.db"));

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
`);

module.exports = db;
