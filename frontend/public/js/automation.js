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
  // 1. INIT DEVICES DROPDOWN
  // ==========================================
  const selector = document.getElementById("deviceSelector");
  if (selector) {
    try {
      const isAdmin = localStorage.getItem('connectApi_loggedIn') === 'true';
      const guestApiKey = localStorage.getItem('noorbyte_session');
      const query = isAdmin ? '?role=admin' : (guestApiKey ? `?api_key=${guestApiKey}` : '');
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
          const matchOption = Array.from(selector.options).find(o => o.value === savedDevice);
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
      terminal.scrollTop = terminal.scrollHeight;
    }
    return Promise.resolve();
  };

  // Render backend logs into terminal
  function renderBackendLogs(logs) {
    if (!terminal) return;
    terminal.innerHTML = "";
    if (!logs || logs.length === 0) return;
    logs.forEach((log) => {
      terminal.innerHTML += `
                <div class="flex gap-3">
                    <span class="text-slate-500">[${log.time}]</span>
                    <span class="${log.colorClass} font-bold">${log.label}:</span>
                    <span class="break-words flex-1">${log.text}</span>
                </div>
            `;
    });
    terminal.scrollTop = terminal.scrollHeight;
  }

  let cachedMessage = null;

  function formatPreviewText(text) {
    if (!text) return "";
    const lines = text.split('\n');
    if (lines.length <= 15) return text;
    
    const topLines = lines.slice(0, 8).join('\n');
    const bottomLines = lines.slice(-5).join('\n');
    return `${topLines}\n\n....\n...\n\n${bottomLines}`;
  }

  // ==========================================
  // 3. HELPER: Kumpulkan semua form data
  // ==========================================
  function getFormData() {
    return {
      api_key: selector ? selector.value : "",
      dp_api_url: (document.getElementById("dpApiUrl")?.value || "").replace(/\/$/, ""),
      dp_email: document.getElementById("dpEmail")?.value || "",
      dp_password: document.getElementById("accountPassword")?.value || "",
      target_number: document.getElementById("targetNumber")?.value || "",
      fetch_time: document.getElementById("fetchTime")?.value || "08:00",
      send_wa_time: document.getElementById("sendWaTime")?.value || "09:00",
      frequency: document.querySelector('input[name="frequency"]:checked')?.value || "daily",
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
        runTimeInput.value = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
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
          showModal("Peringatan", "Silakan pilih jam eksekusi terlebih dahulu.");
          return;
        }

        const formData = getFormData();
        if (!formData.api_key || !formData.dp_api_url || !formData.dp_email || !formData.dp_password) {
          showModal("Peringatan", "Lengkapi semua kredensial dan pilih device terlebih dahulu.");
          return;
        }

        runModal.classList.add("hidden");

        // Save selected device
        localStorage.setItem("automationSelectedDevice", formData.api_key);

        btnRun.disabled = true;
        btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Menjadwalkan...`;
        if (terminal) terminal.innerHTML = "";

        try {
          const res = await fetch(`${API_URL}/automation/run-manual`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
            await addLog("text-purple-400", "INFO", "Eksekusi akan berjalan di server. Anda bisa menutup browser.");
            showModal("Terjadwal ✅", result.message);
            // Start polling for status updates
            startStatusPolling();
          } else {
            throw new Error(result.message);
          }
        } catch (err) {
          await addLog("text-red-500", "ERROR", err.message);
          showModal("Gagal", err.message);
        }

        btnRun.disabled = false;
        btnRun.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span> Run Automation Now`;
      });
    }
  }

  // ==========================================
  // 5. POLLING STATUS DARI BACKEND
  // ==========================================
  let statusPollInterval = null;

  function startStatusPolling() {
    if (statusPollInterval) clearInterval(statusPollInterval);
    pollStatus(); // Run immediately
    statusPollInterval = setInterval(pollStatus, 10000); // Poll every 10s
  }

  function stopStatusPolling() {
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
  }

  async function pollStatus() {
    // Try selector value first, fallback to localStorage
    let apiKey = selector ? selector.value : "";
    if (!apiKey) {
      apiKey = localStorage.getItem("automationSelectedDevice") || "";
    }
    if (!apiKey) return;

    try {
      const res = await fetch(`${API_URL}/automation/status?api_key=${apiKey}`);
      const result = await res.json();
      if (result.status && result.data) {
        const data = result.data;

        // Render backend logs into terminal (always, even on page reload)
        if (data.logs && data.logs.length > 0) {
          renderBackendLogs(data.logs);
        }

        // Restore schedule toggle from backend state
        const schedToggle = document.getElementById("scheduleToggle");
        if (schedToggle && data.is_active && !schedToggle.checked) {
          schedToggle.checked = true;
          updatePreviewUI(true);
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
        if (btnRun) {
          if (data.manual_run_status === "waiting") {
            btnRun.disabled = true;
            btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Menunggu ${data.manual_run_time || "..."}`;
          } else if (data.manual_run_status === "running") {
            btnRun.disabled = true;
            btnRun.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span> Executing...`;
          } else {
            btnRun.disabled = false;
            btnRun.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span> Run Automation Now`;
          }
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }

  // ==========================================
  // 6. LOGIC SCHEDULER TOGGLE (Preview UI only)
  // ==========================================
  function updatePreviewUI(isActive) {
    const msgPreview = document.getElementById("messagePreview");
    if (!msgPreview) return;

    if (isActive) {
      const fetchTime = document.getElementById("fetchTime").value || "--:--";
      const sendTime = document.getElementById("sendWaTime").value || "--:--";
      const isWeekdays = document.getElementById("freqWeekdays").checked
        ? " (Hari Kerja)"
        : "";

      msgPreview.innerText = `=========================
🤖 SISTEM OTOMATISASI DAILY REPORT DPARAGON AKTIF
🌍 Zona Waktu Server: Asia/Jakarta (WIB)
⏰ Jadwal${isWeekdays}: Tarik Data (${fetchTime} WIB) --> Kirim WA (${sendTime} WIB)
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

      msgPreview.innerText = cachedMessage ? formatPreviewText(cachedMessage) : fallbackText;
      msgPreview.classList.remove("text-primary", "font-bold");
      msgPreview.classList.add("text-slate-700");
    }
  }

  const toggleBtn = document.getElementById("scheduleToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("change", (e) => {
      updatePreviewUI(e.target.checked);
    });
  }

  // ==========================================
  // 7. SIMPAN SETTINGAN (Kirim ke Backend)
  // ==========================================
  const btnSaveSettings = document.getElementById("btnSaveSettings");
  const fetchTimeInput = document.getElementById("fetchTime");
  const sendWaTimeInput = document.getElementById("sendWaTime");
  const toggleScheduleInput = document.getElementById("scheduleToggle");
  const scheduleWarningMsg = document.getElementById("scheduleWarningMsg");

  function validateScheduleTimes() {
    if (
      !fetchTimeInput ||
      !sendWaTimeInput ||
      !toggleScheduleInput ||
      !scheduleWarningMsg
    )
      return true;

    const isEnabled = toggleScheduleInput.checked;
    const fetchT = fetchTimeInput.value;
    const sendT = sendWaTimeInput.value;

    if (isEnabled && fetchT === sendT) {
      scheduleWarningMsg.classList.remove("hidden");
      fetchTimeInput.classList.add(
        "border-red-500", "bg-red-50/50", "text-red-600",
        "focus:border-red-500", "focus:ring-red-500/20",
      );
      sendWaTimeInput.classList.add(
        "border-red-500", "bg-red-50/50", "text-red-600",
        "focus:border-red-500", "focus:ring-red-500/20",
      );
      return false;
    } else {
      scheduleWarningMsg.classList.add("hidden");
      fetchTimeInput.classList.remove(
        "border-red-500", "bg-red-50/50", "text-red-600",
        "focus:border-red-500", "focus:ring-red-500/20",
      );
      sendWaTimeInput.classList.remove(
        "border-red-500", "bg-red-50/50", "text-red-600",
        "focus:border-red-500", "focus:ring-red-500/20",
      );
      return true;
    }
  }

  if (fetchTimeInput) fetchTimeInput.addEventListener("input", validateScheduleTimes);
  if (sendWaTimeInput) sendWaTimeInput.addEventListener("input", validateScheduleTimes);
  if (toggleScheduleInput) toggleScheduleInput.addEventListener("change", validateScheduleTimes);

  // Load saved settings from localStorage
  function loadSavedSettings() {
    const savedSettings = JSON.parse(localStorage.getItem("connectApiSettings"));
    if (savedSettings) {
      if (document.getElementById("dpApiUrl") && savedSettings.dpApiUrl)
        document.getElementById("dpApiUrl").value = savedSettings.dpApiUrl;
      if (document.getElementById("dpEmail"))
        document.getElementById("dpEmail").value = savedSettings.dpEmail || "";
      if (document.getElementById("accountPassword"))
        document.getElementById("accountPassword").value = savedSettings.dpPassword || "";
      if (document.getElementById("scheduleToggle"))
        document.getElementById("scheduleToggle").checked = savedSettings.scheduleEnabled || false;
      if (document.getElementById("fetchTime"))
        document.getElementById("fetchTime").value = savedSettings.fetchTime || "08:00";
      if (document.getElementById("sendWaTime"))
        document.getElementById("sendWaTime").value = savedSettings.sendWaTime || "09:00";
      if (savedSettings.frequency === "weekdays")
        document.getElementById("freqWeekdays").checked = true;
      else document.getElementById("freqDaily").checked = true;
      if (document.getElementById("targetNumber"))
        document.getElementById("targetNumber").value = savedSettings.targetNumber || "";
      if (savedSettings.scheduleEnabled) {
        updatePreviewUI(true);
      }
    }
    validateScheduleTimes();
  }

  loadSavedSettings();

  // Save settings — send to backend AND localStorage
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      if (!validateScheduleTimes()) {
        return showModal(
          "Peringatan Jadwal",
          "Waktu Tarik Data dan Kirim WA bentrok! Silakan beri jeda minimal 1 menit sebelum menyimpan pengaturan.",
        );
      }

      const formData = getFormData();

      if (!formData.api_key) {
        return showModal("Peringatan", "Pilih device pengirim terlebih dahulu.");
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
        targetNumber: formData.target_number,
      };
      localStorage.setItem("connectApiSettings", JSON.stringify(localSettings));

      const originalText = btnSaveSettings.innerHTML;
      btnSaveSettings.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">autorenew</span> Saving...`;
      btnSaveSettings.disabled = true;

      try {
        // Send to backend for persistent execution
        const res = await fetch(`${API_URL}/automation/save-settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const result = await res.json();

        setTimeout(() => {
          btnSaveSettings.innerHTML = originalText;
          btnSaveSettings.disabled = false;

          if (result.status) {
            showModal(
              "Pengaturan Disimpan ✅",
              "Konfigurasi berhasil disimpan di server. Jadwal otomasi " +
              (formData.is_active
                ? "AKTIF dan akan berjalan di background meskipun browser ditutup."
                : "NONAKTIF."),
            );
            updatePreviewUI(formData.is_active);

            if (formData.is_active) {
              startStatusPolling();
            } else {
              stopStatusPolling();
            }
          } else {
            showModal("Gagal Simpan", result.message || "Gagal menyimpan ke server.");
          }
        }, 800);
      } catch (err) {
        setTimeout(() => {
          btnSaveSettings.innerHTML = originalText;
          btnSaveSettings.disabled = false;
          showModal("Gagal Simpan", `Error: ${err.message}`);
        }, 800);
      }
    });
  }

  // ==========================================
  // 8. ON LOAD: Fetch existing backend status
  // ==========================================
  // When device selector changes, save selection and poll status
  if (selector) {
    selector.addEventListener("change", () => {
      if (selector.value) {
        localStorage.setItem("automationSelectedDevice", selector.value);
      }
      pollStatus();
    });
  }

  // ALWAYS try to restore state from backend on page load
  // This ensures logs, button state, and preview are never lost
  setTimeout(() => {
    const savedDevice = localStorage.getItem("automationSelectedDevice");
    const currentDevice = selector ? selector.value : "";
    if (currentDevice || savedDevice) {
      startStatusPolling();
    }
  }, 1000);
});

function showModal(title, message) {
  const titleEl = document.getElementById("modalTitle");
  const messageEl = document.getElementById("modalMessage");
  const modalEl = document.getElementById("globalModal");
  if (titleEl) titleEl.innerText = title;
  if (messageEl) messageEl.innerHTML = message;
  if (modalEl) modalEl.classList.remove("hidden");
}
