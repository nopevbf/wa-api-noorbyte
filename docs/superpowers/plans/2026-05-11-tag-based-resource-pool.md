# Tag-Based Resource Pool Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Resource Pool textarea into a dynamic tag-based input system where each report block becomes a tag summarized by its last item number.

**Architecture:** Replace `manual.poolText` with `manual.poolTags` (array) and `manual.currentInput`. Implement tag extraction logic that triggers on comma. Update `captionPreview` to aggregate all tags with double-newline spacing.

**Tech Stack:** Alpine.js, Tailwind CSS.

---

### Task 1: Update State and Logic in pulse.js

**Files:**
- Modify: `frontend/public/js/pulse.js`

- [ ] **Step 1: Update `manual` state and add tag methods**

Replace `poolText: ''` with:
```javascript
manual: {
    comments: '',
    poolTags: [], // Array to store raw tag content
    currentInput: '' // Active typing area
},
```

Add these methods inside `Alpine.data('pulseController', ...)`:

```javascript
addTag() {
    let text = this.manual.currentInput.trim();
    if (!text) return;

    // Split by comma if user pasted a bulk report
    const newTags = text.split(',').map(t => t.trim()).filter(t => t.length > 0);
    this.manual.poolTags.push(...newTags);
    this.manual.currentInput = '';
},

removeTag(index) {
    this.manual.poolTags.splice(index, 1);
},

getTagLabel(rawText) {
    // Find all occurrences of "[Number]. [Name...]"
    // Example: "32. Sate Pak JEDE"
    const matches = [...rawText.matchAll(/(\d+\.\s+[^http\n]+)/g)];
    if (matches.length > 0) {
        // Get the last match found in the text
        const lastMatch = matches[matches.length - 1][1].trim();
        return lastMatch.substring(0, 30) + '...'; // Truncate if too long
    }
    return rawText.substring(0, 20) + '...';
},
```

- [ ] **Step 2: Update `captionPreview` computed property**

Update the logic to iterate through tags and use double newlines between blocks.

```javascript
get captionPreview() {
    const name = this.config.name || '{{full_name}}';
    const date = this.parsedDate;
    
    // If no tags, show a placeholder
    if (this.manual.poolTags.length === 0) {
        return `${name} / {{no_link}} / ${date}\n\nIG : ${this.config.ig || '-'}\nTT : ${this.config.tt || '-'}`;
    }

    let allPreviewBlocks = [];

    this.manual.poolTags.forEach(tagContent => {
        // Extract all item numbers from this specific tag
        // Note: Using the robust split logic from Task 1 (previous implementation)
        const parts = tagContent.split(/(\d+\.\s)/);
        const numbersInTag = [];
        
        for (let i = 1; i < parts.length; i += 2) {
            const numMatch = parts[i].match(/(\d+)\./);
            if (numMatch) numbersInTag.push(numMatch[1]);
        }

        if (numbersInTag.length > 0) {
            const blockLines = numbersInTag.map(num => `${name} / ${num} / ${date}`);
            allPreviewBlocks.push(blockLines.join('\n'));
        }
    });

    const body = allPreviewBlocks.join('\n\n');
    const handles = `IG : ${this.config.ig || '-'}\nTT : ${this.config.tt || '-'}`;
    
    return (body + '\n\n' + handles).trim();
},
```

- [ ] **Step 3: Update `startManual` to use `poolTags`**

```javascript
async startManual() {
    // Flatten all tags into one giant text to reuse the existing parsing logic
    const combinedText = this.manual.poolTags.join('\n');
    
    // Temporarily set manual.poolText so parsedLinks (which we'll keep as-is) can work
    this.manual.poolText = combinedText; 

    const allLinks = this.parsedLinks.flatMap(item => item.links);

    if(!this.config.name || allLinks.length === 0) {
        this.addLog('Error', 'Identitas atau Link tidak boleh kosong! (Pastikan sudah tekan koma)', 'text-red-500');
        return;
    }
    // ... rest of function ...
}
```

### Task 2: Implement Tag Input UI in pulse.html

**Files:**
- Modify: `frontend/public/pulse.html`

- [ ] **Step 1: Replace textarea with Tag Input container**

Find the `Resource Pool` section and replace the `textarea` for `manual.poolText` with:

```html
<div>
    <label class="block text-[10px] font-bold text-primary uppercase mb-1.5 ml-1">POOL LINK (TAGS MODE)</label>
    <div class="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-primary/30 dark:border-slate-800 rounded-xl px-3 py-2 min-h-[120px] flex flex-wrap gap-2 items-start focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
        
        <!-- Render existing tags -->
        <template x-for="(tag, index) in manual.poolTags" :key="index">
            <div class="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-xs font-bold animate-in fade-in zoom-in duration-200">
                <span x-text="getTagLabel(tag)"></span>
                <button @click="removeTag(index)" class="hover:text-rose-500 transition-colors">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
            </div>
        </template>

        <!-- Hidden input for bulk parsing on blur/paste -->
        <input 
            type="text" 
            x-model="manual.currentInput"
            @keydown.comma.prevent="addTag()"
            @keydown.enter.prevent="addTag()"
            @blur="addTag()"
            class="flex-1 bg-transparent border-none outline-none text-sm py-1 px-1 min-w-[150px] text-slate-900 dark:text-white placeholder:text-slate-400 font-mono"
            placeholder="Paste & press comma..."
        />
    </div>
    <p class="text-[9px] text-slate-400 mt-2 ml-1 italic">Tekan koma (,) atau Enter untuk mengunci tag.</p>
</div>
```

### Task 3: Verification

- [ ] **Step 1: Verify Tag Creation**
Type/Paste text and press `,`. Verify a tag is created with the correct label.

- [ ] **Step 2: Verify Multi-line Preview**
Create multiple tags and check if the "Caption Preview" shows them separated by double newlines.

- [ ] **Step 3: Verify Execution**
Start manual execution and ensure links are correctly sent to the backend.
