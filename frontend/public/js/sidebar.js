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
    const isJailbreakPage = currentPath.startsWith('/jailbreak');

    // ==========================================
    // 1. TEMA KHUSUS: HALAMAN JAILBREAK
    // ==========================================
    if (isJailbreakPage) {
      // A. Gelapkan background aside khas Jailbreak
      const aside = sidebarContainer.querySelector('aside');
      if (aside) {
        aside.classList.remove('bg-white', 'dark:bg-slate-900', 'border-slate-200');
        aside.classList.add('bg-slate-950', 'border-slate-800');
      }

      // B. Ubah Logo & Judul Header jadi Tema Security Merah
      const logoBox = sidebarContainer.querySelector('.bg-primary');
      if (logoBox) {
        logoBox.classList.replace('bg-primary', 'bg-red-600');
        logoBox.classList.replace('shadow-primary/20', 'shadow-red-600/20');
        logoBox.innerHTML = '<span class="material-symbols-outlined text-white text-xl" style="font-variation-settings: \'FILL\' 1;">security</span>';
      }

      // Cek h1 atau elemen font-extrabold untuk judul aplikasi
      const titleSpan = sidebarContainer.querySelector('h1') || sidebarContainer.querySelector('.font-extrabold');
      if (titleSpan) {
        titleSpan.innerHTML = 'Connect Blue <span class="block text-[10px] uppercase font-bold text-red-500 tracking-widest mt-0.5">Jailbreak Active</span>';
      }

      // C. Highlight Menu Jailbreak jadi Merah Terang
      const navJailbreak = document.getElementById('navJailbreak');
      if (navJailbreak) {
        navJailbreak.className = "flex items-center gap-3 px-3 py-2.5 bg-red-600 text-white rounded-lg shadow-sm font-bold transition-transform duration-150 scale-[0.98]";
      }

      // D. Sembunyikan blok "Upgrade Plan" biar layar lebih bersih
      const upgradeBlock = sidebarContainer.querySelector('.mt-auto .bg-slate-50')?.parentElement;
      if (upgradeBlock) upgradeBlock.classList.add('hidden');
    }

    // ==========================================
    // 2. TEMA NORMAL (Dashboard, Devices, dll)
    // ==========================================
    else {
      // A. Highlight Menu Navigasi Biasa (Warna Biru)
      const navLinks = document.querySelectorAll(".nav-link, #sidebar-container nav a");
      navLinks.forEach((link) => {
        if (link.getAttribute("data-path") === currentPath || link.getAttribute("href") === currentPath) {
          link.className = "nav-link flex items-center gap-3 px-3 py-2.5 bg-primary/10 text-primary rounded-lg transition-colors";
          const icon = link.querySelector(".icon") || link.querySelector('.material-symbols-outlined');
          if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        }
      });

      // B. Logic Modal Jailbreak (Hanya aktif kalau BUKAN di halaman Jailbreak)
      const navJailbreak = document.getElementById('navJailbreak');
      const jailbreakModal = document.getElementById('jailbreakModal');
      const stateRequest = document.getElementById('jailbreakRequestState');
      const statePending = document.getElementById('jailbreakPendingState');

      const btnCancelJailbreak = document.getElementById('btnCancelJailbreak');
      const btnRequestJailbreak = document.getElementById('btnRequestJailbreak');
      const btnClosePending = document.getElementById('btnClosePending');
      const btnRevokeRequest = document.getElementById('btnRevokeRequest');

      if (navJailbreak && jailbreakModal) {

        const closeJailbreakModal = () => {
          jailbreakModal.classList.add('opacity-0');
          stateRequest.classList.add('scale-95');
          statePending.classList.add('scale-95');

          setTimeout(() => {
            jailbreakModal.classList.add('hidden');
            btnRequestJailbreak.innerHTML = 'Request Access';
            btnRequestJailbreak.disabled = false;
          }, 300);
        };

        // Munculin Modal
        navJailbreak.addEventListener('click', (e) => {
          e.preventDefault();
          const currentToken = localStorage.getItem('noorbyte_session');

          if (currentToken === 'admin_master_key_123') {
            alert('Selamat datang Admin! Anda dialihkan ke area Jailbreak.');
            window.location.href = '/jailbreak';
          } else {
            const isPending = localStorage.getItem('jailbreak_pending');
            jailbreakModal.classList.remove('hidden');

            if (isPending) {
              stateRequest.classList.add('hidden');
              statePending.classList.remove('hidden');
              document.getElementById('pendingTimestamp').innerText = `Timestamp: ${localStorage.getItem('jailbreak_timestamp')}`;

              setTimeout(() => {
                jailbreakModal.classList.remove('opacity-0');
                statePending.classList.remove('scale-95');
              }, 10);
            } else {
              stateRequest.classList.remove('hidden');
              statePending.classList.add('hidden');

              setTimeout(() => {
                jailbreakModal.classList.remove('opacity-0');
                stateRequest.classList.remove('scale-95');
              }, 10);
            }
          }
        });

        btnCancelJailbreak.addEventListener('click', closeJailbreakModal);
        btnClosePending.addEventListener('click', closeJailbreakModal);

        // Klik Request (Hitung Mundur 5 Detik lalu Redirect)
        btnRequestJailbreak.addEventListener('click', () => {
          const originalText = btnRequestJailbreak.innerHTML;
          btnRequestJailbreak.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">autorenew</span> Memproses...`;
          btnRequestJailbreak.disabled = true;

          setTimeout(() => {
            const now = new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
            localStorage.removeItem('jailbreak_pending');
            document.getElementById('pendingTimestamp').innerText = `Timestamp: ${now}`;

            stateRequest.classList.add('scale-95', 'opacity-0');

            setTimeout(() => {
              stateRequest.classList.add('hidden');
              statePending.classList.remove('hidden');

              setTimeout(() => {
                statePending.classList.remove('scale-95');
                statePending.classList.add('scale-100', 'opacity-100');

                let countdown = 5;
                const statusText = statePending.querySelector('p.text-slate-500');
                statusText.innerHTML = `Mempersiapkan jalur aman... Mengalihkan dalam <b>${countdown} detik</b>.`;

                const interval = setInterval(() => {
                  countdown--;
                  if (countdown > 0) {
                    statusText.innerHTML = `Mempersiapkan jalur aman... Mengalihkan dalam <b>${countdown} detik</b>.`;
                  } else {
                    clearInterval(interval);
                    statusText.innerHTML = `Mengalihkan sekarang...`;
                    window.location.href = '/jailbreak';
                  }
                }, 1000);

              }, 50);
            }, 300);

          }, 1000);
        });

        // Revoke Request
        btnRevokeRequest.addEventListener('click', () => {
          localStorage.removeItem('jailbreak_pending');
          localStorage.removeItem('jailbreak_timestamp');
          alert('Pengajuan akses dibatalkan.');
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
          localStorage.removeItem("noorbyte_session");
          localStorage.removeItem("noorbyte_username");
          localStorage.removeItem("noorbyte_phone");
          localStorage.removeItem("connectApi_loggedIn");
          window.location.href = "/login";
        }, 800);
      });
    }

  } catch (error) {
    console.error("Error load sidebar:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadSidebar);