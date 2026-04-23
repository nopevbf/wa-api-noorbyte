# WhatsApp API (wa-api-noorbyte)

Proyek ini adalah API backend terintegrasi WhatsApp menggunakan `whiskeysockets/baileys` dengan antarmuka frontend (UI) modern untuk manajemen bot, interaksi pengguna, dan sistem check-in.

## Fitur Utama

- **Koneksi WhatsApp Multi-Device**: Pengaturan node session terpusat memanfaatkan Baileys.
- **Environment API Endpoint Toggling**: Mendukung `.env` (*development* & *production*) untuk API DParagon (contoh: `api.dparagon6.persona-it.com/v2` untuk *dev*).
- **Check-in Automasi**: Menyediakan antarmuka otomasi check-in kehadiran di `checkin.html`. Modul `checkin.js` dan headless scraping dengan `puppeteer` mengambil data serta memperbarui status berdasarkan Bearer / Access token.
- **Cloudflare Bypass & Proxy Support**: Penanganan pintar untuk *anti-bot* Cloudflare (CF Challenge) secara otomatis menggunakan fallback headless browser, serta didukung konfigurasi *SOCKS5 Proxy* via variabel `PROXY_URL`.
- **Master Override & Force Sync**: Mendukung pemaksaan giliran eksekusi sinkronisasi dan environment override untuk user spesifik pada antrean worker absen.
- **Jailbreak (Keamanan Tambahan)**: Penanganan otorisasi tingkat lanjut yang dikonfigurasikan di `jailbreak.html` dengan pemberitahuan formal mengenai keamanan dan akses (Level Clearance).
- **Terowongan Publik**: Disiapkan untuk diekspos keluar melalui Cloudflared. Eksekusi `npx cloudflared tunnel --url http://localhost:4000` membantu dalam menguji hook dari luar.

## Struktur Direktori

```
wa-api-noorbyte/
├── backend/                  # Logic utama koneksi koneksi Baileys & Endpoint API
│   ├── server.js             # Entrypoint server backend
│   └── package.json          # Dependencies backend
├── frontend/                 # UI Frontend Management
│   ├── server-ui.js          # Serve HTTP frontend assets
│   ├── package.json          # Dependencies frontend
│   └── public/               # Asset statis, HTML Checkin, Jailbreak, & CSS/JS
├── .env.example              # Template Environment Variables API
├── DEPENDENCIES.md           # Rute dan keterangan module project
└── README.md                 # Dokumentasi utama (file ini)
```

## Persyaratan (Requirements)

- **Node.js** V18 atau yang lebih baru (Kebutuhan utama Baileys dan better-sqlite3).
- **Puppeteer Requirements** pastikan Chromium diunduh dengan mulus.
- **Yarn/Npm** untuk manajemen *packages*.

## Panduan Instalasi & Menjalankan

1. **Install dependensi di root dan masing-masing sub-folder**:
   Panduan lengkap dependensi ada di `DEPENDENCIES.md`.

   ```bash
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

2. **Konfigurasi Environment `(\.env)`**:
   Salin file template yang ada menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Pilih `NODE_ENV` apakah ingin mode `development` atau `production`.

3. **Menjalankan Server**:
   Jalankan kedua servis di terminal/proses yang terpisah.

   Terminal 1 (Backend - WhatsApp Core):
   ```bash
   cd backend
   node server.js
   ```

   Terminal 2 (Frontend - Web UI Port 4000):
   ```bash
   cd frontend
   node server-ui.js
   ```

4. *(Opsional)* **Akses Cepat Via Cloudflared**:
   Jika ingin membuka web dan webhook dengan koneksi publik:
   ```bash
   cd frontend
   npx cloudflared tunnel --url http://localhost:4000
   ```

## Catatan Perubahan Terbaru
- Penambahan mekanisme **Cloudflare Anti-Bot Bypass** menggunakan Puppeteer mode browser-fallback secara otomatis saat direct request terkena blokir (HTTP 403 "Just a moment...").
- Integrasi koneksi *SOCKS5 Proxy* pada request internal maupun scraping session.
- Penambahan fitur antrean prioritas *Force Sync* dan deteksi *Master Override*.
- Pembenahan token *Bearer Auth* untuk request Absen.
- Menambahkan penanganan struktur JSON untuk response non-200.
- Migrasi *module import wrapper* pada scraping module (`scrapper.js`).
- Pembedaan Endpoints dan Host Environment Dev/Prod.

## Troubleshooting & Known Warnings

- **[DEP0060] DeprecationWarning: The `util._extend` API is deprecated**:  
  Peringatan ini berasal dari library bawaan frontend (seperti `http-proxy-middleware` pada `server-ui.js`). Warning ini tidak akan menyebabkan error sistem. Jika mengganggu, solusi manualnya adalah melakukan update dependency di frontend: `npm install http-proxy-middleware@latest`.
- **Banyak folder `browser_session_...` bermunculan di source code**:  
  Saat proses scraping D'Paragon berjalan, koneksi Puppeteer menghasilkan cache session sesuai dengan `NODE_ENV` aktif (misal `browser_session_development`). Abaikan pembuatannya karena sudah tidak diekspor ke git (`.gitignore`). Boleh menghapus sisa folder lain yang sudah tak terpakai untuk merapikan workspace.
- **Terdapat lebih dari satu `database.db`**:  
  Aplikasi ini berjalan dengan menautkan data ke `backend/database.db`. Jika mendapati file serupa ukuran kosong (0 KB) di luar folder backend, silakan dihapus karena itu hanyalah file sisa yang tidak terpakai.

## Keamanan
Perhatikan `DEPENDENCIES.md` mengenai petunjuk audit (`npm audit fix`) untuk vulnerability yang timbul, terutama di sisi frontend.
