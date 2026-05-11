const { exec } = require("child_process");

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        // Attach stdout and stderr to the error object so we can inspect them
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function killPortProcess(port) {
  const portNum = Number(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535 || !Number.isInteger(portNum)) {
    throw new Error('Invalid port number');
  }

  if (portNum <= 1023) {
    throw new Error('Cannot kill system ports (0-1023)');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Port killing is disabled in production');
  }

  const isWin = process.platform === "win32";

  const findCmd = isWin
    ? `netstat -ano | findstr :${portNum} | findstr LISTENING`
    : `lsof -ti :${portNum}`;

  try {
    const { stdout } = await execPromise(findCmd);
    if (!stdout || !stdout.trim()) {
      return false;
    }

    let pid;
    if (isWin) {
      const parts = stdout.trim().split(/\s+/);
      pid = parts[parts.length - 1];
    } else {
      pid = stdout.trim().split("\n")[0];
    }

    if (!pid || isNaN(pid)) {
      throw new Error(`PID tidak valid untuk port ${portNum}`);
    }

    const killCmd = isWin ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;
    await execPromise(killCmd);
    return true;
  } catch (err) {
    // Check if error is related to permissions
    const errMessage = (err.stderr || err.message || '').toLowerCase();
    if (errMessage.includes('eperm') || errMessage.includes('access is denied') || errMessage.includes('operation not permitted') || errMessage.includes('akses ditolak')) {
      throw new Error('Akses ditolak (Permission Denied). Coba jalankan sebagai Administrator/Root.');
    }

    if (err.stdout === '' || err.code === 1) {
      // process not found
      return false;
    }
    throw err;
  }
}

module.exports = { killPortProcess };
