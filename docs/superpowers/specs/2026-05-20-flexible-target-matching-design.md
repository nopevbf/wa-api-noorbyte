# Spec: Flexible Target Matching for Auto Reply AI

## 1. Problem Statement
Saat ini, fitur Auto Reply AI mewajibkan pengguna untuk memasukkan **LID (Linked ID)** (contoh: `168160888094860`) untuk memonitor akun WhatsApp tertentu yang tidak menggunakan JID nomor telepon standar. Hal ini menyulitkan pengguna karena LID sulit didapatkan secara manual. Pengguna ingin bisa memasukkan nomor HP biasa (contoh: `082298507500`) dan sistem secara otomatis mengenali jika pesan dari LID tersebut sebenarnya berasal dari nomor HP yang dimaksud.

## 2. Goals
- Mengizinkan pengguna memasukkan nomor HP manusia di kolom "Monitor Target".
- Sistem secara otomatis memetakan (resolving) pesan dari LID ke nomor HP menggunakan metadata kontak yang tersedia di session WhatsApp.
- Mendukung normalisasi otomatis format nomor HP (08xx, +62xx, 62xx).

## 3. Technical Design

### 3.1 Contact Resolver Logic
Sistem akan memanfaatkan `contactMappings` yang dikelola di `waEngine.js`. Map ini menyimpan objek kontak yang dikirim oleh WhatsApp melalui event `contacts.upsert` dan `contacts.update`.

**Langkah-langkah Pencocokan:**
1. Pesan masuk memiliki `remoteJid` (ID Chat) dan `participant` (ID Pengirim).
2. Ambil daftar target dari database (kolom `ai_target`).
3. Normalisasi setiap target ke format internasional (diawali `62`).
4. Untuk setiap target, lakukan pengecekan:
   - **Direct JID Match:** Apakah `remoteJid` atau `participant` mengandung string target?
   - **Metadata Lookup:** Cari di `contactMappings` apakah ada kontak dengan ID tersebut yang memiliki metadata nomor telepon yang cocok dengan target.
   - **Number Match:** Ambil angka saja dari `remoteJid` / `participant` dan bandingkan dengan target.

### 3.2 Normalization Helper
Fungsi untuk menormalisasi nomor HP:
```javascript
function normalizePhoneNumber(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    return clean;
}
```

### 3.3 Implementation Details
Update dilakukan pada file `backend/src/services/waEngine.js` di dalam handler `messages.upsert`:

```javascript
// Pseudo-code Update
const targets = targetSetting.split(',').map(t => normalizePhoneNumber(t.trim()));
const myContacts = contactMappings.get(apiKey);

isTargetMatch = targets.some(t => {
    // 1. Cek langsung ke JID (LID/Group ID)
    if (remoteJid.includes(t) || participant.includes(t)) return true;
    
    // 2. Cek angka dari JID pengirim
    const senderNumbers = participant.replace(/\D/g, '');
    if (senderNumbers === t) return true;

    // 3. Cek via Metadata Kontak (Solusi untuk LID)
    const contact = myContacts.get(participant) || myContacts.get(remoteJid);
    if (contact) {
        // WhatsApp terkadang menyimpan nomor di field 'id', 'notify', atau 'name'
        const contactIdClean = contact.id.replace(/\D/g, '');
        if (contactIdClean === t) return true;
    }
    
    return false;
});
```

## 4. UI Changes
- Tambahkan placeholder atau helper text di `auto-reply.html` untuk memberi tahu pengguna bahwa nomor HP biasa sudah bisa digunakan.

## 5. Verification Plan
1. **Test Case 1 (Standard JID):** Input nomor HP standar di UI. Kirim pesan dari nomor tersebut. AI harus membalas.
2. **Test Case 2 (LID Account):** Input nomor HP yang diketahui memiliki LID di UI. Kirim pesan dari akun tersebut. AI harus membalas.
3. **Test Case 3 (Format Variation):** Input nomor format `08...`, `62...`, dan `+62...`. Semuanya harus bekerja.
4. **Test Case 4 (Group ID):** Input Group ID (misal `123456789@g.us`). AI harus tetap bekerja untuk grup tersebut.
