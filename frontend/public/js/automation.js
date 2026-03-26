const API_URL = "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", async () => {
  // ==========================================
  // 0. FITUR SHOW/HIDE PASSWORD
  // ==========================================
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const accountPassword = document.getElementById("accountPassword");
  const togglePasswordIcon = document.getElementById("togglePasswordIcon");

  if (togglePasswordBtn && accountPassword) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = accountPassword.getAttribute("type") === "password";
      accountPassword.setAttribute("type", isPassword ? "text" : "password");
      if (togglePasswordIcon) {
        togglePasswordIcon.textContent = isPassword
          ? "visibility"
          : "visibility_off";
      }
    });
  }

  // ==========================================
  // 1. INIT DEVICES DROPDOWN
  // ==========================================
  const selector = document.getElementById("deviceSelector");
  if (selector) {
    try {
      const response = await fetch(`${API_URL}/get-devices`);
      const result = await response.json();
      if (result.status && result.data.length > 0) {
        selector.innerHTML =
          '<option value="">-- Pilih Device Pengirim --</option>';
        result.data.forEach((device) => {
          const isOnline = device.status === "Connected";
          const option = document.createElement("option");
          option.value = device.api_key;
          option.textContent = `${device.username} (${device.phone}) - ${isOnline ? "🟢 Online" : "🔴 Offline"}`;
          if (!isOnline) option.disabled = true;
          selector.appendChild(option);
        });
      }
    } catch (error) {
      selector.innerHTML = '<option value="">Gagal memuat device.</option>';
    }
  }

  // ==========================================
  // 2. FUNGSI TERMINAL LOG (VERSI INSTAN SUPER NGEBUT)
  // ==========================================
  const terminal = document.getElementById("terminalLog");

  // Hapus parameter delay dan setTimeout biar gak ada jeda buatan sama sekali
  const addLog = (colorClass, label, text) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    if (terminal) {
      terminal.innerHTML += `
                <div class="flex gap-3">
                    <span class="text-slate-500">[${time}]</span>
                    <span class="${colorClass} font-bold">${label}:</span>
                    <span class="break-words flex-1">${text}</span>
                </div>
            `;
      // Auto scroll ke bawah
      terminal.scrollTop = terminal.scrollHeight;
    }
    // Return promise instan biar syntax 'await addLog(...)' di bawah gak error
    return Promise.resolve();
  };

  let cachedMessage = null;

  // ==========================================
  // 3. FUNGSI TARIK DATA REAL (STEP 1 - 5)
  // ==========================================
  async function tarikDataDparagon() {
    const dpApiUrl = document
      .getElementById("dpApiUrl")
      .value.replace(/\/$/, "");
    const dpEmail = document.getElementById("dpEmail").value;
    const dpPassword = document.getElementById("accountPassword").value;

    if (!dpApiUrl || !dpEmail || !dpPassword)
      throw new Error("Kredensial DParagon belum lengkap.");

    // [STEP 1] LOGIN
    await addLog(
      "text-blue-400",
      "STEP 1",
      "Melakukan login ke sistem DParagon...",
      100,
    );
    const authRes = await fetch(`${dpApiUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: dpEmail, password: dpPassword }),
    });
    if (!authRes.ok) throw new Error(`Login gagal (HTTP ${authRes.status})`);
    const authData = await authRes.json();
    let dpToken =
      authData.access_token ||
      authData.data?.access_token ||
      authData.payload?.access_token;
    if (!dpToken)
      throw new Error("Gagal mendapatkan access_token dari response.");
    await addLog(
      "text-emerald-400",
      "SUCCESS",
      "Login berhasil, access_token didapatkan.",
      300,
    );

    // [STEP 2] ON PROGRESS TASK
    await addLog(
      "text-blue-400",
      "STEP 2",
      "Mengambil data on-progress task...",
      500,
    );
    const taskRes = await fetch(`${dpApiUrl}/daily-reports/on-progress-task`, {
      headers: {
        Authorization: `Bearer ${dpToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!taskRes.ok)
      throw new Error(`Gagal fetch on-progress task (HTTP ${taskRes.status})`);
    const taskData = await taskRes.json();
    const payloadData = taskData.payload || [];
    if (payloadData.length === 0)
      throw new Error("Data payload kosong atau tidak ditemukan.");

    const tasksList = payloadData.map((task) => ({
      dates: `${task.start_date || ""} - ${task.end_date || ""}`,
      task_description: task.task_description || "",
    }));
    await addLog(
      "text-emerald-400",
      "SUCCESS",
      `Data task berhasil diekstrak (${tasksList.length} task).`,
      300,
    );

    // [STEP 3] POST NEW TASK
    await addLog(
      "text-blue-400",
      "STEP 3",
      "Melakukan POST data ke /daily-reports/new-task...",
      500,
    );
    const now = new Date();
    const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const postTaskRes = await fetch(`${dpApiUrl}/daily-reports/new-task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ daily_date: todayDate, tasks: tasksList }),
    });
    if (!postTaskRes.ok)
      throw new Error(`Gagal POST new-task (HTTP ${postTaskRes.status})`);
    await addLog(
      "text-emerald-400",
      "SUCCESS",
      "POST /new-task berhasil dikirim ke server!",
      300,
    );

    // [STEP 4] GET REPORT CODE
    await addLog(
      "text-blue-400",
      "STEP 4",
      "Mengambil daily_report_code dari list terbaru...",
      500,
    );
    const listRes = await fetch(
      `${dpApiUrl}/daily-reports/list?dates=&employee_position_id=`,
      {
        headers: {
          Authorization: `Bearer ${dpToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!listRes.ok)
      throw new Error(`Gagal ambil list report (HTTP ${listRes.status})`);
    const listData = await listRes.json();

    const group = listData.payload?.group || {};
    const keys = Object.keys(group);
    if (keys.length === 0)
      throw new Error("Tidak ada data report ditemukan (Keys length 0).");

    const lastKey = keys[keys.length - 1];
    const reportCode = group[lastKey]?.daily_report_code;
    if (!reportCode) throw new Error("Key daily_report_code tidak ditemukan.");
    await addLog(
      "text-emerald-400",
      "SUCCESS",
      `Berhasil menyimpan code: ${reportCode}`,
      300,
    );

    // [STEP 5] GET SUMMARY REPORT
    await addLog("text-blue-400", "STEP 5", `Mengambil detail laporan...`, 500);
    const summaryRes = await fetch(
      `${dpApiUrl}/daily-reports/summary-daily-report?code=${reportCode}`,
      {
        headers: {
          Authorization: `Bearer ${dpToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!summaryRes.ok)
      throw new Error(`Gagal ambil summary (HTTP ${summaryRes.status})`);
    const summaryData = await summaryRes.json();

    let rawMessage = null;
    if (summaryData.payload?.message) rawMessage = summaryData.payload.message;
    else if (typeof summaryData.payload === "string")
      rawMessage = summaryData.payload;
    else if (summaryData.data?.message) rawMessage = summaryData.data.message;
    else if (summaryData.message && summaryData.message.length > 50)
      rawMessage = summaryData.message;

    if (!rawMessage)
      throw new Error("Message laporan tidak ditemukan atau kosong!");
    await addLog(
      "text-emerald-400",
      "SUCCESS",
      "Payload message berhasil diekstrak.",
      300,
    );

    cachedMessage = rawMessage;
    document.getElementById("messagePreview").innerText = rawMessage;
    return rawMessage;
  }

  // ==========================================
  // 4. FUNGSI KIRIM WA (STEP 6)
  // ==========================================
  async function kirimKeWhatsApp(pesan) {
    const apiKey = selector.value;
    const targetNumber = document.getElementById("targetNumber").value;

    if (!apiKey || !targetNumber)
      throw new Error("Device WA atau Target Nomor kosong.");
    if (!pesan)
      throw new Error(
        "Pesan kosong, jalankan proses fetch data terlebih dahulu.",
      );

    await addLog(
      "text-amber-400",
      "STEP 6",
      `Mengirim pesan ke WhatsApp (${targetNumber})...`,
      500,
    );
    const waRes = await fetch(`${API_URL}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        number: targetNumber,
        message: pesan,
        msg_type: "text",
      }),
    });

    const waResult = await waRes.json();
    if (waRes.ok && waResult.status === "success") {
      await addLog(
        "text-emerald-400",
        "SUCCESS",
        `Laporan terkirim! (ID: ${waResult.data?.message_id})`,
        300,
      );
    } else {
      throw new Error(waResult.message || "Gagal mengirim pesan via WA");
    }
  }

  // ==========================================
  // 5. TOMBOL RUN MANUAL (Menjalankan semua)
  // ==========================================
  const btnRun = document.getElementById("btnRunAutomation");
  if (btnRun) {
    btnRun.addEventListener("click", async () => {
      btnRun.disabled = true;
      btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Executing...`;
      if (terminal) terminal.innerHTML = "";

      try {
        const hasilPesan = await tarikDataDparagon();
        await kirimKeWhatsApp(hasilPesan);
        showModal("Berhasil 🎉", "Proses penarikan dan pengiriman selesai!");
      } catch (error) {
        await addLog("text-red-500", "ERROR", `Terhenti: ${error.message}`);
        showModal("Gagal Eksekusi", error.message);
      } finally {
        btnRun.disabled = false;
        btnRun.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span> Run Automation Now`;
      }
    });
  }

  // ==========================================
  // 6. LOGIC SCHEDULER (MESIN WAKTU)
  // ==========================================
  let scheduleInterval = null;

  // FUNGSI BARU: Mengubah isi kotak Message Preview
  function updatePreviewUI(isActive) {
    const msgPreview = document.getElementById("messagePreview");
    if (!msgPreview) return;

    if (isActive) {
      // Ambil data jam dari form
      const fetchTime = document.getElementById("fetchTime").value || "--:--";
      const sendTime = document.getElementById("sendWaTime").value || "--:--";
      const isWeekdays = document.getElementById("freqWeekdays").checked
        ? " (Hari Kerja)"
        : "";

      // Tampilkan Banner ala Colab
      msgPreview.innerText = `=========================
🤖 SISTEM OTOMATISASI DAILY REPORT DPARAGON AKTIF
🌍 Zona Waktu Server: Asia/Jakarta (WIB)
⏰ Jadwal${isWeekdays}: Tarik Data (${fetchTime} WIB) --> Kirim WA (${sendTime} WIB)
⚠️ BIARKAN TAB BROWSER INI TERUS TERBUKA (RUNNING)
=========================

Mendeteksi waktu berjalan...`;

      // Tambah warna biru biar kelihatan ini status sistem
      msgPreview.classList.add("text-primary", "font-bold");
      msgPreview.classList.remove("text-slate-700");
    } else {
      // Kalau dimatikan, kembalikan ke teks default/hasil tarikan terakhir
      msgPreview.innerText =
        cachedMessage ||
        `🔔 DAILY REPORT - DPARAGON
Period: ${new Date().toLocaleDateString("id-ID", { month: "long", day: "numeric", year: "numeric" })}

✅ Total Tasks: 0
✅ Completed: 0
⚠️ Pending: 0

Revenue Today: Rp 0
Occupancy Rate: 0%

(Sistem otomatisasi MATI. Klik Run Automation Now untuk manual)`;

      // Kembalikan warna teks normal
      msgPreview.classList.remove("text-primary", "font-bold");
      msgPreview.classList.add("text-slate-700");
    }
  }

  function startScheduler() {
    if (scheduleInterval) clearInterval(scheduleInterval);
    addLog(
      "text-purple-400",
      "SCHEDULER",
      "Jadwal Otomatis AKTIF. Memantau waktu...",
      0,
    );
    updatePreviewUI(true); // Panggil fungsi baru di sini

    scheduleInterval = setInterval(async () => {
      const isEnabled = document.getElementById("scheduleToggle").checked;
      if (!isEnabled) return;

      const now = new Date();
      const currentHourMin = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });

      const isWeekdaysOnly = document.getElementById("freqWeekdays").checked;
      const dayOfWeek = now.getDay();
      if (isWeekdaysOnly && (dayOfWeek === 0 || dayOfWeek === 6)) return;

      const fetchTimeSetting = document.getElementById("fetchTime").value;
      const sendWaTimeSetting = document.getElementById("sendWaTime").value;

      // Logika flag agar hanya tereksekusi 1 kali per menit yang cocok
      if (currentHourMin === fetchTimeSetting && !window.hasFetchedForMinute) {
        window.hasFetchedForMinute = true;
        await addLog(
          "text-purple-400",
          "SCHEDULER",
          `Waktu Fetch Data tiba (${fetchTimeSetting}). Memulai proses...`,
        );
        try {
          await tarikDataDparagon();
        } catch (e) {
          await addLog(
            "text-red-500",
            "SCHEDULER ERROR",
            `Gagal fetch data: ${e.message}`,
          );
        }
      } else if (currentHourMin !== fetchTimeSetting) {
        window.hasFetchedForMinute = false; // Reset kalau menit udah lewat
      }

      if (currentHourMin === sendWaTimeSetting && !window.hasSentWaForMinute) {
        window.hasSentWaForMinute = true;
        await addLog(
          "text-purple-400",
          "SCHEDULER",
          `Waktu Send WA tiba (${sendWaTimeSetting}). Memulai pengiriman...`,
        );
        try {
          await kirimKeWhatsApp(cachedMessage);
        } catch (e) {
          await addLog(
            "text-red-500",
            "SCHEDULER ERROR",
            `Gagal kirim WA: ${e.message}`,
          );
        }
      } else if (currentHourMin !== sendWaTimeSetting) {
        window.hasSentWaForMinute = false; // Reset kalau menit udah lewat
      }
    }, 15000); // Cek setiap 15 detik biar lebih responsif
  }

  function stopScheduler() {
    if (scheduleInterval) {
      updatePreviewUI(false); // Panggil fungsi baru di sini
      clearInterval(scheduleInterval);
      addLog("text-slate-500", "SCHEDULER", "Jadwal Otomatis DIMATIKAN.", 0);
    }
  }

  const toggleBtn = document.getElementById("scheduleToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("change", (e) => {
      if (e.target.checked) startScheduler();
      else stopScheduler();
    });
  }

  // ==========================================
  // 7. SIMPAN SETTINGAN KE LOCALSTORAGE
  // ==========================================
  const btnSaveSettings = document.getElementById("btnSaveSettings");
  function loadSavedSettings() {
    const savedSettings = JSON.parse(
      localStorage.getItem("connectApiSettings"),
    );
    if (savedSettings) {
      if (document.getElementById("dpApiUrl"))
        document.getElementById("dpApiUrl").value =
          savedSettings.dpApiUrl || "";
      if (document.getElementById("dpEmail"))
        document.getElementById("dpEmail").value = savedSettings.dpEmail || "";
      if (document.getElementById("accountPassword"))
        document.getElementById("accountPassword").value =
          savedSettings.dpPassword || "";

      if (document.getElementById("scheduleToggle"))
        document.getElementById("scheduleToggle").checked =
          savedSettings.scheduleEnabled || false;
      if (document.getElementById("fetchTime"))
        document.getElementById("fetchTime").value =
          savedSettings.fetchTime || "08:00";
      if (document.getElementById("sendWaTime"))
        document.getElementById("sendWaTime").value =
          savedSettings.sendWaTime || "09:00";

      if (savedSettings.frequency === "weekdays")
        document.getElementById("freqWeekdays").checked = true;
      else document.getElementById("freqDaily").checked = true;

      if (document.getElementById("targetNumber"))
        document.getElementById("targetNumber").value =
          savedSettings.targetNumber || "";

      if (savedSettings.scheduleEnabled) startScheduler();
    }
  }

  loadSavedSettings();

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", () => {
      const settings = {
        dpApiUrl: document.getElementById("dpApiUrl").value,
        dpEmail: document.getElementById("dpEmail").value,
        dpPassword: document.getElementById("accountPassword").value,
        scheduleEnabled: document.getElementById("scheduleToggle").checked,
        fetchTime: document.getElementById("fetchTime").value,
        sendWaTime: document.getElementById("sendWaTime").value,
        frequency: document.querySelector('input[name="frequency"]:checked')
          .value,
        targetNumber: document.getElementById("targetNumber").value,
      };
      localStorage.setItem("connectApiSettings", JSON.stringify(settings));

      const originalText = btnSaveSettings.innerHTML;
      btnSaveSettings.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">autorenew</span> Saving...`;
      btnSaveSettings.disabled = true;

      setTimeout(() => {
        btnSaveSettings.innerHTML = originalText;
        btnSaveSettings.disabled = false;
        showModal(
          "Pengaturan Disimpan",
          "Konfigurasi jadwal dan API berhasil disimpan.",
        );

        if (settings.scheduleEnabled) startScheduler();
        else stopScheduler();
      }, 800);
    });
  }
});

function showModal(title, message) {
  const titleEl = document.getElementById("modalTitle");
  const messageEl = document.getElementById("modalMessage");
  const modalEl = document.getElementById("globalModal");
  if (titleEl) titleEl.innerText = title;
  if (messageEl) messageEl.innerHTML = message;
  if (modalEl) modalEl.classList.remove("hidden");
}
