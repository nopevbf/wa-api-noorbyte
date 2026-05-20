# Design Spec: Real-time AI Activity Log per Device

## Overview
Fitur ini bertujuan untuk menampilkan aktivitas AI secara real-time pada halaman Auto Reply. Log akan menampilkan proses mulai dari pesan masuk, pemrosesan AI, hingga pengiriman balasan, khusus untuk perangkat yang sedang dipilih oleh pengguna di dashboard.

## Architecture
Sistem menggunakan **Socket.io** untuk komunikasi dua arah antara Backend (WA Engine) dan Frontend (Auto Reply UI).

### 1. Backend Changes (`src/services/waEngine.js`)
Menambahkan fungsi `logAiActivity` untuk mengirim log ke frontend.

**Event Name:** `ai_activity_log`
**Payload Structure:**
```json
{
  "apiKey": "DEV-xxxx",
  "type": "incoming | processing | outgoing | error",
  "sender": "+62xxx / Group ID",
  "message": "Isi pesan atau status",
  "timestamp": "10:42:01 AM"
}
```

**Log Points:**
- **Incoming**: Dipicu saat `isTargetMatch` terpenuhi.
- **Processing**: Dipicu sesaat sebelum memanggil `generateAiResponse`.
- **Outgoing**: Dipicu setelah `sendMessageViaWa` berhasil.
- **Error**: Dipicu di blok `catch`.

### 2. Frontend Changes (`auto-reply.html`)
- **Socket Connection**: Menambahkan script `socket.io.js` dan inisialisasi koneksi.
- **Filtering Logic**: 
  - Log hanya akan ditampilkan jika `data.apiKey === currentSelectedDeviceApiKey`.
  - Jika pengguna mengganti perangkat di dropdown, area log akan dibersihkan (`innerHTML = ''`).
- **UI Persistence**: Menggunakan template HTML yang sudah ada di file (Log Entry 1, 2, 3) untuk merender data dinamis.

## Data Flow
1. WhatsApp Message masuk -> `waEngine.js` mendeteksi target AI.
2. `waEngine.js` memancarkan `ai_activity_log` via `global.io`.
3. Frontend menerima event `ai_activity_log`.
4. Frontend mengecek apakah `apiKey` log cocok dengan `device-select.value`.
5. Jika cocok, elemen log baru ditambahkan ke kontainer aktivitas dengan gaya visual yang sama.

## Success Criteria
- Aktivitas muncul secara instan saat ada pesan masuk dari target.
- Log hanya muncul untuk perangkat yang sedang aktif dilihat.
- Gaya tampilan log (warna, font, icon) tetap sama dengan desain asli.
- Perpindahan antar perangkat membersihkan log lama.

## Implementation Tasks
1. Update `backend/src/services/waEngine.js` dengan helper `logAiActivity`.
2. Sisipkan pemanggilan `logAiActivity` di alur AI Auto-Reply.
3. Update `frontend/public/auto-reply.html` untuk memproses event socket dan merender log secara dinamis.
