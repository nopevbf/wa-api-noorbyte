document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("sidebar-container");
    if (!container) return;

    try {
        // 1. Ambil HTML Sidebar
        const response = await fetch('/components/sidebar.html');
        const html = await response.text();
        container.innerHTML = html;

        // 2. Logic: Otomatis tandai menu yang aktif berdasarkan URL
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            if (link.getAttribute('data-path') === currentPath) {
                // Ubah class jadi warna Primary (Aktif)
                link.className = "nav-link flex items-center gap-3 px-3 py-2.5 bg-primary/10 text-primary rounded-lg transition-colors";
                const icon = link.querySelector('.icon');
                if (icon) icon.style.fontVariationSettings = "'FILL' 1";
            }
        });

        // 3. Logic: Buka Tutup (Toggle) Sidebar
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        const toggleBtn = document.getElementById('toggleSidebarBtn'); // Tombol hamburger di Header
        const closeBtn = document.getElementById('closeSidebarBtn');

        function openSidebar() {
            sidebar.classList.remove('-translate-x-full');
            backdrop.classList.remove('hidden');
        }

        function closeSidebar() {
            sidebar.classList.add('-translate-x-full');
            backdrop.classList.add('hidden');
        }

        // Pasang event listener
        if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
        if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
        if (backdrop) backdrop.addEventListener('click', closeSidebar);

    } catch (error) {
        console.error("Gagal memuat komponen sidebar:", error);
    }
});