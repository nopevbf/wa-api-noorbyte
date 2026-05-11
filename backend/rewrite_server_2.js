const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// The string to remove
const oldJailbreakBlock = `// ==========================================
// ENDPOINT: TRIGGER SCRAPER (DIPANGGIL SETELAH LOGIN SUKSES)
// ==========================================
app.post("/api/jailbreak/execute", async (req, res) => {
  try {
    const { env, email, password, fullName } = req.body;

    console.log(\`[TRIGGER] 🚀 Menerima perintah Bypass untuk: \${fullName}\`);

    if (!env || !email || !password || !fullName) {
      console.error("[TRIGGER] ❌ Data tidak lengkap!");
      return res
        .status(400)
        .json({ status: false, message: "Payload Incomplete" });
    }

    // JALANKAN DI BACKGROUND (Tanpa await biar Frontend gak nungguin)
    scrapeDparagonAttendance(env, email, password, fullName, 1)
      .then(() =>
        console.log(\`[SYSTEM] ✅ Auto-scrape sukses untuk \${fullName}\`),
      )
      .catch((err) => console.error(\`[SYSTEM] ❌ Auto-scrape gagal:\`, err));

    res.json({ status: true, message: "Engine Started in Background" });
  } catch (error) {
    console.error("Execute Route Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});`;

content = content.replace(oldJailbreakBlock, '');
fs.writeFileSync('server.js', content);
console.log('Fixed duplicate jailbreak endpoint');
