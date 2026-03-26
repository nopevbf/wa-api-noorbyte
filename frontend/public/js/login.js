document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const waNumber = document.getElementById("waNumber");
  const btnWaLogin = document.getElementById("btnWaLogin");
  const loginIcon = document.getElementById("loginIcon");
  const loginText = document.getElementById("loginText");

  // 1. Logic untuk Form WhatsApp (Magic Link Simulation)
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      if (!waNumber.value)
        return alert("Masukkan nomor WhatsApp terlebih dahulu.");

      // Ubah tombol jadi loading
      btnWaLogin.disabled = true;
      loginText.innerText = "Sending Link...";
      loginIcon.innerText = "hourglass_empty";
      loginIcon.classList.add("animate-spin");

      // Simulasi proses API (delay 1.5 detik)
      setTimeout(() => {
        loginText.innerText = "Redirecting...";
        loginIcon.classList.remove("animate-spin");
        loginIcon.innerText = "check_circle";
        btnWaLogin.classList.replace("bg-primary", "bg-green-500");

        // Redirect ke Dashboard setelah delay sedikit
        setTimeout(() => {
          // Simpan status login di localStorage (opsional, untuk nahan state)
          localStorage.setItem("connectApi_loggedIn", "true");
          window.location.href = "/dashboard";
        }, 1000);
      }, 1500);
    });
  }

  // 2. Logic untuk Quick Admin Access
  const btnAdminLogin = document.getElementById("btnAdminLogin");
  if (btnAdminLogin) {
    btnAdminLogin.addEventListener("click", () => {
      btnAdminLogin.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">autorenew</span> Authenticating...`;
      btnAdminLogin.disabled = true;

      setTimeout(() => {
        localStorage.setItem("connectApi_loggedIn", "true");
        window.location.href = "/dashboard";
      }, 800);
    });
  }
});
