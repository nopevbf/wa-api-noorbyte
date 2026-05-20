# AI Listening Mode Default OFF & Save Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memastikan AI Listening Mode selalu OFF secara default dan memerlukan klik "Save Settings" sebelum aktif.

**Architecture:** 
- Frontend-driven state tracking untuk mendeteksi perubahan toggle yang belum disimpan.
- UI feedback berupa alert banner "Perubahan Belum Diterapkan".
- Backend menjamin default value 0 via database schema.

**Tech Stack:** JavaScript (Frontend), Express.js (Backend), Better-SQLite3 (Database), Jest (Testing).

---

### Task 1: Persiapan UI di auto-reply.html

**Files:**
- Modify: `frontend/public/auto-reply.html`

- [ ] **Step 1: Tambahkan elemen Alert "Pending Save"**
Cari kontainer toggle AI Listening Mode dan tambahkan elemen alert di bawahnya (saat ini tersembunyi).

```html
<!-- Di bawah toggle container -->
<div id="pending-save-alert" class="hidden mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
    <span class="material-symbols-outlined text-amber-600 text-sm">warning</span>
    <div>
        <p class="text-xs font-bold text-amber-900">Perubahan Belum Diterapkan</p>
        <p class="text-[10px] text-amber-700">AI tidak akan mulai mendengarkan sampai Anda mengklik "Save Settings".</p>
    </div>
</div>
```

- [ ] **Step 2: Update DOM mapping**
Tambahkan `pendingSaveAlert` ke objek `DOM`.

```javascript
const DOM = {
    // ... existing
    aiListeningToggle: document.getElementById('ai-listening-toggle'),
    pendingSaveAlert: document.getElementById('pending-save-alert'),
    // ...
};
```

- [ ] **Step 3: Commit**
```bash
git add frontend/public/auto-reply.html
git commit -m "ui: add pending save alert to auto-reply page"
```

---

### Task 2: Implementasi State Tracking di Frontend

**Files:**
- Modify: `frontend/public/auto-reply.html`

- [ ] **Step 1: Inisialisasi variabel state**
Tambahkan `originalAiState` di awal script scope.

```javascript
let originalAiState = false;
```

- [ ] **Step 2: Update logic saat load settings**
Set `originalAiState` saat menerima data dari server.

```javascript
// Di dalam deviceSelect.change handler
if (result.status && result.data) {
    const settings = result.data;
    originalAiState = !!settings.ai_enabled;
    DOM.aiListeningToggle.checked = originalAiState;
    DOM.pendingSaveAlert.classList.add('hidden');
    // ...
}
```

- [ ] **Step 3: Update Toggle Event Listener**
Hapus `notify` instan dan ganti dengan logic pengecekan state.

```javascript
if (DOM.aiListeningToggle) {
    DOM.aiListeningToggle.addEventListener('change', (e) => {
        const isChanged = e.target.checked !== originalAiState;
        if (isChanged) {
            DOM.pendingSaveAlert.classList.remove('hidden');
        } else {
            DOM.pendingSaveAlert.classList.add('hidden');
        }
    });
}
```

- [ ] **Step 4: Update Save Settings Success Handler**
Update `originalAiState` setelah berhasil simpan.

```javascript
if (result.status) {
    originalAiState = DOM.aiListeningToggle.checked;
    DOM.pendingSaveAlert.classList.add('hidden');
    notify('Pengaturan AI berhasil disimpan!', 'success');
}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/public/auto-reply.html
git commit -m "feat: implement originalAiState tracking and pending save alert logic"
```

---

### Task 3: Verifikasi Backend & Database

**Files:**
- Modify: `backend/src/config/database.js` (Opsional jika perlu penguatan)
- Test: `backend/tests/aiRoute.test.js`

- [ ] **Step 1: Pastikan default value di database**
Verifikasi di `database.js` bahwa kolom `ai_enabled` memiliki `DEFAULT 0`. (Sudah ada, tapi pastikan tidak ada query yang override saat insert user baru).

- [ ] **Step 2: Tambahkan test case di aiRoute.test.js**
Buat test untuk memastikan user baru memiliki `ai_enabled: false`.

```javascript
it('should have ai_enabled set to false by default for new users', async () => {
    // Simulasi insert user baru tanpa field AI
    db.prepare("INSERT INTO users (username, phone, api_key) VALUES (?, ?, ?)").run('TestDefault', '999', 'default-token');
    
    const res = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', 'Bearer default-token');
    
    expect(res.body.status).toBe(true);
    expect(res.body.data.ai_enabled).toBe(false);
});
```

- [ ] **Step 3: Jalankan test**
Run: `npm test backend/tests/aiRoute.test.js`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/tests/aiRoute.test.js
git commit -m "test: verify default ai_enabled is false for new users"
```
