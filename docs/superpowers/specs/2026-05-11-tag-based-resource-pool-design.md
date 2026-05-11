# Design Spec: Tag-Based Resource Pool Input

## Overview
Transform the "POOL LINK" textarea into an interactive Tag Input system. This allows users to paste or type report content, which is then converted into "Tags" upon pressing a comma (`,`). Each tag represents one or more links, but visually summarizes only the last numbered item found in its content.

## UI Changes
- **File:** `frontend/public/pulse.html`
- **Component:** "Resource Pool" section.
- **Visuals:**
    - Replace the `<textarea x-model="manual.poolText">` with a tag container.
    - **Tag Container:** A flex-wrap `div` styled as an input (border, rounded, background).
    - **Tag Elements:** Small boxes with background `bg-primary/10`, a label, and a remove button (`✕`).
    - **Input Field:** A borderless `input` inside the tag container for typing/pasting.
    - **Summary Format:** Tags show the last detected numbered item (e.g., `32. Sate Pak JEDE ...`).

## Logic & State
- **File:** `frontend/public/js/pulse.js`
- **State Changes:**
    - Remove: `manual.poolText`.
    - Add: `manual.poolTags` (Array of Strings).
    - Add: `manual.currentInput` (String for the active typing area).
- **Key Methods:**
    - `addTag(text)`: 
        - Trims and validates content.
        - Splits by comma if bulk pasted.
        - Pushes to `manual.poolTags`.
        - Clears `manual.currentInput`.
    - `removeTag(index)`: Deletes tag at index.
    - `getTagLabel(rawText)`: 
        - Uses Regex to find all `(\d+\.\s+[^http]+)` occurrences.
        - Returns the **last** match + `...`.
- **Computed Properties:**
    - `captionPreview`: 
        - Iterates through `manual.poolTags`.
        - For each tag, extracts the number and generates: `[Name] / [No] / [Date]`.
        - Joins lines with double newlines (`\n\n`) as requested.
        - Appends IG/TT handles at the bottom.

## Data Integration
- `startManual()`: Flattens `manual.poolTags` back into a single link string for backend processing.

## Success Criteria
- Typing a report and pressing `,` creates a tag.
- Pasting a block with multiple commas creates multiple tags.
- The preview correctly lists all items with double-line spacing.
- Identity handles (IG/TT) appear at the bottom.
