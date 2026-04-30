# WhatsApp API (wa-api-noorbyte) - v1.2.0

Proyek ini adalah API backend terintegrasi WhatsApp menggunakan `whiskeysockets/baileys` dengan antarmuka frontend (UI) modern yang terpadu dalam satu layanan Node.js.

## Fitur Utama

- **Koneksi WhatsApp Multi-Device**: Pengaturan node session terpusat memanfaatkan Baileys.
- **Unified Architecture**: Backend server (`express`) melayani API sekaligus aset statis Frontend di port yang sama.
- **Environment API Endpoint Toggling**: Mendukung `.env` (*development* & *production*) untuk API DParagon.
- **Check-in Automasi**: Sistem otomasi check-in kehadiran dengan headless scraping `puppeteer`.
- **Cloudflare Bypass & Proxy Support**: Penanganan otomatis Cloudflare Challenge dan dukungan SOCKS5 Proxy.
- **Otomatis Run & Scheduler**: Background engine untuk eksekusi tugas terjadwal (Daily Reports, dsb).

## Struktur Direktori

```
wa-api-noorbyte/
├── backend/                  # Logic Utama & Server
│   ├── server.js             # Entrypoint Tunggal (API + UI)
│   ├── src/                  # Services, Routes, Configs, Middlewares
│   └── package.json          # Dependencies Backend
├── frontend/                 # Aset Frontend
│   └── public/               # HTML, CSS, & Client-side JS
├── .env.example              # Template Environment Variables
├── DEPENDENCIES.md           # Rincian Library & Versi
└── README.md                 # Dokumentasi Utama
```

## Persyaratan (Requirements)

- **Node.js** V18 atau yang lebih baru (Kebutuhan utama Baileys dan better-sqlite3).
- **Puppeteer Requirements**: Pastikan dependensi system untuk Chromium terinstall (terutama di Linux/Docker).
- **SQLite3 Support**: Membutuhkan build tools untuk kompilasi `better-sqlite3` jika tidak tersedia prebuilt binary.

## Panduan Instalasi & Menjalankan

1. **Install Dependensi**:
   Jalankan perintah berikut di folder backend:
   ```bash
   cd backend
   npm install
   ```

2. **Konfigurasi Environment**:
   Salin file template menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Sesuaikan nilai `NODE_ENV` dan kredensial API lainnya.

3. **Menjalankan Server**:
   ```bash
   cd backend
   node server.js
   ```
   Secara default, aplikasi dapat diakses di `http://localhost:4000`.

4. *(Opsional)* **Akses Publik Via Cloudflared**:
   Untuk mengekspos server lokal ke internet:
   ```bash
   npx cloudflared tunnel --url http://localhost:4000
   ```

## 📋 Changelog

Untuk riwayat perubahan versi selengkapnya, silakan lihat file [CHANGELOG.md](CHANGELOG.md).

### v1.2.0 (Latest)
- **Frontend & Dashboard**: Penambahan halaman *automation*, *dashboard*, dan manajemen grup beserta implementasi penuh logika autentikasinya.
- **Design System**: Implementasi *design system generator* dengan *automated reasoning*.
- **Branding**: Pembaruan nama brand menjadi NoorByteAPI di *sidebar*.

## Troubleshooting & Known Warnings

- **[DEP0060] DeprecationWarning**: Berasal dari library internal `http-proxy-middleware`. Aman untuk diabaikan.
- **Folder `browser_session_...`**: Merupakan cache session Puppeteer. Folder ini sudah otomatis di-ignore oleh Git.
- **Database Path**: Pastikan `DB_PATH` di `.env` mengarah ke lokasi yang benar (default: `backend/database.db`).

## Keamanan
Selalu lakukan `npm audit` di folder backend untuk memastikan tidak ada vulnerability pada library yang digunakan. Jangan pernah mengunggah file `.env` atau folder `sessions/` ke repositori publik.
