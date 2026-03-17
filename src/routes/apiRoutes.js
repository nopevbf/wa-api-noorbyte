const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const QRCode = require("qrcode");
const db = require("../config/database");
const checkApiKey = require("../middlewares/auth");
const {
  sendMessageViaWa,
  startSessionForApiKey,
  waitForLatestQr,
  removeSessionForApiKey,
  getSessionStatus,
} = require("../services/waEngine");

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function mapDevice(device) {
  return {
    id: device.id,
    username: device.username,
    phone: device.phone,
    status: device.status || "Disconnected",
  };
}

router.get("/devices", (req, res) => {
  try {
    const devices = db
      .prepare(
        "SELECT id, username, phone, api_key, status FROM users ORDER BY id DESC",
      )
      .all();

    const data = devices.map((device) => ({
      ...mapDevice(device),
      session_status: getSessionStatus(device.api_key),
    }));

    res.status(200).json({ status: true, data });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Gagal mengambil data device." });
  }
});

router.post("/devices", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const phone = String(req.body?.phone || "").trim();

  if (!username || !phone)
    return res
      .status(400)
      .json({ status: false, message: "Nama dan Nomor WA wajib diisi." });

  const token = generateToken();

  try {
    db.prepare(
      "INSERT INTO users (username, phone, api_key, status) VALUES (?, ?, ?, 'Disconnected')",
    ).run(username, phone, token);

    res.status(201).json({
      status: true,
      message: "Device berhasil ditambahkan!",
      data: { username, phone, token },
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Gagal menambah device.",
      error: error.message,
    });
  }
});

router.get("/devices/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res
      .status(400)
      .json({ status: false, message: "ID device tidak valid." });
  }

  const device = db
    .prepare(
      "SELECT id, username, phone, api_key, status FROM users WHERE id = ?",
    )
    .get(id);

  if (!device) {
    return res
      .status(404)
      .json({ status: false, message: "Device tidak ditemukan." });
  }

  return res.status(200).json({
    status: true,
    data: {
      ...mapDevice(device),
      token: device.api_key,
      session_status: getSessionStatus(device.api_key),
    },
  });
});

router.put("/devices/:id", (req, res) => {
  const id = Number(req.params.id);
  const username = String(req.body?.username || "").trim();
  const phone = String(req.body?.phone || "").trim();

  if (!Number.isInteger(id)) {
    return res
      .status(400)
      .json({ status: false, message: "ID device tidak valid." });
  }

  if (!username || !phone) {
    return res
      .status(400)
      .json({ status: false, message: "Nama dan Nomor WA wajib diisi." });
  }

  const result = db
    .prepare("UPDATE users SET username = ?, phone = ? WHERE id = ?")
    .run(username, phone, id);

  if (result.changes === 0) {
    return res
      .status(404)
      .json({ status: false, message: "Device tidak ditemukan." });
  }

  return res.status(200).json({
    status: true,
    message: "Device berhasil diperbarui.",
  });
});

router.delete("/devices/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res
      .status(400)
      .json({ status: false, message: "ID device tidak valid." });
  }

  const device = db.prepare("SELECT api_key FROM users WHERE id = ?").get(id);
  if (!device) {
    return res
      .status(404)
      .json({ status: false, message: "Device tidak ditemukan." });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  removeSessionForApiKey(device.api_key);

  return res.status(200).json({
    status: true,
    message: "Device berhasil dihapus.",
  });
});

router.post("/devices/:id/connect", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res
      .status(400)
      .json({ status: false, message: "ID device tidak valid." });
  }

  const device = db
    .prepare("SELECT id, api_key FROM users WHERE id = ?")
    .get(id);
  if (!device) {
    return res
      .status(404)
      .json({ status: false, message: "Device tidak ditemukan." });
  }

  try {
    await startSessionForApiKey(device.api_key);
    const qrCode = await waitForLatestQr(device.api_key, 15000);

    if (!qrCode) {
      return res.status(200).json({
        status: true,
        message: "Sesi diproses. QR belum tersedia, coba lagi.",
        data: {
          qr_code: null,
          session_status: getSessionStatus(device.api_key),
        },
      });
    }

    const qrImage = await QRCode.toDataURL(qrCode, {
      width: 320,
      margin: 1,
    });

    return res.status(200).json({
      status: true,
      message: "QR code tersedia.",
      data: {
        qr_code: qrCode,
        qr_image: qrImage,
        session_status: getSessionStatus(device.api_key),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Gagal memulai koneksi device.",
      error: error.message,
    });
  }
});

router.post("/send-message", checkApiKey, async (req, res) => {
  const { number, message } = req.body;
  const apiKey = req.user.api_key;

  if (!number || !message)
    return res
      .status(400)
      .json({ status: false, message: "Parameter tidak lengkap." });

  try {
    await sendMessageViaWa(apiKey, number, message);
    db.prepare(
      "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)",
    ).run(apiKey, number, message, "SUCCESS");
    res
      .status(200)
      .json({ status: true, message: `Pesan terkirim via ${apiKey}!` });
  } catch (error) {
    db.prepare(
      "INSERT INTO message_logs (api_key, target_number, message, status) VALUES (?, ?, ?, ?)",
    ).run(apiKey, number, message, "FAILED");
    res.status(500).json({
      status: false,
      message: error.message || "Gagal mengirim pesan.",
    });
  }
});

module.exports = router;
