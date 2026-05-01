# Design: Toast Notification Z-Index Fix

Ensure toast notifications always appear on top of all UI elements, including modals and backdrop blurs, by escaping the sidebar stacking context and using a safe z-index.

## 1. Problem Statement
Current toast notifications are defined within `sidebar.html`, which is injected into `#sidebar-container`. In many pages (e.g., `dashboard.html`), `#sidebar-container` has `z-50`. Modals across the application have `z-index` values ranging from `100` to `150`. Because the toasts are children of a lower z-index container, they can never appear above the modals, even with a high internal `z-index` (Stacking Context rule).

## 2. Proposed Changes

### A. Component Modification
- **File:** `frontend/public/components/sidebar.html`
- **Action:** Remove the `<div id="toastContainer">` declaration from this file. It should not be nested within the sidebar.

### B. Logic Modification
- **File:** `frontend/public/js/sidebar.js`
- **Action:** Update `showToast` function:
    - If `#toastContainer` does not exist, create it and append it directly to `document.body`.
    - If it *does* exist but is not a direct child of `body`, move it to `body`.
    - Increase the Tailwind-style z-index class from `z-[9999]` to `z-[999999]`.
    - Ensure it has `pointer-events-none` so it doesn't block clicks to elements behind it (already present, but will verify).

### C. CSS Consistency
- **File:** `frontend/public/css/style.css` (if needed)
- **Action:** Ensure any toast-related animations or styles are compatible with the absolute positioning on the body.

## 3. Success Criteria
- Toasts appear clearly above the `globalModal` backdrop blur.
- Toasts appear clearly above page-specific modals (e.g., in `checkin.html` or `automation.html`).
- Toasts remain functional (auto-dismiss, animations) after relocation.

## 4. Testing Strategy
1. Open a modal that has a backdrop blur.
2. Trigger a toast notification (e.g., by performing an action that triggers `showToast`).
3. Verify the toast is visible and not blurred or hidden by the modal.
4. Verify the toast can still be seen on mobile views where the sidebar might be hidden or transformed.
