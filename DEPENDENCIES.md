# Dependencies Project wa-api-noorbyte

Dokumen ini merangkum library yang dibutuhkan untuk menjalankan project pada sisi backend dan frontend.

## Cara Install

Jalankan perintah berikut dari root project:

```bash
cd backend
npm install
cd ../frontend
npm install
```

## Backend Dependencies

Lokasi: `backend/package.json`

| Library                   | Versi         | Kegunaan                                                  |
| ------------------------- | ------------- | --------------------------------------------------------- |
| `@whiskeysockets/baileys` | `^7.0.0-rc.9` | Koneksi WhatsApp multi-device, event pesan, dan sesi auth |
| `axios`                   | `^1.13.6`     | HTTP client untuk webhook dan request eksternal           |
| `better-sqlite3`          | `^12.8.0`     | Penyimpanan data user/device/log dengan SQLite            |
| `cors`                    | `^2.8.6`      | Mengizinkan akses lintas origin ke API backend            |
| `express`                 | `^4.22.1`     | Framework HTTP server dan routing API                     |
| `pino`                    | `^10.3.1`     | Logger untuk Baileys dan proses backend                   |
| `qrcode`                  | `^1.5.4`      | Generate QR code (data URL / image)                       |
| `qrcode-terminal`         | `^0.12.0`     | Tampilkan QR code langsung di terminal                    |
| `socket.io`               | `^4.8.3`      | Komunikasi real-time antara backend dan UI                |

## Frontend Dependencies

Lokasi: `frontend/package.json`

| Library                 | Versi     | Kegunaan                               |
| ----------------------- | --------- | -------------------------------------- |
| `axios`                 | `^1.13.6` | Request HTTP dari UI ke backend API    |
| `cors`                  | `^2.8.6`  | Dukungan CORS untuk server UI          |
| `express`               | `^4.22.1` | Menjalankan server UI statis           |
| `http-proxy-middleware` | `^3.0.5`  | Proxy request dari frontend ke backend |

## Catatan Keamanan

Hasil `npm install` saat ini:

- Backend: tidak ada vulnerability.
- Frontend: terdeteksi 1 high severity vulnerability.

Untuk mencoba perbaikan otomatis, jalankan:

```bash
cd frontend && npm audit fix
```

## Rekomendasi Versi Node.js

Gunakan Node.js `v18+` agar kompatibel dengan Baileys dan better-sqlite3.
