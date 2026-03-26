const API_URL = "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Fetch Data Devices
  try {
    const devRes = await fetch(`${API_URL}/get-devices`);
    const devResult = await devRes.json();

    const tbody = document.getElementById("dashboardDeviceList");
    let activeCount = 0;
    let totalCount = 0;

    if (devResult.status && devResult.data.length > 0) {
      totalCount = devResult.data.length;
      tbody.innerHTML = ""; // Kosongkan tabel

      devResult.data.forEach((device) => {
        const isOnline = device.status === "Connected";
        if (isOnline) activeCount++;

        // Bikin UI Status
        const statusHtml = isOnline
          ? `<span class="size-2 bg-green-500 rounded-full"></span><span class="text-sm text-green-600 font-medium">Online</span>`
          : `<span class="size-2 bg-slate-300 rounded-full"></span><span class="text-sm text-slate-500 font-medium">Offline</span>`;

        // Render Baris Tabel
        tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <div class="size-8 bg-slate-100 rounded-lg flex items-center justify-center">
                                    <span class="material-symbols-outlined text-slate-500 text-lg">smartphone</span>
                                </div>
                                <span class="text-sm font-medium text-slate-900">${device.username}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-2">${statusHtml}</div>
                        </td>
                        <td class="px-6 py-4 text-sm font-mono text-slate-500">${device.phone || "N/A"}</td>
                    </tr>
                `;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center p-6 text-slate-500 text-sm">Belum ada device terdaftar.</td></tr>`;
    }

    // Update Angka Statistik Device
    document.getElementById("statActiveDevices").innerText = activeCount;
    document.getElementById("statTotalDevices").innerText = totalCount;
  } catch (error) {
    console.error("Gagal memuat devices:", error);
  }

  // 2. Fetch Data Statistik Pesan (Dari message_logs)
  try {
    const statRes = await fetch(`${API_URL}/dashboard-stats`);
    const statResult = await statRes.json();

    if (statResult.status) {
      // Update Angka
      document.getElementById("statTotalMessages").innerText =
        statResult.data.totalMessages.toLocaleString("id-ID");
      document.getElementById("statSuccessRate").innerText =
        `${statResult.data.successRate}%`;

      // Update Feed Riwayat (Timeline)
      const feedContainer = document.getElementById("dashboardActivityFeed");
      const logs = statResult.data.recentLogs;

      if (logs && logs.length > 0) {
        feedContainer.innerHTML = "";
        logs.forEach((log) => {
          const isSuccess = log.status === "SUCCESS";
          const colorIcon = isSuccess ? "bg-green-500" : "bg-red-500";
          const textPesan = isSuccess
            ? `Pesan terkirim ke <span class="text-slate-600 font-mono">${log.target_number}</span>`
            : `Gagal mengirim ke <span class="text-slate-600 font-mono">${log.target_number}</span>`;

          feedContainer.innerHTML += `
                        <div class="flex gap-4">
                            <div class="size-2 mt-1.5 rounded-full ${colorIcon} shrink-0"></div>
                            <div class="flex flex-col gap-1">
                                <p class="text-sm font-medium text-slate-800">${textPesan}</p>
                                <p class="text-[11px] text-slate-400 uppercase font-bold tracking-tight truncate max-w-[200px]" title="${log.message}">${log.message}</p>
                            </div>
                        </div>
                    `;
        });
      } else {
        feedContainer.innerHTML = `<p class="text-sm text-slate-500 text-center mt-10">Belum ada riwayat pesan.</p>`;
      }
    }
  } catch (error) {
    console.error("Gagal memuat statistik:", error);
  }
});
