# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.
Format versioning mengikuti [Semantic Versioning](https://semver.org/).

---

## [1.2.0] - 2026-04-30

### 🚀 Fitur Baru
- Implementasi *design system generator* dengan *automated reasoning* dan kemampuan pencarian multi-domain.
- Menambahkan halaman *automation*, *dashboard*, dan manajemen grup ke antarmuka frontend.
- Mengimplementasikan skrip *dashboard* untuk mengambil dan menampilkan status perangkat dan statistik pesan.
- Implementasi penuh logika autentikasi frontend dan integrasi API backend.

### 🔧 Perubahan
- Mengubah nama brand menjadi NoorByteAPI di *sidebar*.

---

## [1.1.0] - 2026-04-29

### 🔧 Perubahan
- Pembaruan sistem version ke `1.1.0` menggunakan standar Semantic Versioning.
- Menambahkan deskripsi aplikasi yang diekspos melalui endpoint `/api/app-config` dan dirender pada Sidebar UI.

---

## [1.0.0] - 2026-04-29

### 🚀 Fitur Baru
- Penggabungan server backend dan frontend ke dalam satu proses Node.js.

### 🔧 Perubahan
- Pemindahan logika *scraping* (`scapper.js`) ke backend services untuk konsistensi.
- Pembersihan dead code, file sementara, dan script server UI legacy.
- Perbaikan penanganan token Bearer dan auto-retry pada Cloudflare Challenge.

### 🗑️ Dihapus
- Penghapusan redundansi `package.json` dan folder `node_modules` di level frontend.

### 🔒 Keamanan
- Pembaruan `.gitignore` untuk proteksi menyeluruh terhadap file sesi dan kredensial.
