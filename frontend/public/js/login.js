// ==========================================
// FUNGSI MODAL MAGIC LINK
// ==========================================
function showLoginModal(title, message, isError = false) {
  const modal = document.getElementById("loginModal");
  const content = document.getElementById("loginModalContent");
  const titleEl = document.getElementById("loginModalTitle");
  const msgEl = document.getElementById("loginModalMessage");
  const iconBox = document.getElementById("loginModalIconBox");
  const icon = document.getElementById("loginModalIcon");

  titleEl.innerText = title;
  msgEl.innerText = message;

  if (isError) {
    iconBox.className =
      "mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-50 mb-6";
    icon.className = "material-symbols-outlined text-3xl text-red-500";
    icon.innerText = "error";
  } else {
    iconBox.className =
      "mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-50 mb-6";
    icon.className = "material-symbols-outlined text-3xl text-green-500";
    icon.innerText = "check_circle";
  }

  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.classList.remove("opacity-0");
    content.classList.remove("scale-95");
  }, 10);
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  const content = document.getElementById("loginModalContent");
  modal.classList.add("opacity-0");
  content.classList.add("scale-95");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);
}

// ==========================================
// FUNGSI MODAL ADMIN
// ==========================================
function showAdminModal() {
  const modal = document.getElementById("adminModal");
  const content = document.getElementById("adminModalContent");
  const input = document.getElementById("adminPasswordInput");
  const errorMsg = document.getElementById("adminErrorMsg");

  // Reset kondisi form setiap kali dibuka
  input.value = "";
  input.classList.remove(
    "border-red-500",
    "focus:border-red-500",
    "focus:ring-red-500/20",
  );
  errorMsg.classList.add("hidden");

  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.classList.remove("opacity-0");
    content.classList.remove("scale-95");
    input.focus(); // Otomatis aktifkan kursor ke kotak password
  }, 10);
}

function closeAdminModal() {
  const modal = document.getElementById("adminModal");
  const content = document.getElementById("adminModalContent");
  modal.classList.add("opacity-0");
  content.classList.add("scale-95");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);
}

// ==========================================
// EVENT LISTENER UTAMA
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Logic untuk Form WhatsApp (Magic Link)
  const loginForm = document.getElementById("loginForm");
  const waNumber = document.getElementById("waNumber");
  const btnWaLogin = document.getElementById("btnWaLogin");
  const loginIcon = document.getElementById("loginIcon");
  const loginText = document.getElementById("loginText");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const phoneVal = waNumber.value.trim();
      if (!phoneVal)
        return showLoginModal(
          "Perhatian",
          "Masukkan nomor WhatsApp Anda terlebih dahulu.",
          true,
        );

      btnWaLogin.disabled = true;
      loginText.innerText = "Sending Link...";
      loginIcon.innerText = "hourglass_empty";
      loginIcon.classList.add("animate-spin");

      try {
        const response = await fetch(
          "http://localhost:3000/api/auth/magic-link",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: phoneVal }),
          },
        );

        const result = await response.json();

        if (response.ok && result.status) {
          loginText.innerText = "Link Sent! Check WA.";
          loginIcon.classList.remove("animate-spin");
          loginIcon.innerText = "mark_email_read";
          btnWaLogin.classList.replace("bg-primary", "bg-green-500");

          showLoginModal(
            "Cek WhatsApp Anda",
            "Magic Link berhasil dikirim! Silakan klik tautan di dalam pesan WhatsApp untuk masuk ke Dashboard.",
          );
        } else {
          throw new Error(result.message || "Gagal mengirim link.");
        }
      } catch (error) {
        showLoginModal("Gagal Mengirim", error.message, true);
        loginText.innerText = "Get Magic Link";
        loginIcon.classList.remove("animate-spin");
        loginIcon.innerText = "send";
        btnWaLogin.disabled = false;
      }
    });
  }

  // 2. Logic untuk Quick Admin Access
  const btnAdminLogin = document.getElementById("btnAdminLogin");
  const btnSubmitAdmin = document.getElementById("btnSubmitAdmin");
  const adminPasswordInput = document.getElementById("adminPasswordInput");
  const adminErrorMsg = document.getElementById("adminErrorMsg");

  // Buka Modal Saat Tombol Hitam Diklik
  if (btnAdminLogin) {
    btnAdminLogin.addEventListener("click", () => {
      showAdminModal();
    });
  }

  // Proses Verifikasi Password Admin
  if (btnSubmitAdmin) {
    const processAdminLogin = () => {
      const pwd = adminPasswordInput.value;

      if (pwd === "grupturok22") {
        // Password Benar -> Efek Sukses & Redirect
        adminErrorMsg.classList.add("hidden");
        btnSubmitAdmin.disabled = true;
        btnSubmitAdmin.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">autorenew</span>`;
        btnSubmitAdmin.classList.replace("bg-slate-900", "bg-green-500");

        setTimeout(() => {
          localStorage.setItem("connectApi_loggedIn", "true");
          window.location.href = "/dashboard";
        }, 800);
      } else {
        // Password Salah -> Efek Error Merah
        adminErrorMsg.classList.remove("hidden");
        adminPasswordInput.classList.add(
          "border-red-500",
          "focus:border-red-500",
          "focus:ring-red-500/20",
        );

        // Animasi Goyang (Shake) kecil
        adminPasswordInput.style.transform = "translateX(-5px)";
        setTimeout(
          () => (adminPasswordInput.style.transform = "translateX(5px)"),
          50,
        );
        setTimeout(
          () => (adminPasswordInput.style.transform = "translateX(0)"),
          100,
        );

        // Hapus efek merah begitu user mulai ngetik lagi
        adminPasswordInput.addEventListener("input", function removeError() {
          adminErrorMsg.classList.add("hidden");
          adminPasswordInput.classList.remove(
            "border-red-500",
            "focus:border-red-500",
            "focus:ring-red-500/20",
          );
          adminPasswordInput.removeEventListener("input", removeError);
        });
      }
    };

    // Trigger saat klik tombol Otorisasi
    btnSubmitAdmin.addEventListener("click", processAdminLogin);

    // Trigger saat menekan tombol Enter di keyboard
    adminPasswordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        processAdminLogin();
      }
    });
  }
});
