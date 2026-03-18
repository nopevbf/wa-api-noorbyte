const db = require("../config/database"); // Panggil database dari config

function checkApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res
      .status(401)
      .json({ status: false, message: "API Key tidak ditemukan di header." });
  }

  // Cek ke database
  const user = db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey);
  if (!user) {
    return res
      .status(403)
      .json({ status: false, message: "API Key tidak valid." });
  }

  req.user = user; // Lempar data user ke proses selanjutnya
  next();
}

module.exports = checkApiKey;
