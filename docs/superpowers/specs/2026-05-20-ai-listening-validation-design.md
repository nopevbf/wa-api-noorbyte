# Spec: AI Listening Mode Default OFF & Save Validation

Status: Draft
Author: Gemini CLI
Date: 2026-05-20

## 1. Tujuan
Memastikan fitur AI Listening Mode pada setiap perangkat terhubung dalam keadaan nonaktif (OFF) secara default dan memerlukan konfirmasi penyimpanan eksplisit melalui tombol "Save Settings" sebelum sistem mulai mendengarkan pesan.

## 2. Analisis Sistem Saat Ini
- **Database**: Tabel `users` memiliki kolom `ai_enabled` (INTEGER) yang saat ini sudah memiliki default `0`.
- **Backend**: Endpoint `POST /api/ai/save-settings` menangani penyimpanan konfigurasi AI.
- **Frontend**: File `auto-reply.html` memiliki toggle yang saat ini langsung memicu notifikasi visual ketika diubah, meskipun perubahan tersebut belum disimpan ke database.

## 3. Desain Perubahan

### A. Database (Migration/Default)
- Memastikan kolom `ai_enabled` di tabel `users` konsisten menggunakan `DEFAULT 0`.
- *Catatan*: Migrasi yang ada di `database.js` sudah mengatur `DEFAULT 0`, namun perlu dipastikan tidak ada query `INSERT` yang secara tidak sengaja mengisi nilai `1`.

### B. Backend (API Routes)
- Tidak ada perubahan besar pada logic `POST /ai/save-settings`, namun pastikan validasi input dilakukan dengan benar.
- Verifikasi bahwa `ai_enabled` hanya berubah jika ada request eksplisit ke endpoint ini.

### C. Frontend (UI/UX)
1. **Initial State**: Saat halaman `auto-reply.html` dimuat atau perangkat dipilih, `ai_enabled` harus mencerminkan data aktual dari server (defaultnya OFF).
2. **Pending State Indicator**:
   - Menambahkan elemen UI (alert/banner) yang muncul jika status toggle `ai_listening_toggle` berbeda dengan status terakhir yang disimpan.
   - Pesan: "Perubahan belum disimpan. AI tidak akan aktif sampai Anda mengklik 'Save Settings'."
3. **Toggle Behavior**:
   - Menghapus notifikasi `notify(...)` instan saat toggle diubah.
   - Notifikasi hanya muncul setelah tombol "Save Settings" diklik dan merespon sukses.
4. **Validation Logic**:
   - Menambahkan variabel `originalAiState` untuk melacak status asli dari server.
   - Membandingkan status toggle saat ini dengan `originalAiState` untuk menampilkan/menyembunyikan peringatan "Pending Save".

## 4. Rencana Pengujian
- **Unit Test**: Menambahkan test case untuk memastikan `ai_enabled` adalah `0` untuk user baru.
- **Integration Test**: Memastikan `ai_enabled` tidak berubah di database sebelum `POST /ai/save-settings` dipanggil.
- **UI Test**: Memastikan banner peringatan muncul saat toggle diubah dan hilang setelah disimpan.

## 5. Keamanan
- Memastikan `ai_enabled` tidak bisa dimanipulasi oleh user lain (sudah ditangani oleh `checkApiKey` middleware).
