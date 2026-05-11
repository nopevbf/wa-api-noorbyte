# Smart Resource Pool Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Resource Pool input by replacing separate date and link fields with a single "POOL LINK" textarea that auto-parses content into a formatted "Caption Preview".

**Architecture:** Add a new state `manual.poolText` to the Alpine.js controller. Implement computed properties for parsing the text using Regex (extracting date and numbered items with links). Update the UI to bind to this new state and display the reactive preview.

**Tech Stack:** Alpine.js, HTML/Tailwind CSS, JavaScript (Regex).

---

### Task 1: Update State and Define Computed Properties

**Files:**
- Modify: `frontend/public/js/pulse.js`

- [ ] **Step 1: Add `poolText` to `manual` state**

```javascript
// Around line 22 in manual object
manual: {
    poolText: '', // New state
    dates: '',
    links: '',
    comments: ''
},
```

- [ ] **Step 2: Implement `parsedDate` computed property**

```javascript
// Add inside Alpine.data('pulseController', () => ({ ... }))
get parsedDate() {
    if (!this.manual.poolText) return '...';
    // Match pattern like "Kamis, 07 Mei 2026" or "07 Mei 2026"
    const dateMatch = this.manual.poolText.match(/(?:(?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),\s+)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
    return dateMatch ? dateMatch[1] : '...';
},
```

- [ ] **Step 3: Implement `parsedLinks` computed property**

```javascript
get parsedLinks() {
    if (!this.manual.poolText) return [];
    const lines = this.manual.poolText.split('\n');
    const items = [];
    let currentItem = null;

    lines.forEach(line => {
        const trimmed = line.trim();
        // Match line starting with number and dot, e.g., "26. D'Paragon"
        const numMatch = trimmed.match(/^(\d+)\./);
        if (numMatch) {
            currentItem = { number: numMatch[1], links: [] };
            items.push(currentItem);
        } else if (currentItem && (trimmed.includes('instagram.com') || trimmed.includes('tiktok.com') || trimmed.startsWith('https://vt.tiktok.com'))) {
            // Basic link detection
            const linkMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
            if (linkMatch) {
                currentItem.links.push(linkMatch[0]);
            }
        }
    });
    return items;
},
```

- [ ] **Step 4: Implement `captionPreview` computed property**

```javascript
get captionPreview() {
    const name = this.config.name || '{{full_name}}';
    const date = this.parsedDate;
    const items = this.parsedLinks;

    if (items.length === 0) {
        return `${name} / {{no_link}} ${date}\n\nIG : ${this.config.ig || '-'}\nTT : ${this.config.tt || '-'}`;
    }

    const previewLines = items.map(item => `${name} /${item.number} ${date}`);
    const handles = `IG : ${this.config.ig || '-'}\nTT : ${this.config.tt || '-'}`;
    
    return previewLines.join('\n') + '\n\n' + handles;
},
```

- [ ] **Step 5: Update `startManual` to use `parsedLinks`**

```javascript
// Update startManual logic to extract links from parsedLinks
async startManual() {
    if(!this.config.name || !this.manual.poolText) {
        this.addLog('Error', 'Identitas atau Pool Link tidak boleh kosong!', 'text-red-500');
        return;
    }

    this.isWaiting = false;
    this.saveConfig();

    // Flatten all links from parsed items
    const allLinks = this.parsedLinks.flatMap(item => item.links);
    
    if (allLinks.length === 0) {
        this.addLog('Error', 'Tidak ada link valid yang ditemukan di Pool Link!', 'text-red-500');
        this.isWaiting = true;
        return;
    }
    
    // ... rest of the existing logic for commentPool, localLinks, etc.
}
```

### Task 2: Refactor UI in pulse.html

**Files:**
- Modify: `frontend/public/pulse.html`

- [ ] **Step 1: Replace old inputs with "POOL LINK" textarea**

```html
<!-- Replace lines 146-153 -->
<div>
    <label class="block text-[10px] font-bold text-primary uppercase mb-1.5 ml-1">POOL LINK (PASTE HERE)</label>
    <textarea x-model="manual.poolText" class="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-primary/30 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono min-h-[150px] text-slate-900 dark:text-white transition-all" placeholder="Paste report text here..."></textarea>
</div>
```

- [ ] **Step 2: Update Caption Preview display**

```html
<!-- Replace content of Caption Preview section (lines 298-301) -->
<div class="bg-slate-50/50 dark:bg-slate-950/50 rounded-xl p-5 font-mono text-slate-700 dark:text-indigo-200 border border-outline dark:border-slate-800 leading-relaxed text-sm whitespace-pre-wrap">
    <div x-text="captionPreview"></div>
</div>
```

### Task 3: Verification and Cleanup

- [ ] **Step 1: Test with example input**
Paste the example from the user request and verify the preview matches.

- [ ] **Step 2: Verify `startManual` still works**
Ensure links are correctly flattened and sent to backend/extension.

- [ ] **Step 3: Remove old unused state variables (Optional/Cleanup)**
If `manual.dates` and `manual.links` are no longer needed anywhere else.
