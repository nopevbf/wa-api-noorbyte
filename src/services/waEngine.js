const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const db = require("../config/database");

const activeSessions = new Map();
const latestQrByApiKey = new Map();
const sessionStatusByApiKey = new Map();

function setDeviceStatus(apiKey, status) {
  db.prepare("UPDATE users SET status = ? WHERE api_key = ?").run(
    status,
    apiKey,
  );
}

function formatNumber(number) {
  let formatted = number.replace(/\D/g, "");
  if (formatted.startsWith("0")) formatted = "62" + formatted.substring(1);
  if (!formatted.endsWith("@s.whatsapp.net")) formatted += "@s.whatsapp.net";
  return formatted;
}

async function connectToWhatsApp(apiKey) {
  if (activeSessions.has(apiKey)) {
    return;
  }

  const sessionDir = path.join(__dirname, "../../sessions", apiKey);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[${apiKey}] Memulai koneksi WA...`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
  });

  activeSessions.set(apiKey, sock);
  sessionStatusByApiKey.set(apiKey, "connecting");
  setDeviceStatus(apiKey, "Connecting");

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQrByApiKey.set(apiKey, qr);
      sessionStatusByApiKey.set(apiKey, "qr");
      setDeviceStatus(apiKey, "Scan QR");
      console.log(`[${apiKey}] QR tersedia. Tampilkan dari UI dashboard.`);
    }

    if (connection === "close") {
      activeSessions.delete(apiKey);

      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        `[${apiKey}] Koneksi terputus. Reconnect: ${shouldReconnect}`,
      );

      if (shouldReconnect) {
        sessionStatusByApiKey.set(apiKey, "reconnecting");
        setDeviceStatus(apiKey, "Reconnecting");
        setTimeout(() => connectToWhatsApp(apiKey), 2000);
      } else {
        console.log(
          `[${apiKey}] Logged out. Hapus folder sesinya jika ingin login ulang.`,
        );
        activeSessions.delete(apiKey);
        latestQrByApiKey.delete(apiKey);
        sessionStatusByApiKey.set(apiKey, "logged_out");
        setDeviceStatus(apiKey, "Disconnected");
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } else if (connection === "open") {
      latestQrByApiKey.delete(apiKey);
      sessionStatusByApiKey.set(apiKey, "connected");
      setDeviceStatus(apiKey, "Connected");
      console.log(`[${apiKey}] Mantap! Berhasil terhubung.`);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid.replace("@s.whatsapp.net", "");
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    const user = db
      .prepare("SELECT webhook_url FROM users WHERE api_key = ?")
      .get(apiKey);
    if (user && user.webhook_url) {
      try {
        await axios.post(user.webhook_url, {
          api_key: apiKey,
          sender,
          message: text,
        });
      } catch (error) {
        console.error(`[${apiKey}] Webhook error`);
      }
    }
  });
}

function initAllSessions() {
  const users = db.prepare("SELECT api_key FROM users").all();
  users.forEach((user) => {
    connectToWhatsApp(user.api_key);
  });
}

async function startSessionForApiKey(apiKey) {
  await connectToWhatsApp(apiKey);
}

async function waitForLatestQr(apiKey, timeoutMs = 15000) {
  const existing = latestQrByApiKey.get(apiKey);
  if (existing) return existing;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const qrValue = latestQrByApiKey.get(apiKey);
    if (qrValue) {
      return qrValue;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
}

function getSessionStatus(apiKey) {
  return sessionStatusByApiKey.get(apiKey) || "disconnected";
}

function removeSessionForApiKey(apiKey) {
  const sessionDir = path.join(__dirname, "../../sessions", apiKey);
  activeSessions.delete(apiKey);
  latestQrByApiKey.delete(apiKey);
  sessionStatusByApiKey.delete(apiKey);
  fs.rmSync(sessionDir, { recursive: true, force: true });
}

// Fungsi helper buat ngirim pesan dari API Route nanti
async function sendMessageViaWa(apiKey, number, message) {
  const waSocket = activeSessions.get(apiKey);
  if (!waSocket) throw new Error("Sistem WhatsApp belum siap/terkoneksi.");

  const waNumber = formatNumber(number);
  await waSocket.sendMessage(waNumber, { text: message });
}

module.exports = {
  initAllSessions,
  sendMessageViaWa,
  startSessionForApiKey,
  waitForLatestQr,
  removeSessionForApiKey,
  getSessionStatus,
};
