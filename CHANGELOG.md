# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.
Format versioning mengikuti [Semantic Versioning](https://semver.org/).

---

## [2.0.0] - 2026-05-11

### ⚠️ Breaking Changes
- Menghapus metode *fallback* API key yang tidak aman, sekarang diwajibkan menggunakan header `Authorization` standar untuk semua akses API *backend*.
- Mengubah skema validasi payload pendaftaran tugas manual (*manual task*): mengubah properti `date` menjadi `task_time` dan `description` menjadi `task_name`.

### 🚀 Fitur Baru
- Finalisasi arsitektur modular *backend* untuk memastikan skalabilitas dan *hygiene* repositori Git.
- Penerapan standar penanganan error tersentralisasi menggunakan *custom exception classes* pada *backend*.

### 🔧 Perubahan
- Refaktor LCR Engine dengan menerapkan pola *defensive programming* untuk mengeliminasi potensi *crash* akibat output *headless browser* (Puppeteer) yang tidak stabil.
- Refaktor logika pengolahan *Manual Daily Reports* dan penjadwalan *Automation* agar berjalan lebih andal.
- Penyederhanaan strategi *login* DParagon dengan menghapus upaya *login* ganda yang redundan di *service*.
- Tampilan *Execution Log* pada halaman Daily Report sekarang dirender secara inkremental (jeda 1 detik) untuk kenyamanan pengalaman pengguna (*visual-only delay*).

### 🐛 Perbaikan Bug
- Memperbaiki error `fetchDparagonReport is not a function` yang menyebabkan *crash* pada *Automation Engine*.
- Memperbaiki bug duplikasi pengiriman pesan WhatsApp pada eksekusi *manual task* di `automationEngine.js` dan `dparagonService.js`.
- Memperbaiki bug *z-index* pada widget kalender di dalam modal *Manual Task List* yang sebelumnya tertutup oleh *overlay*.
- Memperbaiki *syntax error* kritis pada `checkin.js` yang merusak eksekusi fungsi alert UI (`showSystemAlert`).
- Memperbaiki error `MODULE_NOT_FOUND` pada dependensi `follow-redirects` yang menghalangi proses *startup* server.

### 🔒 Keamanan
- Pengetatan logika *authentication*, memisahkan dengan tegas proses autentikasi dari data *request body*.
- Penerapan sanitasi input yang ketat (*strict input sanitization*) untuk mencegah serangan *command injection* pada *controller backend*.
- Penghapusan skrip *rewrite* otomatis (*automated rewrite scripts*) yang tidak aman.

### 📦 Dependencies
- Menyelesaikan masalah dependensi modul *node* paska proses *merge branch* utama.

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
- Pemindahan logika *scraping* (`scraper.js`) ke backend services untuk konsistensi.
- Pembersihan dead code, file sementara, dan script server UI legacy.
- Perbaikan penanganan token Bearer dan auto-retry pada Cloudflare Challenge.

### 🗑️ Dihapus
- Penghapusan redundansi `package.json` dan folder `node_modules` di level frontend.

### 🔒 Keamanan
- Pembaruan `.gitignore` untuk proteksi menyeluruh terhadap file sesi dan kredensial.
