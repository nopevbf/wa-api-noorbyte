// ==========================================
// AUTH GUARD: Cek session sebelum memuat halaman
// ==========================================
const isAdmin = localStorage.getItem("connectApi_loggedIn") === "true";
const isGuest = localStorage.getItem("noorbyte_session") !== null;

if (!isAdmin && !isGuest) {
  window.location.replace("/login");
}

async function loadSidebar() {
  const sidebarContainer = document.getElementById("sidebar-container");
  if (!sidebarContainer) return;

  try {
    const response = await fetch("/components/sidebar.html");
    if (!response.ok) throw new Error("Gagal memuat sidebar");
    const html = await response.text();
    sidebarContainer.innerHTML = html;

    const currentPath = window.location.pathname;
    const isJailbreakPage = currentPath.startsWith("/jailbreak");

    // ==========================================
    // 1. TEMA KHUSUS: HALAMAN JAILBREAK
    // ==========================================
    if (isJailbreakPage) {
      // Clear pending state karena user sudah berhasil masuk ke halaman Jailbreak
      localStorage.removeItem("jailbreak_pending");
      localStorage.removeItem("jailbreak_timestamp");

      // A. Gelapkan background aside khas Jailbreak
      const aside = sidebarContainer.querySelector("aside");
      if (aside) {
        aside.classList.remove(
          "bg-white",
          "dark:bg-slate-900",
          "border-slate-200",
        );
        aside.classList.add("bg-slate-950", "border-slate-800");
      }

      // B. Ubah Logo & Judul Header jadi Tema Security Merah
      const logoBox = sidebarContainer.querySelector(".bg-primary");
      if (logoBox) {
        logoBox.classList.replace("bg-primary", "bg-red-600");
        logoBox.classList.replace("shadow-primary/20", "shadow-red-600/20");
        logoBox.innerHTML =
          '<span class="material-symbols-outlined text-white text-xl" style="font-variation-settings: \'FILL\' 1;">security</span>';
      }

      // Cek h1 atau elemen font-extrabold untuk judul aplikasi
      const titleSpan =
        sidebarContainer.querySelector("h1") ||
        sidebarContainer.querySelector(".font-extrabold");
      if (titleSpan) {
        titleSpan.innerHTML =
          'Connect Blue <span class="block text-[10px] uppercase font-bold text-red-500 tracking-widest mt-0.5">Jailbreak Active</span>';
      }

      // C. Highlight Menu Jailbreak jadi Merah Terang
      const navJailbreak = document.getElementById("navJailbreak");
      if (navJailbreak) {
        navJailbreak.className =
          "flex items-center gap-3 px-3 py-2.5 bg-red-600 text-white rounded-lg shadow-sm font-bold transition-transform duration-150 scale-[0.98]";
      }

      // D. Sembunyikan blok "Upgrade Plan" biar layar lebih bersih
      const upgradeBlock = sidebarContainer.querySelector(
        ".mt-auto .bg-slate-50",
      )?.parentElement;
      if (upgradeBlock) upgradeBlock.classList.add("hidden");
    }

    // ==========================================
    // 2. TEMA NORMAL (Dashboard, Devices, dll)
    // ==========================================
    else {
      // A. Highlight Menu Navigasi Biasa (Warna Biru)
      const navLinks = document.querySelectorAll(
        ".nav-link, #sidebar-container nav a",
      );
      navLinks.forEach((link) => {
        if (
          link.getAttribute("data-path") === currentPath ||
          link.getAttribute("href") === currentPath
        ) {
          link.className =
            "nav-link flex items-center gap-3 px-3 py-2.5 bg-primary/10 text-primary rounded-lg transition-colors";
          const icon =
            link.querySelector(".icon") ||
            link.querySelector(".material-symbols-outlined");
          if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        }
      });

      // B. Logic Modal Jailbreak (Hanya aktif kalau BUKAN di halaman Jailbreak)
      const navJailbreak = document.getElementById("navJailbreak");
      const jailbreakModal = document.getElementById("jailbreakModal");
      const stateRequest = document.getElementById("jailbreakRequestState");
      const statePending = document.getElementById("jailbreakPendingState");

      const btnCancelJailbreak = document.getElementById("btnCancelJailbreak");
      const btnRequestJailbreak = document.getElementById(
        "btnRequestJailbreak",
      );
      const btnClosePending = document.getElementById("btnClosePending");
      const btnRevokeRequest = document.getElementById("btnRevokeRequest");

      if (navJailbreak && jailbreakModal) {
        const closeJailbreakModal = () => {
          jailbreakModal.classList.add("opacity-0");
          stateRequest.classList.add("scale-95");
          statePending.classList.add("scale-95");

          setTimeout(() => {
            jailbreakModal.classList.add("hidden");
            btnRequestJailbreak.innerHTML = "Request Access";
            btnRequestJailbreak.disabled = false;
          }, 300);
        };

        // Munculin Modal
        navJailbreak.addEventListener("click", (e) => {
          e.preventDefault();
          const currentToken = localStorage.getItem("noorbyte_session");

          if (currentToken === "admin_master_key_123") {
            window.location.href = "/jailbreak";
          } else {
            const isPending = localStorage.getItem("jailbreak_pending");
            jailbreakModal.classList.remove("hidden");

            if (isPending) {
              stateRequest.classList.add("hidden");
              statePending.classList.remove("hidden");
              document.getElementById("pendingTimestamp").innerText =
                `Timestamp: ${localStorage.getItem("jailbreak_timestamp")}`;

              setTimeout(() => {
                jailbreakModal.classList.remove("opacity-0");
                statePending.classList.remove("scale-95");
              }, 10);
            } else {
              stateRequest.classList.remove("hidden");
              statePending.classList.add("hidden");

              setTimeout(() => {
                jailbreakModal.classList.remove("opacity-0");
                stateRequest.classList.remove("scale-95");
              }, 10);
            }
          }
        });

        btnCancelJailbreak.addEventListener("click", closeJailbreakModal);
        btnClosePending.addEventListener("click", closeJailbreakModal);

        // Klik Request (Hitung Mundur 5 Detik lalu Redirect)
        btnRequestJailbreak.addEventListener("click", () => {
          const originalText = btnRequestJailbreak.innerHTML;
          btnRequestJailbreak.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">autorenew</span> Memproses...`;
          btnRequestJailbreak.disabled = true;

          setTimeout(() => {
            const now =
              new Date().toISOString().replace("T", " ").substring(0, 16) +
              " UTC";
            localStorage.setItem("jailbreak_pending", "true");
            localStorage.setItem("jailbreak_timestamp", now);
            document.getElementById("pendingTimestamp").innerText =
              `Timestamp: ${now}`;

            stateRequest.classList.add("scale-95", "opacity-0");

            setTimeout(() => {
              stateRequest.classList.add("hidden");
              statePending.classList.remove("hidden");

              setTimeout(() => {
                statePending.classList.remove("scale-95");
                statePending.classList.add("scale-100", "opacity-100");

                let countdown = 5;
                const statusText =
                  statePending.querySelector("p.text-slate-500");
                statusText.innerHTML = `Mempersiapkan jalur aman... Mengalihkan dalam <b>${countdown} detik</b>.`;

                const interval = setInterval(() => {
                  countdown--;
                  if (countdown > 0) {
                    statusText.innerHTML = `Mempersiapkan jalur aman... Mengalihkan dalam <b>${countdown} detik</b>.`;
                  } else {
                    clearInterval(interval);
                    statusText.innerHTML = `Mengalihkan sekarang...`;
                    window.location.href = "/jailbreak";
                  }
                }, 1000);
              }, 50);
            }, 300);
          }, 1000);
        });

        // Revoke Request
        btnRevokeRequest.addEventListener("click", () => {
          localStorage.removeItem("jailbreak_pending");
          localStorage.removeItem("jailbreak_timestamp");
          if (typeof showToast === "function") {
             showToast("Pengajuan akses dibatalkan", "info");
          } else {
             showToast("Akses dibatalkan", "info");
          }
          closeJailbreakModal();
        });
      }
    } // <-- Akhir dari blok TEMA NORMAL

    // ==========================================
    // 3. LOGIC TOGGLE SIDEBAR (Berlaku di Semua Halaman)
    // ==========================================
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggleBtn = document.getElementById("toggleSidebarBtn");
    const closeBtn = document.getElementById("closeSidebarBtn");

    function openSidebar() {
      if (sidebar) sidebar.classList.remove("-translate-x-full");
      if (backdrop) backdrop.classList.remove("hidden");
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.add("-translate-x-full");
      if (backdrop) backdrop.classList.add("hidden");
    }

    if (toggleBtn) toggleBtn.addEventListener("click", openSidebar);
    if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
    if (backdrop) backdrop.addEventListener("click", closeSidebar);

    // ==========================================
    // 3.5. FETCH SYSTEM VERSION
    // ==========================================
    try {
      const configRes = await fetch("/api/app-config");
      const configData = await configRes.json();
      if (configData.status && configData.data && configData.data.version) {
        const versionEl = document.getElementById("system-version");
        if (versionEl) {
          versionEl.innerHTML = `v${configData.data.version}`;
        }
      }
    } catch (e) {
      console.warn("Gagal memuat versi sistem:", e.message);
    }

    // ==========================================
    // 4. LOGIC LOGOUT (Berlaku di Semua Halaman)
    // ==========================================
    const btnLogout = document.getElementById("btnLogout");
    const logoutModal = document.getElementById("logoutConfirmModal");
    const logoutContent = document.getElementById("logoutModalContent");
    const btnCancelLogout = document.getElementById("btnCancelLogout");
    const btnConfirmLogout = document.getElementById("btnConfirmLogout");

    if (btnLogout && logoutModal) {
      btnLogout.addEventListener("click", () => {
        logoutModal.classList.remove("hidden");
        setTimeout(() => {
          logoutModal.classList.remove("opacity-0");
          logoutContent.classList.remove("scale-95");
        }, 10);
      });

      btnCancelLogout.addEventListener("click", () => {
        logoutModal.classList.add("opacity-0");
        logoutContent.classList.add("scale-95");
        setTimeout(() => {
          logoutModal.classList.add("hidden");
        }, 300);
      });

      btnConfirmLogout.addEventListener("click", () => {
        btnConfirmLogout.innerHTML = `<span class="material-symbols-outlined text-xl animate-spin">autorenew</span>`;
        btnConfirmLogout.disabled = true;
        btnCancelLogout.disabled = true;

        setTimeout(() => {
          // --- SAPU BERSIH SESSION SISTEM UTAMA ---
          localStorage.removeItem("noorbyte_session");
          localStorage.removeItem("noorbyte_username");
          localStorage.removeItem("noorbyte_phone");
          localStorage.removeItem("connectApi_loggedIn");
          localStorage.removeItem("automationSelectedDevice");

          // ==========================================
          // SQA INJECTION: SAPU BERSIH KREDENSIAL TARGET
          // ==========================================
          localStorage.removeItem("full_name");
          localStorage.removeItem("active_env");
          localStorage.removeItem("dparagon_token");
          localStorage.removeItem("access_token");

          // TENDANG KE HALAMAN LOGIN
          window.location.href = "/login";
        }, 800);
      });
    }
  } catch (error) {
    console.error("Error load sidebar:", error);
  }
}

async function loadNavbar() {
  const currentPath = window.location.pathname;
  if (currentPath.startsWith("/jailbreak")) return;

  const headerTag = document.querySelector("main header");
  if (!headerTag) return;

  try {
    const response = await fetch("/components/navbar.html");
    if (!response.ok) throw new Error("Gagal memuat navbar");
    const html = await response.text();
    headerTag.outerHTML = html;

    // Tunggu sebentar agar DOM terupdate
    setTimeout(() => {
      const navbarPageName = document.getElementById("navbar-page-name");
      const navbarUserName = document.getElementById("navbar-user-name");
      const navbarUserRole = document.getElementById("navbar-user-role");
      const navbarUserAvatar = document.getElementById("navbar-user-avatar");

      const isAdmin = localStorage.getItem("connectApi_loggedIn") === "true";
      const guestUsername = localStorage.getItem("noorbyte_username");

      let displayUsername = "Guest";
      let displayRole = "Guest Access";
      if (isAdmin) {
        displayUsername = "Admin";
        displayRole = "Master Access";
      } else if (guestUsername) {
        displayUsername = guestUsername;
        displayRole = "Device Owner";
      }

      if (navbarUserName) navbarUserName.innerText = displayUsername;
      if (navbarUserRole) navbarUserRole.innerText = displayRole;
      if (navbarUserAvatar) {
        navbarUserAvatar.innerText = displayUsername.substring(0, 2).toUpperCase();
      }

      const pageNames = {
        "/dashboard": "Dashboard",
        "/devices": "Devices",
        "/automation": "Automation",
        "/checkin": "Check-in",
        "/groups": "Groups",
        "/tester": "API Tester",
        "/verify": "Verification"
      };

      const cleanPath = currentPath.replace(".html", "").split("?")[0];
      const pageName = pageNames[cleanPath] || document.title.split(" - ")[0].split(" | ")[0] || "System";
      if (navbarPageName) navbarPageName.innerText = pageName;

      // Re-bind toggle sidebar button
      const toggleBtn = document.getElementById("toggleSidebarBtn");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          const sidebar = document.getElementById("app-sidebar");
          const backdrop = document.getElementById("sidebar-backdrop");
          if (sidebar) sidebar.classList.remove("-translate-x-full");
          if (backdrop) backdrop.classList.remove("hidden");
        });
      }
    }, 0);

  } catch (error) {
    console.error("Error load navbar:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSidebar();
  loadNavbar();
});

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

/**
 * GLOBAL MODAL SYSTEM
 * @param {Object} options - { title, message, type, onConfirm, onClose, confirmText, cancelText }
 */
function showModal(options = {}) {
  const {
    title = "Pemberitahuan",
    message = "",
    type = "info", // info, success, error, confirm, warning
    onConfirm = null,
    onClose = null,
    confirmText = "Ya, Lanjutkan",
    cancelText = "Tutup"
  } = options;

  const modal = document.getElementById('globalModal');
  const modalContent = document.getElementById('globalModalContent');
  const iconContainer = document.getElementById('modalIconContainer');
  const icon = document.getElementById('modalIcon');
  const titleEl = document.getElementById('modalTitle');
  const messageEl = document.getElementById('modalMessage');
  const actionsEl = document.getElementById('modalActions');

  if (!modal || !modalContent) return;

  // 1. Reset & Setup Content
  titleEl.innerText = title;
  messageEl.innerHTML = message;
  actionsEl.innerHTML = '';

  // 2. Setup Icon & Color based on type
  iconContainer.className = 'mx-auto flex items-center justify-center h-20 w-20 rounded-2xl mb-6 shadow-inner transition-all duration-300';
  
  if (type === 'success') {
    iconContainer.classList.add('bg-emerald-50', 'dark:bg-emerald-900/20', 'text-emerald-500');
    icon.innerText = 'check_circle';
  } else if (type === 'error') {
    iconContainer.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-500');
    icon.innerText = 'error';
  } else if (type === 'warning' || type === 'confirm') {
    iconContainer.classList.add('bg-amber-50', 'dark:bg-amber-900/20', 'text-amber-500');
    icon.innerText = 'warning';
  } else {
    iconContainer.classList.add('bg-indigo-50', 'dark:bg-indigo-900/20', 'text-primary');
    icon.innerText = 'info';
  }

  // 3. Setup Actions
  const closeModal = () => {
    modal.classList.add('opacity-0');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
      if (onClose) onClose();
    }, 300);
  };

  if (type === 'confirm') {
    const btnCancel = document.createElement('button');
    btnCancel.className = 'flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all';
    btnCancel.innerText = cancelText;
    btnCancel.onclick = closeModal;

    const btnOk = document.createElement('button');
    btnOk.className = 'flex-[1.5] px-4 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]';
    btnOk.innerText = confirmText;
    btnOk.onclick = () => {
      closeModal();
      if (onConfirm) onConfirm();
    };

    actionsEl.appendChild(btnCancel);
    actionsEl.appendChild(btnOk);
  } else {
    const btnOk = document.createElement('button');
    btnOk.className = 'w-full px-4 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]';
    btnOk.innerText = cancelText;
    btnOk.onclick = closeModal;
    actionsEl.appendChild(btnOk);
  }

  // 4. Show Modal with Animation
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.classList.add('flex');
    modalContent.classList.remove('scale-95');
  }, 10);
}

