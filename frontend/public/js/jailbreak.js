document.addEventListener("DOMContentLoaded", async () => {
  // 0. UI Elements for Auth
  const authModal = document.getElementById('dparagonAuthModal');
  const authContent = document.getElementById('dparagonAuthContent');
  const authForm = document.getElementById('dparagonForm');
  const btnSubmit = document.getElementById('btnDpSubmit');
  const loadingArea = document.getElementById('dpLoadingText');
  const processLog = document.getElementById('dpProcessLog');
  const progressBar = document.getElementById('dpProgressBar');
  const btnBypassAbsen = document.getElementById('btnBypassAbsen');

  let defaultDparagonApiUrl = "";

  /**
   * Helper to show Jailbreak Login Modal
   */
  function showJailbreakLoginModal() {
    if (authModal) {
      authModal.classList.remove('hidden');
      authModal.classList.add('flex');
      if (authContent) {
        setTimeout(() => {
          authContent.classList.remove('scale-95', 'opacity-0');
          authContent.classList.add('scale-100', 'opacity-100');
        }, 10);
      }
    }
  }

  // 1. Fetch App Config for Default URL
  try {
    const configRes = await fetch("/api/app-config");
    const configData = await configRes.json();

    if (configData.status && configData.data) {
      defaultDparagonApiUrl = configData.data.dparagonApiUrl || "";

      const envBadge = document.getElementById("envBadge");
      if (envBadge) {
        const env = configData.data.env || "development";
        const isDev = env !== "production";

        envBadge.textContent = isDev ? "DEV_NODE" : "PROD_NODE";
        envBadge.classList.remove("hidden");

        if (isDev) {
          envBadge.classList.add("bg-yellow-500/10", "text-yellow-500", "border", "border-yellow-500/30");
        } else {
          envBadge.classList.add("bg-emerald-500/10", "text-emerald-500", "border", "border-emerald-500/30");
        }
      }

      const dpApiUrlInput = document.getElementById("dpApiUrl");
      if (dpApiUrlInput && !dpApiUrlInput.value) {
        dpApiUrlInput.value = defaultDparagonApiUrl;
      }
    }
  } catch (e) {
    console.warn("Gagal memuat app config:", e.message);
  }

  // 2. Button Bypass Absen Listener
  if (btnBypassAbsen) {
    btnBypassAbsen.addEventListener('click', () => {
      if (typeof isJailbreakSessionValid === 'function' && isJailbreakSessionValid()) {
        window.location.href = '/jailbreak/checkin';
      } else {
        showJailbreakLoginModal();
      }
    });
  }

  // 3. Handle Submit Form
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dpUrl = document.getElementById('dpApiUrl').value;
      const email = document.getElementById('dpEmail').value;
      const password = document.getElementById('dpPassword').value;

      btnSubmit.classList.add('hidden');
      loadingArea.classList.remove('hidden');
      loadingArea.classList.add('flex');

      document.getElementById('dpEmail').disabled = true;
      document.getElementById('dpPassword').disabled = true;

      progressBar.style.width = '20%';
      progressBar.classList.remove('bg-green-500');
      progressBar.classList.add('bg-error');
      processLog.classList.remove('text-green-500');
      processLog.classList.add('text-error');
      processLog.innerText = `[WAIT] ESTABLISHING SECURE CONNECTION...`;

      try {
        setTimeout(() => { progressBar.style.width = '60%'; }, 500);
        processLog.innerText = `[WAIT] VERIFYING CREDENTIALS ON TARGET NODE...`;

        const baseUrl = dpUrl.replace(/\/$/, '');
        const targetEndpoint = `${baseUrl}/login`;

        const response = await fetch(targetEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (response.ok && result.message === "Login success") {
          if (typeof updateJailbreakActivity === 'function') updateJailbreakActivity(true);

          progressBar.style.width = '100%';
          processLog.innerText = `[SUCCESS] ACCESS GRANTED.`;
          processLog.classList.remove('text-error');
          processLog.classList.add('text-green-500');
          progressBar.classList.replace('bg-error', 'bg-green-500');

          // Save tokens
          let token = result.payload?.access_token || result.token || "";
          if (token) {
            localStorage.setItem('dparagon_token', token);
            localStorage.setItem('access_token', token);
          }

          // Save user info
          let extractedName = result.payload?.user?.full_name || "";
          if (extractedName) {
            localStorage.setItem('full_name', extractedName);
            const apiInputUrl = document.getElementById('dpApiUrl').value || "";
            const detectedEnv = apiInputUrl.includes('dparagon6') ? 'dev' : 'prod';
            localStorage.setItem('active_env', detectedEnv);
          }

          // Trigger background automation
          fetch('/api/jailbreak/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              env: localStorage.getItem('active_env') || 'prod',
              email: email,
              password: password
            })
          }).catch(err => console.error("Gagal trigger background execution:", err));

          setTimeout(() => {
            window.location.href = '/jailbreak/checkin';
          }, 1500);
        } else {
          throw new Error(result.message || "Authentication failed");
        }
      } catch (err) {
        console.error("Auth Error:", err);
        progressBar.style.width = '100%';
        processLog.innerText = `[ERROR] ${err.message.toUpperCase()}`;
        
        setTimeout(() => {
          btnSubmit.classList.remove('hidden');
          loadingArea.classList.add('hidden');
          loadingArea.classList.remove('flex');
          document.getElementById('dpEmail').disabled = false;
          document.getElementById('dpPassword').disabled = false;
          progressBar.style.width = '0%';
        }, 2000);
      }
    });
  }

  // Socket.io for Security Logs
  const logContainer = document.getElementById("jailbreakLogContainer");
  const socket = typeof io !== "undefined" ? io() : null;

  if (socket) {
    socket.on("security_log", (data) => {
      if (!logContainer) return;

      let msgColor = "text-slate-300";
      if (data.type === "error") msgColor = "text-error font-bold";
      if (data.type === "success") msgColor = "text-emerald-400";
      if (data.type === "warning") msgColor = "text-yellow-400";

      const logHtml = `
                <div class="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 border-b border-slate-800/50 pb-2 md:pb-3">
                    <span class="text-error shrink-0">[${data.timestamp}]</span>
                    <span class="${msgColor}">${data.message}</span>
                </div>
            `;

      logContainer.insertAdjacentHTML("beforeend", logHtml);
      logContainer.scrollTop = logContainer.scrollHeight;
    });
  }
});
