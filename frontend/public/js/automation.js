const API_URL = "/api";

// Variabel global untuk menyimpan default DParagon URL dari backend config
let defaultDparagonApiUrl = "";

document.addEventListener("DOMContentLoaded", async () => {
  // ==========================================
  // 0a. FETCH APP CONFIG (ENV-BASED DEFAULT URL)
  // ==========================================
  try {
    const configRes = await fetch(`${API_URL}/app-config`);
    const configData = await configRes.json();
    if (configData.status && configData.data) {
      defaultDparagonApiUrl = configData.data.dparagonApiUrl || "";

      // Tampilkan badge environment
      const envBadge = document.getElementById("envBadge");
      if (envBadge) {
        const env = configData.data.env || "development";
        const isDev = env !== "production";
        envBadge.textContent = isDev ? "DEV" : "PROD";
        envBadge.classList.remove("hidden");
        if (isDev) {
          envBadge.classList.add("bg-amber-100", "text-amber-700");
        } else {
          envBadge.classList.add("bg-emerald-100", "text-emerald-700");
        }
      }

      // Set default value kalau belum ada input dari localStorage
      const dpApiUrlInput = document.getElementById("dpApiUrl");
      if (dpApiUrlInput && !dpApiUrlInput.value) {
        dpApiUrlInput.value = defaultDparagonApiUrl;
      }
    }
  } catch (e) {
    console.warn("Gagal memuat app config:", e.message);
  }
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
  // 0b. INIT ADVANCED SCHEDULING UI
  // ==========================================
  const startDateInput = document.getElementById("startDate");
  if (startDateInput && !startDateInput.value) {
    const today = new Date().toISOString().split("T")[0];
    startDateInput.value = today;
  }

  const freqCustom = document.getElementById("freqCustom");
  const customDaysContainer = document.getElementById("customDaysContainer");
  const freqRadios = document.querySelectorAll('input[name="frequency"]');
  const btnAddExcludedDate = document.getElementById("btnAddExcludedDate");
  const excludedDateInput = document.getElementById("excludedDateInput");
  const excludedDatesList = document.getElementById("excludedDatesList");

  const toggleCustomDays = () => {
    if (freqCustom && freqCustom.checked) {
      customDaysContainer?.classList.remove("hidden");
    } else {
      customDaysContainer?.classList.add("hidden");
    }
  };

  freqRadios.forEach((radio) => {
    radio.addEventListener("change", toggleCustomDays);
  });

  const addExcludedDateBadge = (dateStr) => {
    if (!dateStr) return;

    // Avoid duplicates
    const existing = Array.from(excludedDatesList.querySelectorAll("span")).find(
      (s) => s.textContent === dateStr
    );
    if (existing) return;

    const badge = document.createElement("div");
    badge.className = "flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold animate-in fade-in zoom-in duration-200";
    badge.innerHTML = `
      <span>${dateStr}</span>
      <button type="button" class="hover:text-red-500 transition-colors flex items-center">
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>
    `;

    badge.querySelector("button").addEventListener("click", () => {
      badge.remove();
    });

    excludedDatesList.appendChild(badge);
  };

  if (btnAddExcludedDate && excludedDateInput && excludedDatesList) {
    btnAddExcludedDate.addEventListener("click", () => {
      const dateStr = excludedDateInput.value;
      if (!dateStr) {
        showModal({ title: "Peringatan", message: "Pilih tanggal terlebih dahulu." });
        return;
      }
      addExcludedDateBadge(dateStr);
      excludedDateInput.value = ""; // Reset input
    });
  }

  // Initial check
  toggleCustomDays();

  // ==========================================
  // 1. INIT DEVICES DROPDOWN
  // ==========================================
  const selector = document.getElementById("deviceSelector");

  // Register listener early to catch initial dispatch
  if (selector) {
    selector.addEventListener("change", () => {
      if (selector.value) {
        localStorage.setItem("automationSelectedDevice", selector.value);
        startStatusPolling(); // Start polling cycle when device is selected
      } else {
        stopStatusPolling(); // Stop if no device selected
      }
    });
  }

  if (selector) {
    try {
      const isAdmin = localStorage.getItem("connectApi_loggedIn") === "true";
      const guestApiKey = localStorage.getItem("noorbyte_session");
      // [MOD] Ensure api_key is passed even for admin role
      const query = isAdmin
        ? `?role=admin&api_key=${guestApiKey || ''}`
        : guestApiKey
          ? `?api_key=${guestApiKey}`
          : "";
      const response = await fetch(`${API_URL}/get-devices${query}`);
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

        // Restore previously selected device from localStorage
        const savedDevice = localStorage.getItem("automationSelectedDevice");
        if (savedDevice) {
          const matchOption = Array.from(selector.options).find(
            (o) => o.value === savedDevice,
          );
          if (matchOption && !matchOption.disabled) {
            selector.value = savedDevice;
          }
        }
      }
    } catch (error) {
      selector.innerHTML = '<option value="">Gagal memuat device.</option>';
    }
  }

  // ==========================================
  // 2. FUNGSI TERMINAL LOG
  // ==========================================
  const terminal = document.getElementById("terminalLog");
  let currentLogIndex = 0;
  let logQueue = [];
  let isDisplayingLog = false;
  let logTimeoutId = null;

  function processLogQueue() {
    if (logQueue.length === 0) {
      isDisplayingLog = false;
      return;
    }
    isDisplayingLog = true;
    const log = logQueue.shift();
    if (terminal) {
      terminal.innerHTML += `
                <div class="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <span class="text-slate-500">[${log.time}]</span>
                    <span class="${log.colorClass} font-bold">${log.label}:</span>
                    <span class="break-words flex-1">${log.text}</span>
                </div>
            `;
      terminal.scrollTop = terminal.scrollHeight;
    }
    logTimeoutId = setTimeout(processLogQueue, 1000);
  }

  function clearTerminal() {
    if (terminal) terminal.innerHTML = "";
    currentLogIndex = 0;
    logQueue = [];
    isDisplayingLog = false;
    if (logTimeoutId) {
      clearTimeout(logTimeoutId);
      logTimeoutId = null;
    }
  }

  const addLog = (colorClass, label, text) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    logQueue.push({ time, colorClass, label, text });
    if (!isDisplayingLog) {
      processLogQueue();
    }
    return Promise.resolve();
  };

  // Render backend logs into terminal
  function renderBackendLogs(logs) {
    if (!terminal) return;
    if (!logs || logs.length === 0) return;

    // Jika log dari backend lebih sedikit dari index kita (artinya reset)
    if (logs.length < currentLogIndex) {
      clearTerminal();
    }

    // Tambahkan log baru ke antrean
    for (let i = currentLogIndex; i < logs.length; i++) {
      logQueue.push(logs[i]);
    }

    currentLogIndex = logs.length;

    if (!isDisplayingLog && logQueue.length > 0) {
      processLogQueue();
    }
  }

  let cachedMessage = null;

  function formatPreviewText(text) {
    if (!text) return "";
    const lines = text.split("\n");
    if (lines.length <= 15) return text;

    const topLines = lines.slice(0, 8).join("\n");
    const bottomLines = lines.slice(-5).join("\n");
    return `${topLines}\n\n....\n...\n\n${bottomLines}`;
  }

  // ==========================================
  // 3. HELPER: Kumpulkan semua form data
  // ==========================================
  function getFormData() {
    return {
      api_key: selector ? selector.value : "",
      dp_api_url: (document.getElementById("dpApiUrl")?.value || "").replace(
        /\/$/,
        "",
      ),
      dp_email: document.getElementById("dpEmail")?.value || "",
      dp_password: document.getElementById("accountPassword")?.value || "",
      target_number: document.getElementById("targetNumber")?.value || "",
      fetch_time: document.getElementById("executionTime")?.value || "08:00",
      send_wa_time: document.getElementById("executionTime")?.value || "08:00",
      frequency:
        document.querySelector('input[name="frequency"]:checked')?.value ||
        "daily",
      start_date: document.getElementById("startDate")?.value || "",
      end_date: document.getElementById("endDate")?.value || "",
      custom_days: Array.from(
        document.querySelectorAll('input[name="customDay"]:checked'),
      ).map((el) => parseInt(el.value)),
      excluded_dates: Array.from(
        document.querySelectorAll("#excludedDatesList span"),
      ).map((el) => el.textContent),
      is_active: document.getElementById("scheduleToggle")?.checked || false,
    };
  }

  // ==========================================
  // 4. TOMBOL RUN Otomatis (Delegasi ke Backend)
  // ==========================================
  const btnRun = document.getElementById("btnRunAutomation");
  const runModal = document.getElementById("runAutomationModal");
  const cancelRunBtn = document.getElementById("cancelRunAutomationBtn");
  const confirmRunBtn = document.getElementById("confirmRunAutomationBtn");
  const runTimeInput = document.getElementById("runAutomationTime");

  if (btnRun && runModal) {
    btnRun.addEventListener("click", () => {
      const now = new Date();
      if (runTimeInput) {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        runTimeInput.value = `${hh}:${mm}`;
      }
      runModal.classList.remove("hidden");
    });

    if (cancelRunBtn) {
      cancelRunBtn.addEventListener("click", () => {
        runModal.classList.add("hidden");
      });
    }

    if (confirmRunBtn) {
      confirmRunBtn.addEventListener("click", async () => {
        const selectedTime = runTimeInput.value;
        if (!selectedTime) {
          showModal({
            title: "Peringatan",
            message: "Silakan pilih jam eksekusi terlebih dahulu.",
            type: "warning"
          });
          return;
        }

        const formData = getFormData();
        if (
          !formData.api_key ||
          !formData.dp_api_url ||
          !formData.dp_email ||
          !formData.dp_password
        ) {
          showModal({
            title: "Peringatan",
            message: "Lengkapi semua kredensial dan pilih device terlebih dahulu.",
            type: "warning"
          });
          return;
        }

        runModal.classList.add("hidden");

        // Save selected device
        localStorage.setItem("automationSelectedDevice", formData.api_key);

        btnRun.disabled = true;
        btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Menjadwalkan...`;
        clearTerminal();

        try {
          const res = await fetch(`${API_URL}/automation/run-manual`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${localStorage.getItem("noorbyte_session") || formData.api_key}`
            },
            body: JSON.stringify({
              api_key: formData.api_key,
              run_time: selectedTime,
              dp_api_url: formData.dp_api_url,
              dp_email: formData.dp_email,
              dp_password: formData.dp_password,
              target_number: formData.target_number,
            }),
          });

          const result = await res.json();
          if (result.status) {
            await addLog("text-emerald-400", "SERVER", result.message);
            await addLog(
              "text-purple-400",
              "INFO",
              "Eksekusi akan berjalan di server. Anda bisa menutup browser.",
            );
            showModal({ title: "Terjadwal ✅", message: result.message, type: "success" });
            // Start polling for status updates
            startStatusPolling();
          } else {
            throw new Error(result.message);
          }
        } catch (err) {
          await addLog("text-red-500", "ERROR", err.message);
          showModal({ title: "Gagal", message: err.message, type: "error" });
        }

        btnRun.disabled = false;
        btnRun.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span> Run Automation Now`;
      });
    }
  }

  // ==========================================
  // TOMBOL BATALKAN JADWAL AUTOMATION
  // ==========================================
  const btnCancelAutomation = document.getElementById("btnCancelAutomation");
  if (btnCancelAutomation) {
    btnCancelAutomation.addEventListener("click", async () => {
      const apiKey = (selector ? selector.value : "") || localStorage.getItem("automationSelectedDevice") || "";
      if (!apiKey) {
        showModal({ title: "Peringatan", message: "Pilih device terlebih dahulu sebelum membatalkan jadwal.", type: "warning" });
        return;
      }

      btnCancelAutomation.disabled = true;
      btnCancelAutomation.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">autorenew</span> Membatalkan...`;

      try {
        const res = await fetch(`${API_URL}/automation/cancel-manual`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("noorbyte_session") || apiKey}`
          },
          body: JSON.stringify({ api_key: apiKey }),
        });
        const result = await res.json();

        if (result.status) {
          // Reset btnRun ke mode normal
          if (btnRun) {
            btnRun.disabled = false;
            btnRun.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span> Run Automation Now`;
          }
          btnCancelAutomation.classList.add("hidden");
          await addLog("text-amber-400", "CANCELLED", result.message);
          showModal({ title: "Jadwal Dibatalkan ✅", message: result.message, type: "success" });
        } else {

          showModal({ title: "Gagal Batalkan", message: result.message, type: "error" });
          btnCancelAutomation.disabled = false;
          btnCancelAutomation.innerHTML = `<span class="material-symbols-outlined text-sm">cancel_schedule_send</span> Batalkan Jadwal`;
        }
      } catch (err) {
        showModal({ title: "Error", message: err.message, type: "error" });
        btnCancelAutomation.disabled = false;
        btnCancelAutomation.innerHTML = `<span class="material-symbols-outlined text-sm">cancel_schedule_send</span> Batalkan Jadwal`;
      }
    });
  }
  // ==========================================
  // 5. POLLING STATUS DARI BACKEND
  // ==========================================
  let statusPollInterval = null;

  function startStatusPolling() {
    if (statusPollInterval) clearInterval(statusPollInterval);
    pollStatus(true); // Initial load when starting polling
    statusPollInterval = setInterval(() => pollStatus(false), 10000); // Subsequent polls
  }

  function stopStatusPolling() {
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
  }

  async function pollStatus(isInitial = false) {
    // Priority: 1. Selector value, 2. localStorage (only if authenticated)
    let apiKey = selector ? selector.value : "";
    if (!apiKey) {
      apiKey = localStorage.getItem("automationSelectedDevice") || "";
    }

    // Safety check: Don't poll if no key
    if (!apiKey) return;

    // Bearer token from session
    const sessionToken = localStorage.getItem("noorbyte_session") || apiKey;

    try {
      const res = await fetch(`${API_URL}/automation/status?api_key=${apiKey}`, {
        headers: { "Authorization": `Bearer ${sessionToken}` }
      });
      const result = await res.json();

      let kpiData = null;
      try {
        const kpiRes = await fetch(
          `${API_URL}/automation/kpi?api_key=${apiKey}`,
          { headers: { "Authorization": `Bearer ${sessionToken}` } }
        );
        const kpiResult = await kpiRes.json();
        if (kpiResult.status && kpiResult.data) {
          kpiData = kpiResult.data;
        }
      } catch (err) {
        console.warn("Gagal fetch KPI:", err);
      }

      if (result.status && result.data) {
        const data = result.data;
        data.kpi = kpiData;

        // --- SUNTIKAN PENANGKAP REAL DATA KPI ---
        if (data.kpi) {
          // 1. Tangkap waktu terakhir jalan
          if (data.kpi.last_run) {
            lastRunDate = new Date(data.kpi.last_run);
            updateLastRunTimer(); // Langsung eksekusi ngitung ago
          }
          // 2. Tangkap Data Lainnya
          if (data.kpi.success_rate !== undefined) {
            document.getElementById("metricSuccessRate").innerText =
              `${data.kpi.success_rate}%`;
          }
          if (data.kpi.avg_latency !== undefined) {
            document.getElementById("metricLatency").innerText =
              `${data.kpi.avg_latency}s`;
          }
          if (data.kpi.data_processed !== undefined) {
            document.getElementById("metricData").innerText =
              `${data.kpi.data_processed} MB`;
          }
        }

        // Render backend logs into terminal (always, even on page reload)
        if (data.logs && data.logs.length > 0) {
          renderBackendLogs(data.logs);
        }

        // --- CONFIGURATION SYNC (Only on Initial Load or Device Change) ---
        if (isInitial) {
          // Restore schedule toggle from backend state
          const schedToggle = document.getElementById("scheduleToggle");
          if (schedToggle) {
            schedToggle.checked = !!data.is_active;
            updatePreviewUI(!!data.is_active);
          }

          // Restore execution time
          if (data.fetch_time && document.getElementById("executionTime")) {
            document.getElementById("executionTime").value = data.fetch_time;
          }

          // Restore Advanced Scheduling from backend
          if (data.start_date && document.getElementById("startDate")) {
            document.getElementById("startDate").value = data.start_date;
          }
          if (data.end_date && document.getElementById("endDate")) {
            document.getElementById("endDate").value = data.end_date;
          }
          if (data.frequency) {
            if (data.frequency === "weekdays")
              document.getElementById("freqWeekdays").checked = true;
            else if (data.frequency === "custom")
              document.getElementById("freqCustom").checked = true;
            else document.getElementById("freqDaily").checked = true;
            toggleCustomDays();
          }
          if (data.custom_days) {
            document.querySelectorAll('input[name="customDay"]').forEach((el) => {
              el.checked = data.custom_days.includes(parseInt(el.value));
            });
          }
          if (data.excluded_dates && excludedDatesList) {
            excludedDatesList.innerHTML = "";
            data.excluded_dates.forEach((dateStr) => {
              addExcludedDateBadge(dateStr);
            });
          }

          // Notifikasi Sinkronisasi Berhasil
          if (typeof showToast === 'function') {
            showToast("Konfigurasi disinkronkan dari server ✅", "success");
          }
        }

        // Update message preview from backend cached message
        if (data.cached_message) {
          cachedMessage = data.cached_message;
          const msgPreview = document.getElementById("messagePreview");
          if (msgPreview && !data.is_active) {
            msgPreview.innerText = formatPreviewText(data.cached_message);
          }
        }

        // Update button based on manual_run_status
        const btnCancelAutomation = document.getElementById("btnCancelAutomation");
        if (btnRun) {
          if (data.manual_run_status === "waiting") {
            btnRun.disabled = true;
            btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Menunggu ${data.manual_run_time || "..."}`;
            if (btnCancelAutomation) btnCancelAutomation.classList.remove("hidden");
          } else if (data.manual_run_status === "running") {
            btnRun.disabled = true;
            btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Executing...`;
            if (btnCancelAutomation) btnCancelAutomation.classList.add("hidden");
          } else {
            btnRun.disabled = false;
            btnRun.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span> Run Automation Now`;
            if (btnCancelAutomation) btnCancelAutomation.classList.add("hidden");
          }
        }
      }
    } catch (err) {
      console.warn("Poll status error:", err);
    }
  }

  // ==========================================
  // 6. LOGIC SCHEDULER TOGGLE (Preview UI only)
  // ==========================================
  function updatePreviewUI(isActive) {
    const msgPreview = document.getElementById("messagePreview");
    if (!msgPreview) return;

    if (isActive) {
      const execTime = document.getElementById("executionTime")?.value || "--:--";
      const isWeekdays = document.getElementById("freqWeekdays").checked
        ? " (Hari Kerja)"
        : "";

      msgPreview.innerText = `=========================
🤖 SISTEM OTOMATISASI DAILY REPORT DPARAGON AKTIF
🌐 Zona Waktu Server: Asia/Jakarta (WIB)
⏰ Jadwal${isWeekdays}: Jam Eksekusi (${execTime} WIB)
✅ EKSEKUSI BERJALAN DI SERVER (Aman tutup browser)
=========================

Mendeteksi waktu berjalan di backend...`;

      msgPreview.classList.add("text-primary", "font-bold");
      msgPreview.classList.remove("text-slate-700");
    } else {
      let fallbackText = `🔔 DAILY REPORT - DPARAGON
Period: ${new Date().toLocaleDateString("id-ID", { month: "long", day: "numeric", year: "numeric" })}

✅ Total Tasks: 0
✅ Completed: 0
⚠️ Pending: 0

Revenue Today: Rp 0
Occupancy Rate: 0%

(Sistem otomatisasi MATI. Klik Run Automation Now untuk manual)`;

      msgPreview.innerText = cachedMessage
        ? formatPreviewText(cachedMessage)
        : fallbackText;
      msgPreview.classList.remove("text-primary", "font-bold");
      msgPreview.classList.add("text-slate-700");
    }
  }

  // ==========================================
  // 6.5. AUTO-SAVE LOCAL INPUTS
  // ==========================================
  const autoSaveLocal = () => {
    const formData = getFormData();
    const localSettings = {
      dpApiUrl: formData.dp_api_url,
      dpEmail: formData.dp_email,
      dpPassword: formData.dp_password,
      scheduleEnabled: formData.is_active,
      fetchTime: formData.fetch_time,
      sendWaTime: formData.send_wa_time,
      frequency: formData.frequency,
      startDate: formData.start_date,
      endDate: formData.end_date,
      customDays: formData.custom_days,
      excludedDates: formData.excluded_dates,
      targetNumber: formData.target_number,
    };
    localStorage.setItem("noorbyteSettings", JSON.stringify(localSettings));
    if (formData.api_key) {
      localStorage.setItem("automationSelectedDevice", formData.api_key);
    }
  };

  // Bind autoSaveLocal to config inputs
  ["dpApiUrl", "dpEmail", "accountPassword", "targetNumber", "executionTime", "startDate", "endDate"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", autoSaveLocal);
      el.addEventListener("blur", autoSaveLocal);
    }
  });

  document.querySelectorAll('input[name="frequency"], input[name="customDay"]').forEach(el => {
    el.addEventListener("change", autoSaveLocal);
  });

  if (typeof selector !== "undefined" && selector) {
    selector.addEventListener("change", autoSaveLocal);
  }

  const toggleBtn = document.getElementById("scheduleToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("change", async (e) => {
      const isActive = e.target.checked;
      const formData = getFormData();

      // VALIDASI SEBELUM AKTIF
      if (isActive) {
        if (
          !formData.api_key ||
          !formData.dp_api_url ||
          !formData.dp_email ||
          !formData.dp_password ||
          !formData.target_number
        ) {
          e.target.checked = false; // Batalkan check
          updatePreviewUI(false);

          if (typeof showModal === 'function') {
            showModal({
              title: "Validasi Gagal",
              message: "Harap lengkapi DParagon API Configuration (URL, Email, Password) dan WhatsApp Configuration (Device, Target) terlebih dahulu sebelum mengaktifkan jadwal.",
              type: "error"
            });
          } else {
            showToast("Lengkapi konfigurasi!", "error");
          }
          return;
        }
      }

      updatePreviewUI(isActive);
      autoSaveLocal(); // Simpan state terbaru ke localStorage

      // Auto-save status to backend
      if (!formData.api_key) {
        return; // Should not hit here if isActive is true due to validation, but safe to keep for isActive=false
      }

      try {
        const res = await fetch(`${API_URL}/automation/save-settings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("noorbyte_session") || formData.api_key}`
          },
          body: JSON.stringify(formData),
        });
        const result = await res.json();
        if (result.status) {
          if (typeof showToast === 'function') {
            showToast(isActive ? "Otomatisasi Aktif 🚀" : "Otomatisasi Dimatikan 🛑", "success");
          }

          if (isActive) startStatusPolling();
          else stopStatusPolling();
        } else {
          if (typeof showToast === 'function') showToast("Gagal update status", "error");
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast("Error koneksi", "error");
      }
    });
  }

  // ==========================================
  // 7. SIMPAN SETTINGAN (Kirim ke Backend)
  // ==========================================
  const btnSaveSettings = document.getElementById("btnSaveSettings");

  // Load saved settings from localStorage
  function loadSavedSettings() {
    const savedSettings = JSON.parse(
      localStorage.getItem("noorbyteSettings"),
    );
    if (savedSettings) {
      if (document.getElementById("dpApiUrl") && savedSettings.dpApiUrl)
        document.getElementById("dpApiUrl").value = savedSettings.dpApiUrl;
      if (document.getElementById("dpEmail"))
        document.getElementById("dpEmail").value = savedSettings.dpEmail || "";
      if (document.getElementById("accountPassword"))
        document.getElementById("accountPassword").value =
          savedSettings.dpPassword || "";
      if (document.getElementById("scheduleToggle"))
        document.getElementById("scheduleToggle").checked =
          savedSettings.scheduleEnabled || false;
      if (document.getElementById("executionTime"))
        document.getElementById("executionTime").value =
          savedSettings.fetchTime || "08:00";

      if (savedSettings.frequency === "weekdays")
        document.getElementById("freqWeekdays").checked = true;
      else if (savedSettings.frequency === "custom")
        document.getElementById("freqCustom").checked = true;
      else document.getElementById("freqDaily").checked = true;

      // Restore Advanced Scheduling
      if (document.getElementById("startDate") && savedSettings.startDate)
        document.getElementById("startDate").value = savedSettings.startDate;
      if (document.getElementById("endDate"))
        document.getElementById("endDate").value = savedSettings.endDate || "";

      if (savedSettings.customDays) {
        document.querySelectorAll('input[name="customDay"]').forEach((el) => {
          el.checked = savedSettings.customDays.includes(parseInt(el.value));
        });
      }

      if (savedSettings.excludedDates && excludedDatesList) {
        excludedDatesList.innerHTML = "";
        savedSettings.excludedDates.forEach((dateStr) => {
          const badge = document.createElement("div");
          badge.className =
            "flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-outline rounded-full text-xs font-bold";
          badge.innerHTML = `
            <span>${dateStr}</span>
            <button type="button" class="text-slate-400 hover:text-red-500 flex items-center">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
          `;
          badge.querySelector("button").addEventListener("click", () => {
            badge.remove();
          });
          excludedDatesList.appendChild(badge);
        });
      }

      if (document.getElementById("targetNumber"))
        document.getElementById("targetNumber").value =
          savedSettings.targetNumber || "";
      if (savedSettings.scheduleEnabled) {
        updatePreviewUI(true);
      }

      toggleCustomDays();
    }
  }

  loadSavedSettings();

  // Save settings — send to backend AND localStorage
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      const formData = getFormData();

      if (!formData.api_key) {
        return showModal({
          title: "Peringatan",
          message: "Pilih device pengirim terlebih dahulu.",
          type: "warning"
        });
      }

      // Save selected device
      localStorage.setItem("automationSelectedDevice", formData.api_key);

      // Save to localStorage (for UI reload)
      const localSettings = {
        dpApiUrl: formData.dp_api_url,
        dpEmail: formData.dp_email,
        dpPassword: formData.dp_password,
        scheduleEnabled: formData.is_active,
        fetchTime: formData.fetch_time,
        sendWaTime: formData.send_wa_time,
        frequency: formData.frequency,
        startDate: formData.start_date,
        endDate: formData.end_date,
        customDays: formData.custom_days,
        excludedDates: formData.excluded_dates,
        targetNumber: formData.target_number,
      };
      localStorage.setItem("noorbyteSettings", JSON.stringify(localSettings));

      const originalText = btnSaveSettings.innerHTML;
      btnSaveSettings.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">autorenew</span> Saving...`;
      btnSaveSettings.disabled = true;

      try {
        // Send to backend for persistent execution
        const res = await fetch(`${API_URL}/automation/save-settings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("noorbyte_session") || formData.api_key}`
          },
          body: JSON.stringify(formData),
        });

        const result = await res.json();

        setTimeout(() => {
          btnSaveSettings.innerHTML = originalText;
          btnSaveSettings.disabled = false;

          if (result.status) {
            showModal({
              title: "Pengaturan Disimpan ✅",
              message: "Konfigurasi berhasil disimpan di server. Jadwal otomasi " +
                (formData.is_active
                  ? "AKTIF dan akan berjalan di background meskipun browser ditutup."
                  : "NONAKTIF."),
              type: "success"
            });
            updatePreviewUI(formData.is_active);

            if (formData.is_active) {
              startStatusPolling();
            } else {
              stopStatusPolling();
            }
          } else {
            showModal({
              title: "Gagal Simpan",
              message: result.message || "Gagal menyimpan ke server.",
              type: "error"
            });
          }
        }, 800);
      } catch (err) {
        setTimeout(() => {
          btnSaveSettings.innerHTML = originalText;
          btnSaveSettings.disabled = false;
          showModal({ title: "Gagal Simpan", message: `Error: ${err.message}`, type: "error" });
        }, 800);
      }
    });
  }

  // ==========================================
  // 10. KPI WIDGET LOGIC (REAL DATA)
  // ==========================================
  let lastRunDate = null; // Akan diisi otomatis dari Backend

  // Fungsi ini cuma buat ngitung selisih waktu aja ("X mins ago")
  function updateLastRunTimer() {
    if (!lastRunDate) return;

    const now = new Date();
    const diffMs = now - lastRunDate;
    const diffMins = Math.floor(diffMs / 60000);

    const metricLastRun = document.getElementById("metricLastRun");
    if (metricLastRun) {
      if (diffMins === 0) metricLastRun.innerText = "Just now";
      else if (diffMins >= 60)
        metricLastRun.innerText = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
      else metricLastRun.innerText = `${diffMins}m ago`;
    }
  }

  // Update tulisan waktu setiap 1 menit
  setInterval(updateLastRunTimer, 60000);

  // ==========================================
  // FINAL TRIGGER: Auto-sync on page load if device exists
  // ==========================================
  const initialDevice = localStorage.getItem("automationSelectedDevice");
  if (initialDevice) {
    startStatusPolling();
  }

  // ==========================================
  // 11. MANUAL TASK INPUT LOGIC
  // ==========================================
  const manualTaskModal = document.getElementById("manualTaskModal");
  const btnOpenTaskModal = document.getElementById("btnOpenTaskModal");
  const btnCloseTaskModal = document.getElementById("btnCloseTaskModal");
  const btnSubmitTask = document.getElementById("btnSubmitTask");
  const taskListContainer = document.getElementById("taskListContainer");
  const taskDateInput = document.getElementById("taskDateInput");
  const taskDescInput = document.getElementById("taskDescInput");

  let manualTasks = JSON.parse(localStorage.getItem("manualTasks") || "[]");

  function renderTasks() {
    if (!taskListContainer) return;
    if (manualTasks.length === 0) {
      taskListContainer.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs italic">Belum ada task manual.</div>';
      return;
    }

    taskListContainer.innerHTML = manualTasks.map((task, index) => `
      <div class="p-3 bg-slate-50 border border-outline rounded-lg flex justify-between items-start gap-3 group">
        <div class="flex-1">
          <p class="text-[10px] font-bold text-primary uppercase mb-0.5">${task.date}</p>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">${task.description}</p>
        </div>
        <button onclick="removeManualTask(${index})" class="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
          <span class="material-symbols-outlined text-lg">delete</span>
        </button>
      </div>
    `).join("");
  }

  window.removeManualTask = (index) => {
    manualTasks.splice(index, 1);
    localStorage.setItem("manualTasks", JSON.stringify(manualTasks));
    renderTasks();
  };

  // Initialize AirDatepicker (Optional Enhancement)
  let taskDatePicker;
  if (taskDateInput && typeof AirDatepicker !== 'undefined') {
    try {
      // English locale object definition (Manual fallback to avoid 'exports is not defined' error)
      const localeEn = {
        days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        today: 'Today',
        clear: 'Clear',
        dateFormat: 'yyyy-MM-dd',
        timeFormat: 'hh:mm aa',
        firstDay: 0
      };

      taskDatePicker = new AirDatepicker(taskDateInput, {
        locale: localeEn,
        range: true,
        multipleDatesSeparator: " - ",
        dateFormat: "yyyy-MM-dd",
        autoClose: true,
        // Positioning fix for modals
        position: 'bottom center',
      });
    } catch (e) {
      console.warn("Gagal inisialisasi AirDatepicker:", e);
    }
  }

  if (btnOpenTaskModal) {
    btnOpenTaskModal.addEventListener("click", () => {
      manualTaskModal.classList.remove("hidden");

      // Default date
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (taskDatePicker) {
        taskDatePicker.selectDate([today, tomorrow]);
      } else {
        // Fallback if datepicker fails
        const formatDate = (date) => date.toISOString().split('T')[0];
        taskDateInput.value = `${formatDate(today)} - ${formatDate(tomorrow)}`;
      }

      renderTasks();
    });
  }

  if (btnCloseTaskModal) {
    btnCloseTaskModal.addEventListener("click", () => {
      manualTaskModal.classList.add("hidden");
    });
  }

  if (btnSubmitTask) {
    btnSubmitTask.addEventListener("click", () => {
      const date = taskDateInput.value.trim();
      const description = taskDescInput.value.trim();

      if (!date || !description) {
        if (typeof showToast === 'function') showToast("Mohon isi semua field", "warning");
        return;
      }

      manualTasks.push({ date, description });
      localStorage.setItem("manualTasks", JSON.stringify(manualTasks));

      taskDescInput.value = "";
      if (taskDatePicker) {
        taskDatePicker.clear();
      } else {
        taskDateInput.value = "";
      }
      renderTasks();

      if (typeof showToast === 'function') showToast("Task berhasil ditambahkan", "success");
    });
  }
});


// showModal is now provided globally by sidebar.js

