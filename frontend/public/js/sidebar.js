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
    const navLinks = document.querySelectorAll(".nav-link");

    navLinks.forEach((link) => {
      if (link.getAttribute("data-path") === currentPath) {
        // Ubah class jadi warna Primary (Aktif)
        link.className =
          "nav-link flex items-center gap-3 px-3 py-2.5 bg-primary/10 text-primary rounded-lg transition-colors";
        const icon = link.querySelector(".icon");
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      }
    });

    // 3. Logic: Buka Tutup (Toggle) Sidebar
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggleBtn = document.getElementById("toggleSidebarBtn"); // Tombol hamburger di Header
    const closeBtn = document.getElementById("closeSidebarBtn");

    function openSidebar() {
      sidebar.classList.remove("-translate-x-full");
      backdrop.classList.remove("hidden");
    }

    function closeSidebar() {
      sidebar.classList.add("-translate-x-full");
      backdrop.classList.add("hidden");
    }

    // Pasang event listener
    if (toggleBtn) toggleBtn.addEventListener("click", openSidebar);
    if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
    if (backdrop) backdrop.addEventListener("click", closeSidebar);

    // FITUR BARU: Logic Tombol Logout dengan Modal Interaktif
    const btnLogout = document.getElementById("btnLogout");
    const logoutModal = document.getElementById("logoutConfirmModal");
    const logoutContent = document.getElementById("logoutModalContent");
    const btnCancelLogout = document.getElementById("btnCancelLogout");
    const btnConfirmLogout = document.getElementById("btnConfirmLogout");

    if (btnLogout && logoutModal) {
      // Munculkan Modal
      btnLogout.addEventListener("click", () => {
        logoutModal.classList.remove("hidden");
        setTimeout(() => {
          logoutModal.classList.remove("opacity-0");
          logoutContent.classList.remove("scale-95");
        }, 10);
      });

      // Tombol Batal
      btnCancelLogout.addEventListener("click", () => {
        logoutModal.classList.add("opacity-0");
        logoutContent.classList.add("scale-95");
        setTimeout(() => {
          logoutModal.classList.add("hidden");
        }, 300);
      });

      // Tombol Ya, Keluar
      btnConfirmLogout.addEventListener("click", () => {
        // Ubah UI tombol jadi loading
        btnConfirmLogout.innerHTML = `<span class="material-symbols-outlined text-xl animate-spin">autorenew</span>`;
        btnConfirmLogout.disabled = true;
        btnCancelLogout.disabled = true;

        // Proses Logout
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
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", loadSidebar);
