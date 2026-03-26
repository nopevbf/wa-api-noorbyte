// Fungsi untuk memunculkan Modal Interaktif
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
  // Sedikit delay untuk memicu animasi transisi Tailwind
  setTimeout(() => {
    modal.classList.remove("opacity-0");
    content.classList.remove("scale-95");
  }, 10);
}

// Fungsi untuk menutup Modal
function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  const content = document.getElementById("loginModalContent");

  modal.classList.add("opacity-0");
  content.classList.add("scale-95");

  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);
}

document.addEventListener("DOMContentLoaded", () => {
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

          // Panggil Modal Sukses
          showLoginModal(
            "Cek WhatsApp Anda",
            "Magic Link berhasil dikirim! Silakan klik tautan di dalam pesan WhatsApp untuk masuk ke Dashboard.",
          );
        } else {
          throw new Error(result.message || "Gagal mengirim link.");
        }
      } catch (error) {
        // Panggil Modal Error
        showLoginModal("Gagal Mengirim", error.message, true);

        loginText.innerText = "Get Magic Link";
        loginIcon.classList.remove("animate-spin");
        loginIcon.innerText = "send";
        btnWaLogin.disabled = false;
      }
    });
  }

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
