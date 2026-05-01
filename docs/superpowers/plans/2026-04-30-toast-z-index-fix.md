# Toast Notification Z-Index Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure toast notifications always appear on top of all UI elements (modals, blurs) by moving the container to the document body and increasing its z-index.

**Architecture:** Escape the sidebar's stacking context by relocating the `#toastContainer` to the `<body>` root. Use an ultra-high z-index (`999999`) and ensure `pointer-events-none` is preserved.

**Tech Stack:** Vanilla JS, Tailwind CSS classes.

---

### Task 1: Remove Toast Container from Sidebar Component

**Files:**
- Modify: `frontend/public/components/sidebar.html`

- [ ] **Step 1: Remove the toastContainer div**

Remove the following block (around line 235):
```html
<!-- Toast Container -->
<div id="toastContainer" class="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"></div>
```

- [ ] **Step 2: Commit removal**

```bash
git add frontend/public/components/sidebar.html
git commit -m "refactor: remove toastContainer from sidebar component"
```

---

### Task 2: Update showToast Logic for Relocation and Z-Index

**Files:**
- Modify: `frontend/public/js/sidebar.js`

- [ ] **Step 1: Update showToast implementation**

Modify `function showToast` (around line 388) to ensure the container is on the body with the correct z-index.

```javascript
function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("toastContainer");

  // Ensure container exists and is a direct child of body to escape stacking contexts
  if (!container || container.parentElement !== document.body) {
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
    }
    // Set high z-index and pointer-events-none
    container.className = "fixed top-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none";
    document.body.appendChild(container);
  } else {
    // Just in case it existed but had old z-index
    container.className = "fixed top-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none";
  }

  const toast = document.createElement("div");
  // ... rest of the existing logic for toast creation ...
```

- [ ] **Step 2: Verify the complete function code**

Ensure the final function looks like this:

```javascript
function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("toastContainer");

  if (!container || container.parentElement !== document.body) {
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
    }
    container.className = "fixed top-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none";
    document.body.appendChild(container);
  } else {
    container.className = "fixed top-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none";
  }

  const toast = document.createElement("div");
  toast.className = `toast-pill ${type}`;

  let icon = "info";
  if (type === "success") icon = "check_circle";
  if (type === "error") icon = "error";
  if (type === "warning") icon = "warning";

  toast.innerHTML = `
    <div class="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 pointer-events-auto min-w-[280px]">
      <div class="flex-shrink-0 size-10 rounded-xl flex items-center justify-center ${type === 'success' ? 'bg-emerald-50 text-emerald-500' : type === 'error' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <div class="flex-1">
        <p class="text-sm font-bold text-slate-900 dark:text-white">${message}</p>
      </div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 400);
  }, duration);
}
```

- [ ] **Step 3: Commit logic changes**

```bash
git add frontend/public/js/sidebar.js
git commit -m "feat: move toast container to body root and increase z-index to 999999"
```

---

### Task 3: Verification

- [ ] **Step 1: Visual Verification**
1. Trigger a toast while a modal is open.
2. Confirm the toast is visible over the modal backdrop.
3. Confirm the toast is visible over the modal content itself.
