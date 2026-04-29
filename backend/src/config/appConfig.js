/**
 * App Configuration
 * Menentukan base URL DParagon berdasarkan NODE_ENV
 * (dotenv sudah di-load di server.js)
 */

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const packageJson = require("../../package.json");

const config = {
  env: NODE_ENV,
  isProd,
  version: packageJson.version || "1.0.0",

  // DParagon API URL — otomatis pilih berdasarkan NODE_ENV
  dparagonApiUrl: isProd
    ? (process.env.DPARAGON_API_URL_PROD || "https://api.dparagon.com/v2")
    : (process.env.DPARAGON_API_URL_DEV || "https://api.dparagon6.persona-it.com/v2"),
};

module.exports = config;
