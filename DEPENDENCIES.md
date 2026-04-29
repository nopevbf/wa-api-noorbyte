# Dependencies Project wa-api-noorbyte - v1.0.0

Dokumen ini merangkum library yang dibutuhkan untuk menjalankan project.

## Cara Install

Jalankan perintah berikut dari folder backend:

```bash
cd backend
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
| `dotenv`                  | `^17.4.0`     | Membaca variabel environment dari file `.env`             |
| `express`                 | `^4.22.1`     | Framework HTTP server dan routing API                     |
| `pino`                    | `^10.3.1`     | Logger untuk Baileys dan proses backend                   |
| `puppeteer`               | `^24.40.0`    | Headless browser untuk automasi dan scraping web          |
| `puppeteer-extra`         | `^3.3.6`      | Core library untuk puppeteer extra                        |
| `puppeteer-extra-plugin-stealth` | `^2.11.2` | Plugin stealth untuk bypass deteksi bot                  |
| `qrcode`                  | `^1.5.4`      | Generate QR code (data URL / image)                       |
| `qrcode-terminal`         | `^0.12.0`     | Tampilkan QR code langsung di terminal                    |
| `socket.io`               | `^4.8.3`      | Komunikasi real-time antara backend dan UI                |

## Catatan Keamanan

Hasil `npm install` saat ini:
- Backend: tidak ada vulnerability.

## Rekomendasi Versi Node.js

Gunakan Node.js `v18+` agar kompatibel dengan Baileys dan better-sqlite3.
