# AI Auto Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengaktifkan fitur AI Auto Reply yang mendukung berbagai provider (Gemini, OpenAI) dengan opsi API Sistem atau Pribadi yang terenkripsi.

**Architecture:** Implementasi asinkronus menggunakan `aiEngine.js` sebagai wrapper API AI, `security.js` untuk enkripsi AES-256, dan integrasi langsung pada event `messages.upsert` di `waEngine.js`.

**Tech Stack:** Node.js, Express, better-sqlite3, axios, crypto (native), Gemini API, OpenAI API.

---

### Task 1: Fondasi Keamanan & Environment

**Files:**
- Modify: `.env`
- Create: `backend/src/helpers/security.js`
- Test: `backend/tests/security.test.js`

- [ ] **Step 1: Tambahkan variabel baru ke .env**
Update `.env` dengan variabel berikut (gunakan kunci 32 karakter acak untuk `ENCRYPTION_KEY`):
```env
AI_SYSTEM_PROVIDER=gemini
AI_SYSTEM_API_KEY=
ENCRYPTION_KEY=f3e1c9b2d5a8e7f6g5h4i3j2k1l0m9n8
```

- [ ] **Step 2: Buat helper keamanan untuk enkripsi/dekripsi**
Implementasi `backend/src/helpers/security.js`:
```javascript
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef', 'utf8');

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return null;
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { encrypt, decrypt };
```

- [ ] **Step 3: Buat test untuk verifikasi enkripsi**
`backend/tests/security.test.js`:
```javascript
const { encrypt, decrypt } = require('../src/helpers/security');
describe('Security Helper', () => {
    test('should encrypt and decrypt text correctly', () => {
        const secret = 'sk-1234567890';
        const encrypted = encrypt(secret);
        expect(encrypted).not.toBe(secret);
        expect(decrypt(encrypted)).toBe(secret);
    });
});
```

- [ ] **Step 4: Jalankan test**
Run: `npm test tests/security.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add .env backend/src/helpers/security.js backend/tests/security.test.js
git commit -m "feat: add security helper for AI API keys"
```

---

### Task 2: Migrasi Database

**Files:**
- Modify: `backend/src/config/database.js`

- [ ] **Step 1: Tambahkan kolom AI ke tabel users**
Modify `backend/src/config/database.js` pada bagian `migrations`:
```javascript
const migrations = [
  // ... existing migrations
  { table: 'users', column: 'ai_enabled', sql: "ALTER TABLE users ADD COLUMN ai_enabled INTEGER DEFAULT 0" },
  { table: 'users', column: 'ai_source', sql: "ALTER TABLE users ADD COLUMN ai_source TEXT DEFAULT 'system'" },
  { table: 'users', column: 'ai_provider', sql: "ALTER TABLE users ADD COLUMN ai_provider TEXT DEFAULT 'gemini'" },
  { table: 'users', column: 'ai_api_key', sql: "ALTER TABLE users ADD COLUMN ai_api_key TEXT" },
  { table: 'users', column: 'ai_system_prompt', sql: "ALTER TABLE users ADD COLUMN ai_system_prompt TEXT" },
  { table: 'users', column: 'ai_context_data', sql: "ALTER TABLE users ADD COLUMN ai_context_data TEXT" },
];
```

- [ ] **Step 2: Jalankan server untuk trigger migrasi**
Run: `node backend/server.js` (hentikan setelah beberapa detik)
Expected: Log "[DATABASE] Kolom 'ai_enabled' berhasil ditambahkan..." muncul di terminal.

- [ ] **Step 3: Commit**
```bash
git add backend/src/config/database.js
git commit -m "db: add ai configuration columns to users table"
```

---

### Task 3: Implementasi AI Engine

**Files:**
- Create: `backend/src/services/aiEngine.js`
- Test: `backend/tests/aiEngine.test.js`

- [ ] **Step 1: Buat AI Engine service**
`backend/src/services/aiEngine.js`:
```javascript
const axios = require('axios');
const { decrypt } = require('../helpers/security');

async function generateAiResponse(config, userMessage) {
    const { source, provider, customKey, systemPrompt, contextData } = config;
    const apiKey = source === 'system' ? process.env.AI_SYSTEM_API_KEY : decrypt(customKey);
    
    if (!apiKey) throw new Error('API Key tidak ditemukan.');

    const fullPrompt = `${systemPrompt || 'Anda adalah asisten AI.'}\n\nKonteks Tambahan:\n${contextData || '-'}\n\nUser: ${userMessage}`;

    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: fullPrompt }] }]
        });
        return response.data.candidates[0].content.parts[0].text;
    } else if (provider === 'openai') {
        const url = 'https://api.openai.com/v1/chat/completions';
        const response = await axios.post(url, {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: fullPrompt }]
        }, { headers: { Authorization: `Bearer ${apiKey}` } });
        return response.data.choices[0].message.content;
    }
    throw new Error('Provider tidak didukung.');
}

module.exports = { generateAiResponse };
```

- [ ] **Step 2: Verifikasi dengan test** (Gunakan mock axios jika perlu)
- [ ] **Step 3: Commit**
```bash
git add backend/src/services/aiEngine.js
git commit -m "feat: implement multi-provider AI Engine"
```

---

### Task 4: Integrasi WhatsApp & API Routes

**Files:**
- Modify: `backend/src/services/waEngine.js`
- Modify: `backend/src/routes/apiRoutes.js`

- [ ] **Step 1: Integrasi AI di waEngine.js**
Modify `sock.ev.on('messages.upsert', ...)` untuk memicu AI:
```javascript
const { generateAiResponse } = require('./aiEngine');
// ... di dalam event listener
const user = db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey);
if (user && user.ai_enabled) {
    const aiConfig = {
        source: user.ai_source,
        provider: user.ai_provider,
        customKey: user.ai_api_key,
        systemPrompt: user.ai_system_prompt,
        contextData: user.ai_context_data
    };
    try {
        const aiReply = await generateAiResponse(aiConfig, text);
        await sendMessageViaWa(apiKey, sender, aiReply, 'text');
    } catch (e) {
        console.error('AI Error:', e.message);
    }
}
```

- [ ] **Step 2: Tambahkan endpoint simpan pengaturan AI di apiRoutes.js**
```javascript
const { encrypt } = require('../helpers/security');

router.post("/ai/save-settings", checkApiKey, (req, res) => {
    const { ai_enabled, ai_source, ai_provider, ai_api_key, ai_system_prompt, ai_context_data } = req.body;
    const apiKey = req.user.api_key;
    try {
        db.prepare(`
            UPDATE users SET 
            ai_enabled = ?, ai_source = ?, ai_provider = ?, 
            ai_api_key = ?, ai_system_prompt = ?, ai_context_data = ?
            WHERE api_key = ?
        `).run(
            ai_enabled ? 1 : 0, ai_source, ai_provider,
            ai_api_key ? encrypt(ai_api_key) : null,
            ai_system_prompt, ai_context_data,
            apiKey
        );
        res.json({ status: true, message: "Pengaturan AI disimpan." });
    } catch (e) {
        res.status(500).json({ status: false, message: e.message });
    }
});
```

- [ ] **Step 3: Commit**
```bash
git add backend/src/services/waEngine.js backend/src/routes/apiRoutes.js
git commit -m "feat: integrate AI into WA message handler and add API routes"
```

---

### Task 5: Finalisasi UI Frontend

**Files:**
- Modify: `frontend/public/auto-reply.html`

- [ ] **Step 1: Update form submission di frontend untuk mengirim data ke endpoint baru.**
- [ ] **Step 2: Commit**
```bash
git add frontend/public/auto-reply.html
git commit -m "ui: connect auto-reply page to backend AI settings"
```
