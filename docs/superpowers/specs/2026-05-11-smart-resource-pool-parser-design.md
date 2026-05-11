# Design Spec: Smart Resource Pool Parser

## Overview
Simplify the manual resource pool entry by replacing separate date and link fields with a single "POOL LINK" textarea that auto-parses complex copy-pasted text from social media reports into a standardized "Caption Preview".

## UI Changes
- **File:** `frontend/public/pulse.html`
- **Actions:**
    - Replace the "Pool Tanggal" and "Pool Link" textareas with a single textarea:
        - **Label:** `POOL LINK`
        - **Model:** `manual.poolText`
        - **Placeholder:** Paste report text here (e.g., 26. D'Paragon...)
    - Retain "Pool Komen" as is.
    - Keep "Caption Preview" section but update its data binding to reflect parsed data.

## Logic & State
- **File:** `frontend/public/js/pulse.js`
- **State Additions:**
    - `manual.poolText`: String to hold the raw pasted content.
- **Computed Properties:**
    - `parsedLinks`: An array of objects extracted from `manual.poolText`.
        - Each object: `{ number: string, links: string[] }`
    - `parsedDate`: The extracted date string (e.g., "07 Mei 2026").
    - `captionPreview`: The final formatted text block for display.

## Parsing Algorithm
1. **Date:** Search for pattern `[Nama Hari], [Tanggal] [Bulan] [Tahun]` (e.g., `Kamis, 07 Mei 2026`). Extract only `[Tanggal] [Bulan] [Tahun]`.
2. **Items:** Split text by lines.
    - If a line matches `(\d+)\.\s`, extract the number as a new item.
    - Any subsequent links (Instagram/TikTok) found before the next numbered line are associated with that item's number.
3. **Identity:** Use `config.name`, `config.ig`, and `config.tt` from the UI.

## Output Format (Preview)
```text
[Full Name] /[No Link] [Parsed Date]
... (repeated for each item)

IG : [Instagram Handle or "-"]
TT : [TikTok Handle or "-"]
```

## Error Handling
- If no date is found, display "..." for the date.
- If no links/numbers are found, display "No data".
- If `config.ig` or `config.tt` are empty, display `-`.
