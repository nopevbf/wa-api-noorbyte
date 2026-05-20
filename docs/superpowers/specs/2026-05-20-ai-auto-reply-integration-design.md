# Spesifikasi Desain: Integrasi AI Auto Reply - NoorByte API

**Tanggal:** 2026-05-20  
**Status:** Draft  
**Topik:** Mengaktifkan fungsi AI Auto Reply dengan dukungan multi-provider (Gemini, OpenAI, Claude) dan opsi API Sistem vs Pribadi.

## 1. Pendahuluan
Fitur ini memungkinkan pengguna NoorByte API untuk mengaktifkan asisten AI cerdas yang secara otomatis membalas pesan masuk di WhatsApp. Sistem mendukung penggunaan API Key global (Sistem) atau API Key milik pengguna sendiri (Pribadi) dengan keamanan enkripsi.

## 2. Arsitektur & Komponen

### A. Environment Variables (`.env`)
Menambahkan variabel baru untuk konfigurasi global:
- `AI_SYSTEM_PROVIDER`: Default 'gemini'.
- `AI_SYSTEM_API_KEY`: API Key untuk layanan sistem.
- `ENCRYPTION_KEY`: Kunci 32 karakter untuk enkripsi AES-256 API Key pribadi di database.

### B. Skema Database (`users` table)
Menambahkan kolom baru melalui migrasi di `database.js`:
- `ai_enabled` (INTEGER, default 0): Status aktif fitur.
- `ai_source` (TEXT, default 'system'): Pilihan 'system' atau 'private'.
- `ai_provider` (TEXT, default 'gemini'): Pilihan 'gemini', 'openai', atau 'claude'.
- `ai_api_key` (TEXT): API Key pribadi terenkripsi.
- `ai_system_prompt` (TEXT): Instruksi kepribadian AI.
- `ai_context_data` (TEXT): Basis pengetahuan tambahan.

### C. AI Engine Service (`src/services/aiEngine.js`)
Service baru yang mengabstraksi pemanggilan ke berbagai provider:
- Mendukung: Google Gemini, OpenAI (GPT-4), dan Anthropic Claude.
- Fungsi Utama: `generateAiResponse(config, message)`.
- Menggunakan `axios` untuk request ke API provider.

### D. Security Helper (`src/helpers/security.js`)
Menyediakan fungsi enkripsi/dekripsi:
- Algoritma: `aes-256-cbc`.
- Fungsi: `encrypt(text)`, `decrypt(text)`.

## 3. Alur Kerja (Data Flow)

1. **Incoming Message**: `waEngine.js` menerima pesan via `messages.upsert`.
2. **Configuration Check**: Sistem mengambil data user dari DB berdasarkan `api_key` device.
3. **AI Trigger**: Jika `ai_enabled === 1`:
   - Ambil `ai_system_prompt` dan `ai_context_data`.
   - Jika `ai_source === 'private'`, dekripsi `ai_api_key`.
   - Kirim ke `aiEngine.js`.
4. **AI Generation**: `aiEngine.js` memanggil API provider dan mengembalikan teks balasan.
5. **Response**: `waEngine.js` mengirimkan teks balasan ke pengirim asli menggunakan `sendMessageViaWa`.

## 4. Rencana Implementasi

1. **Phase 1: Foundation**
   - Update `.env` dengan variabel baru.
   - Buat `src/helpers/security.js` untuk enkripsi.
   - Jalankan migrasi database untuk kolom baru di `users`.

2. **Phase 2: AI Engine**
   - Implementasi `src/services/aiEngine.js` dengan dukungan minimal Gemini (default) dan OpenAI.

3. **Phase 3: Integration**
   - Modifikasi `waEngine.js` untuk memicu AI pada pesan masuk.
   - Update `apiRoutes.js` untuk endpoint simpan pengaturan AI.

4. **Phase 4: UI Update**
   - Integrasi frontend `auto-reply.html` dengan API backend yang baru.

## 5. Kriteria Keberhasilan
- AI berhasil membalas pesan masuk secara otomatis.
- API Key pribadi tersimpan dalam format terenkripsi di database.
- Pengguna dapat beralih antara API Sistem dan Pribadi tanpa kendala.
- Jika API Key salah atau limit habis, sistem memberikan log error yang jelas di terminal.
