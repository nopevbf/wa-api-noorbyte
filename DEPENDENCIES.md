# 📦 Dokumentasi Library / Dependencies

> Daftar lengkap library yang dibutuhkan oleh projek **wa-api-noorbyte** beserta penjelasan fungsinya.

## Cara Install

```bash
npm install
```

Perintah di atas akan otomatis meng-install semua library yang tercantum di `package.json`.

---

## Dependencies

### 1. `@whiskeysockets/baileys` — ^7.0.0-rc.9

**Fungsi:** Library utama untuk menghubungkan aplikasi ke WhatsApp tanpa menggunakan API resmi (unofficial). Baileys memungkinkan aplikasi untuk:

- Membuat koneksi WhatsApp via QR Code
- Mengirim dan menerima pesan
- Mengelola sesi multi-device
- Menangani event koneksi (open, close, reconnect)

**Digunakan di:** [`src/services/waEngine.js`](src/services/waEngine.js)

```javascript
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
```

---

### 2. `express` — ^4.22.1

**Fungsi:** Framework web untuk Node.js. Digunakan sebagai fondasi utama server API, termasuk:

- Membuat HTTP server
- Routing endpoint API (`/send-message`, `/add-device`, `/get-devices`, dll.)
- Middleware (CORS, JSON parser, static file)

**Digunakan di:** [`server.js`](server.js), [`src/routes/apiRoutes.js`](src/routes/apiRoutes.js)

```javascript
const express = require("express");
const app = express();
app.use(express.json());
app.use(express.static("public"));
```

---

### 3. `cors` — ^2.8.6

**Fungsi:** Middleware Express untuk mengaktifkan **Cross-Origin Resource Sharing (CORS)**. Memungkinkan frontend atau aplikasi lain dari domain berbeda untuk mengakses API ini.

**Digunakan di:** [`server.js`](server.js)

```javascript
const cors = require("cors");
app.use(cors());
```

---

### 4. `better-sqlite3` — ^12.8.0

**Fungsi:** Library database SQLite yang cepat dan synchronous untuk Node.js. Digunakan untuk:

- Menyimpan data device/user (username, phone, api_key, status)
- Menyimpan log pesan yang dikirim (message_logs)
- Validasi API Key pada middleware auth

**Digunakan di:** [`src/config/database.js`](src/config/database.js), [`src/middlewares/auth.js`](src/middlewares/auth.js), [`src/routes/apiRoutes.js`](src/routes/apiRoutes.js), [`src/services/waEngine.js`](src/services/waEngine.js)

```javascript
const Database = require("better-sqlite3");
const db = new Database("database.db");
db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey);
```

---

### 5. `axios` — ^1.13.6

**Fungsi:** HTTP client untuk melakukan request ke URL eksternal. Digunakan untuk mengirim data **webhook** ketika ada pesan masuk di WhatsApp.

**Digunakan di:** [`src/services/waEngine.js`](src/services/waEngine.js)

```javascript
const axios = require("axios");
await axios.post(user.webhook_url, {
  api_key: apiKey,
  sender,
  message: text,
});
```

---

### 6. `pino` — ^10.3.1

**Fungsi:** Library logging super cepat untuk Node.js. Digunakan oleh Baileys sebagai logger internal. Pada projek ini, di-set ke level `silent` agar tidak menampilkan log verbose dari Baileys.

**Digunakan di:** [`src/services/waEngine.js`](src/services/waEngine.js)

```javascript
const pino = require("pino");
const sock = makeWASocket({
  logger: pino({ level: "silent" }),
});
```

---

### 7. `qrcode-terminal` — ^0.12.0

**Fungsi:** Menampilkan QR Code langsung di terminal/console. Berguna saat proses scan WhatsApp di environment server (tanpa GUI).

**Digunakan di:** [`src/services/waEngine.js`](src/services/waEngine.js)

```javascript
const qrcode = require("qrcode-terminal");
qrcode.generate(qr, { small: true });
```

---

### 8. `qrcode` — ^1.5.4

**Fungsi:** Library untuk generate QR Code dalam berbagai format (PNG, Data URL, SVG, dll). Dapat digunakan untuk menampilkan QR Code di halaman web (frontend).

**Digunakan di:** Tersedia untuk keperluan frontend / generate QR ke format gambar.

---

## Built-in Node.js Modules (Tidak Perlu Install)

Selain library di atas, projek ini juga menggunakan modul bawaan Node.js:

| Module   | Fungsi                                  | Digunakan di                |
| -------- | --------------------------------------- | --------------------------- |
| `path`   | Mengelola path file & direktori         | `server.js`, `waEngine.js`, `database.js` |
| `fs`     | Operasi file system (hapus folder sesi) | `waEngine.js`               |
| `crypto` | Generate random token untuk API Key     | `apiRoutes.js`              |

---

## Ringkasan Versi

| Library                    | Versi         |
| -------------------------- | ------------- |
| `@whiskeysockets/baileys`  | ^7.0.0-rc.9   |
| `express`                  | ^4.22.1       |
| `cors`                     | ^2.8.6        |
| `better-sqlite3`           | ^12.8.0       |
| `axios`                    | ^1.13.6       |
| `pino`                     | ^10.3.1       |
| `qrcode-terminal`          | ^0.12.0       |
| `qrcode`                   | ^1.5.4        |

---

> 📌 **Node.js Version:** Disarankan menggunakan Node.js **v18+** karena `better-sqlite3` dan Baileys memerlukan versi modern.
