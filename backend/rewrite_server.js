const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// Replace port killing logic
const errorBlockOld = `  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(\`⚠️  [BACKEND] Port \${port} sedang dipakai! Mencoba kill proses lama...\`);

      const { exec } = require("child_process");
      const isWin = process.platform === "win32";

      // Cari PID yang nempel di port tersebut
      const findCmd = isWin
        ? \`netstat -ano | findstr :\${port} | findstr LISTENING\`
        : \`lsof -ti :\${port}\`;

      exec(findCmd, (findErr, stdout) => {
        if (findErr || !stdout.trim()) {
          console.error(\`❌ [BACKEND] Gagal menemukan proses di port \${port}. Matikan manual lalu coba lagi.\`);
          process.exit(1);
        }

        // Extract PID
        let pid;
        if (isWin) {
          // Format netstat Windows: "  TCP    0.0.0.0:4000    0.0.0.0:0    LISTENING    12345"
          const parts = stdout.trim().split(/\\s+/);
          pid = parts[parts.length - 1];
        } else {
          pid = stdout.trim().split("\\n")[0];
        }

        if (!pid || isNaN(pid)) {
          console.error(\`❌ [BACKEND] PID tidak valid. Matikan proses di port \${port} secara manual.\`);
          process.exit(1);
        }

        console.log(\`🔪 [BACKEND] Killing PID \${pid} yang menguasai port \${port}...\`);
        const killCmd = isWin ? \`taskkill /PID \${pid} /F\` : \`kill -9 \${pid}\`;

        exec(killCmd, (killErr) => {
          if (killErr) {
            console.error(\`❌ [BACKEND] Gagal kill PID \${pid}:\`, killErr.message);
            process.exit(1);
          }

          console.log(\`✅ [BACKEND] PID \${pid} berhasil dimatikan. Restart server dalam 1 detik...\`);
          setTimeout(() => startServer(port), 1000);
        });
      });
    } else {
      console.error("❌ [BACKEND] Server error:", err);
      process.exit(1);
    }
  });`;

const errorBlockNew = `  server.on("error", async (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(\`⚠️  [BACKEND] Port \${port} sedang dipakai! Mencoba kill proses lama...\`);
      const { killPortProcess } = require("./src/helpers/portKiller");
      
      try {
        const killed = await killPortProcess(port);
        if (killed) {
          console.log(\`✅ [BACKEND] Proses di port \${port} berhasil dimatikan. Restart server dalam 1 detik...\`);
          setTimeout(() => startServer(port), 1000);
        } else {
          console.error(\`❌ [BACKEND] Gagal menemukan proses di port \${port}. Matikan manual lalu coba lagi.\`);
          process.exit(1);
        }
      } catch (killErr) {
        console.error(\`❌ [BACKEND] Gagal mematikan proses di port \${port}:\`, killErr.message);
        process.exit(1);
      }
    } else {
      console.error("❌ [BACKEND] Server error:", err);
      process.exit(1);
    }
  });`;

content = content.replace(errorBlockOld, errorBlockNew);

let lines = content.split('\n');

const startIndex = lines.findIndex(l => l.includes('const {') && lines[lines.indexOf(l)+1].includes('scrapeDparagonAttendance'));
const endIndex = lines.findIndex(l => l.includes('res.status(500).json({ status: false, message: "Server error" });')) + 2;

if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
  const replacement = 'const attendanceController = require("./src/controllers/attendanceController");\n\napp.get("/api/attendance/history", attendanceController.getHistory);\napp.get("/api/attendance/recent", attendanceController.getRecent);\napp.post("/api/jailbreak/execute", attendanceController.executeJailbreak);\n';
  lines.splice(startIndex, endIndex - startIndex + 1, replacement);
}

// Remove parseDparagonTime
const parseIndex = lines.findIndex(l => l.includes('function parseDparagonTime(rawTime)'));
if (parseIndex !== -1) {
  const parseCommentIndex = parseIndex - 3;
  lines.splice(parseCommentIndex, lines.length - parseCommentIndex);
  lines.push('');
}

fs.writeFileSync('server.js', lines.join('\n'));
console.log('Server refactored successfully.');
