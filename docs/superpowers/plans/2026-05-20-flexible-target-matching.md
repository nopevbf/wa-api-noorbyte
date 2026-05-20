# Flexible Target Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengizinkan pengguna Auto Reply memasukkan nomor HP biasa alih-alih LID, dengan memanfaatkan metadata kontak WhatsApp untuk pencocokan otomatis.

**Architecture:** Menambahkan fungsi normalisasi nomor telepon dan memperbarui logika `messages.upsert` di `waEngine.js` untuk melakukan lookup ke `contactMappings` guna mencocokkan JID (termasuk LID) dengan nomor HP target.

**Tech Stack:** Node.js, Baileys (WhatsApp Web API), SQLite.

---

### Task 1: Phone Number Normalization Helper

**Files:**
- Modify: `backend/src/helpers/validators.js`
- Test: `backend/tests/validators.test.js`

- [ ] **Step 1: Write the failing test for normalization**
Add to `backend/tests/validators.test.js`:
```javascript
const { normalizePhoneNumber } = require('../src/helpers/validators');

describe('normalizePhoneNumber', () => {
    it('should convert 08... to 628...', () => {
        expect(normalizePhoneNumber('082298507500')).toBe('6282298507500');
    });
    it('should keep 62... as is', () => {
        expect(normalizePhoneNumber('6282298507500')).toBe('6282298507500');
    });
    it('should strip non-digit characters', () => {
        expect(normalizePhoneNumber('+62 822-9850-7500')).toBe('6282298507500');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test backend/tests/validators.test.js`
Expected: FAIL (normalizePhoneNumber is not a function)

- [ ] **Step 3: Implement normalizePhoneNumber**
Modify `backend/src/helpers/validators.js`:
```javascript
function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    return clean;
}
// Export it
module.exports = { ..., normalizePhoneNumber };
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test backend/tests/validators.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/helpers/validators.js backend/tests/validators.test.js
git commit -m "feat: add normalizePhoneNumber helper"
```

---

### Task 2: Update waEngine.js Matching Logic

**Files:**
- Modify: `backend/src/services/waEngine.js`

- [ ] **Step 1: Import normalizePhoneNumber**
Add at the top of `backend/src/services/waEngine.js`:
```javascript
const { normalizePhoneNumber } = require('../helpers/validators');
```

- [ ] **Step 2: Update target matching in messages.upsert**
Find the `isTargetMatch` logic in `sock.ev.on('messages.upsert', ...)` and replace with:
```javascript
const targets = targetSetting.split(',').map(t => normalizePhoneNumber(t.trim())).filter(t => t !== '');
const myContacts = contactMappings.get(apiKey);

isTargetMatch = targets.some(t => {
    // 1. Direct JID match (for LID or specific JID string)
    if (remoteJid.includes(t) || participant.includes(t)) return true;

    // 2. Normalize sender/participant numbers for comparison
    const senderNumbers = participant.replace(/\D/g, '');
    const groupNumbers = remoteJid.replace(/\D/g, '');
    if (senderNumbers === t || groupNumbers === t) return true;

    // 3. Metadata Lookup (The LID Solution)
    const contact = myContacts?.get(participant) || myContacts?.get(remoteJid);
    if (contact) {
        // Check various ID fields in contact metadata
        const contactIdClean = contact.id?.replace(/\D/g, '') || '';
        if (contactIdClean === t) return true;
        
        // Sometimes numbers are in notify or other Baileys fields
        if (contact.notify && contact.notify.replace(/\D/g, '') === t) return true;
    }

    return false;
});
```

- [ ] **Step 3: Verify with existing tests**
Run: `npm test backend/tests/waEngine.test.js` (if exists) or manual verification.

- [ ] **Step 4: Commit**
```bash
git add backend/src/services/waEngine.js
git commit -m "feat: implement flexible target matching in waEngine"
```

---

### Task 3: UI Enhancement (Helper Text)

**Files:**
- Modify: `frontend/public/auto-reply.html`

- [ ] **Step 1: Update helper text for target input**
Change the `<p>` tag under `ai-target-input`:
```html
<p class="text-[10px] text-slate-400 font-medium">Input Nomor HP (08xxx) atau ID Grup. Tekan Enter/Koma untuk menambah tag.</p>
```

- [ ] **Step 2: Commit**
```bash
git add frontend/public/auto-reply.html
git commit -m "ui: update helper text for flexible target input"
```
