const axios = require("axios");
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { SocksProxyAgent } = require("socks-proxy-agent");

puppeteer.use(StealthPlugin());

const DEFAULT_TIMEOUT_MS = 30000;

// Socks5 Proxy dari env
const proxyUrl = process.env.PROXY_URL || "";

// Buat fresh agent per request agar koneksi tidak stale
function createAgent() {
  return proxyUrl ? new SocksProxyAgent(proxyUrl) : undefined;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function normalizeDpApiUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) throw new Error("Base API URL DParagon kosong.");

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Format Base API URL tidak valid: ${input}`);
  }

  if (parsed.hostname === "management.dparagon.com") {
    parsed.hostname = "api.dparagon.com";
    parsed.pathname = "/v2";
  } else if (parsed.hostname === "management.dparagon6.persona-it.com") {
    parsed.hostname = "api.dparagon6.persona-it.com";
    parsed.pathname = "/v2";
  } else if (parsed.hostname.startsWith("management.")) {
    parsed.hostname = parsed.hostname.replace("management.", "api.");
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = cleanPath && cleanPath !== "/" ? cleanPath : "/v2";

  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
}

function getManagementOriginFromApiUrl(baseApiUrl) {
  try {
    const parsed = new URL(baseApiUrl);
    if (parsed.hostname.startsWith("api.")) {
      parsed.hostname = parsed.hostname.replace("api.", "management.");
    }
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.origin;
  } catch {
    return "https://management.dparagon.com";
  }
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function buildHeaders(token, opts = {}) {
  const managementOrigin = getManagementOriginFromApiUrl(opts.baseApiUrl || "");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Origin: managementOrigin,
    Referer: `${managementOrigin}/`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function stringifyErrorPayload(data) {
  if (!data) return "(tanpa body response)";
  if (typeof data === "string") return data;
  if (data.message) {
    return typeof data.message === "string"
      ? data.message
      : JSON.stringify(data.message);
  }
  try {
    return JSON.stringify(data);
  } catch {
    return "(body response tidak dapat diparsing)";
  }
}

function isCloudflareChallengeText(text) {
  const s = String(text || "").toLowerCase();
  return (
    s.includes("just a moment") ||
    s.includes("enable javascript and cookies") ||
    s.includes("__cf_chl_opt") ||
    s.includes("challenge-platform")
  );
}

function isCloudflareChallengeError(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    isCloudflareChallengeText(msg) ||
    msg.includes("cloudflare challenge terdeteksi") ||
    msg.includes("request backend direct diblokir")
  );
}

async function requestWithContext(config, stepLabel) {
  try {
    return await axios({
      ...config,
      httpsAgent: createAgent(),
      timeout: DEFAULT_TIMEOUT_MS,
    });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const payload = stringifyErrorPayload(err.response.data);

      if (status === 403) {
        // Cek apakah ini CF challenge atau 403 biasa
        if (isCloudflareChallengeText(payload)) {
          const cfErr = new Error(
            `[${stepLabel}] Cloudflare challenge terdeteksi pada ${config.url}. Request backend direct diblokir.`,
          );
          cfErr.isCloudflareChallengeError = true;
          throw cfErr;
        }
        throw new Error(
          `[${stepLabel}] Request ditolak (403 Forbidden). ` +
          `Pastikan Base API URL mengarah ke domain API (bukan management), ` +
          `akun punya akses endpoint daily reports, dan kredensial benar. ` +
          `URL: ${config.url}`,
        );
      }

      throw new Error(
        `[${stepLabel}] Request gagal dengan status ${status}. Response: ${payload}`,
      );
    }

    if (err.code === "ECONNABORTED") {
      throw new Error(
        `[${stepLabel}] Request timeout setelah ${DEFAULT_TIMEOUT_MS / 1000} detik.`,
      );
    }

    throw new Error(`[${stepLabel}] ${err.message}`);
  }
}

async function executeStep1And2(dpApiUrl, dpEmail, dpPassword) {
  const baseApiUrl = normalizeDpApiUrl(dpApiUrl);

  const loginAttempts = [
    {
      label: "login(email,password)",
      url: `${baseApiUrl}/login`,
      data: { email: dpEmail, password: dpPassword },
    },
    {
      label: "login(username,password)",
      url: `${baseApiUrl}/login`,
      data: { username: dpEmail, password: dpPassword },
    },
    {
      label: "auth/login(email,password)",
      url: `${baseApiUrl}/auth/login`,
      data: { email: dpEmail, password: dpPassword },
    },
    {
      label: "auth/login(username,password)",
      url: `${baseApiUrl}/auth/login`,
      data: { username: dpEmail, password: dpPassword },
    },
  ];

  let authRes = null;
  const loginErrors = [];

  for (const attempt of loginAttempts) {
    try {
      authRes = await axios({
        method: "post",
        url: attempt.url,
        data: attempt.data,
        headers: buildHeaders(null, { baseApiUrl }),
        httpsAgent: createAgent(),
        timeout: DEFAULT_TIMEOUT_MS,
      });
      break;
    } catch (err) {
      if (err.response) {
        const payload = stringifyErrorPayload(err.response.data);

        if (err.response.status === 403 && isCloudflareChallengeText(payload)) {
          const cfErr = new Error(
            `[STEP 1 LOGIN] Cloudflare challenge terdeteksi pada ${attempt.url}. Request backend direct diblokir.`,
          );
          cfErr.isCloudflareChallengeError = true;
          throw cfErr;
        }

        loginErrors.push(
          `${attempt.label} -> HTTP ${err.response.status} (${payload})`,
        );
        continue;
      }
      loginErrors.push(`${attempt.label} -> ${err.message}`);
    }
  }

  if (!authRes) {
    throw new Error(
      `[STEP 1 LOGIN] Semua percobaan login gagal. URL dasar: ${baseApiUrl}. ` +
      `Detail: ${loginErrors.join(" | ")}`,
    );
  }

  const authData = authRes.data;
  const dpToken =
    authData.access_token ||
    authData.data?.access_token ||
    authData.payload?.access_token;

  if (!dpToken)
    throw new Error("Gagal mendapatkan access_token dari response.");

  const taskRes = await requestWithContext(
    {
      method: "get",
      url: `${baseApiUrl}/daily-reports/on-progress-task`,
      headers: buildHeaders(dpToken, { baseApiUrl }),
    },
    "STEP 2 ON PROGRESS TASK",
  );

  const payloadData = taskRes.data.payload || [];
  if (payloadData.length === 0)
    throw new Error("Data payload kosong atau tidak ditemukan.");

  const tasksList = payloadData.map((task) => ({
    dates: `${task.start_date || ""} - ${task.end_date || ""}`,
    task_description: task.task_description || "",
  }));

  return { dpToken, tasksList, baseApiUrl };
}

// ---------------------------------------------------------------------------
// STEP 3–5 — axios direct (fast path)
// ---------------------------------------------------------------------------

async function executeStep3To5(dpApiUrl, dpToken, tasksList) {
  const baseApiUrl = normalizeDpApiUrl(dpApiUrl);

  const now = new Date();
  const todayDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  await requestWithContext(
    {
      method: "post",
      url: `${baseApiUrl}/daily-reports/new-task`,
      data: { daily_date: todayDate, tasks: tasksList },
      headers: buildHeaders(dpToken, { baseApiUrl }),
    },
    "STEP 3 NEW TASK",
  );

  const listRes = await requestWithContext(
    {
      method: "get",
      url: `${baseApiUrl}/daily-reports/list?dates=&employee_position_id=`,
      headers: buildHeaders(dpToken, { baseApiUrl }),
    },
    "STEP 4 GET REPORT CODE",
  );

  const group = listRes.data.payload?.group || {};
  const keys = Object.keys(group);
  if (keys.length === 0)
    throw new Error("Tidak ada data report ditemukan (Keys length 0).");

  const lastKey = keys[keys.length - 1];
  const reportCode = group[lastKey]?.daily_report_code;
  if (!reportCode) throw new Error("Key daily_report_code tidak ditemukan.");

  const summaryRes = await requestWithContext(
    {
      method: "get",
      url: `${baseApiUrl}/daily-reports/summary-daily-report?code=${reportCode}`,
      headers: buildHeaders(dpToken, { baseApiUrl }),
    },
    "STEP 5 SUMMARY REPORT",
  );

  return extractMessage(summaryRes.data, "STEP 5");
}

async function runDailyReportViaBrowser(dpApiUrl, dpEmail, dpPassword) {
  const baseApiUrl = normalizeDpApiUrl(dpApiUrl);
  const managementOrigin = getManagementOriginFromApiUrl(baseApiUrl);

  const profileSuffix = Buffer.from(baseApiUrl)
    .toString("base64url")
    .slice(0, 20);
  const userDataDir = path.join(
    __dirname,
    "../../sessions",
    `dparagon_cf_${profileSuffix}`,
  );
  /**
   * Full pipeline: Step 1-5 (fetch all data and return the message)
   */
  async function fetchDparagonReport(dpApiUrl, dpEmail, dpPassword) {
    const { dpToken, tasksList } = await executeStep1And2(
      dpApiUrl,
      dpEmail,
      dpPassword,
    );

    const browser = await puppeteer.launch({
      headless: true,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1366,768",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1366, height: 768 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      );
      await page.setExtraHTTPHeaders({
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
      });

      // Warmup: buka management origin supaya CF set clearance cookie
      await page.goto(managementOrigin, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      // Kalau masih challenge page, tunggu dan reload sekali
      const titleAfterWarmup = await page.title();
      if (titleAfterWarmup.toLowerCase().includes("just a moment")) {
        console.warn("[BROWSER] CF challenge aktif, menunggu 5 detik...");
        await new Promise((r) => setTimeout(r, 5000));
        await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      }

      // Jalankan semua step via fetch() di dalam konteks browser
      // (sudah punya CF clearance cookie dari warmup di atas)
      const result = await page.evaluate(
        async ({ baseApiUrl, managementOrigin, dpEmail, dpPassword }) => {
          const toJsonSafe = async (res) => {
            const text = await res.text();
            try {
              return {
                ok: res.ok,
                status: res.status,
                parsed: JSON.parse(text),
                raw: text,
              };
            } catch {
              return { ok: res.ok, status: res.status, parsed: null, raw: text };
            }
          };

          const extractToken = (d) =>
            d?.access_token ||
            d?.data?.access_token ||
            d?.payload?.access_token ||
            d?.token ||
            d?.payload?.token ||
            "";

          // --- Login ---
          const loginAttempts = [
            {
              label: "login/email",
              url: `${baseApiUrl}/login`,
              body: { email: dpEmail, password: dpPassword },
            },
            {
              label: "login/username",
              url: `${baseApiUrl}/login`,
              body: { username: dpEmail, password: dpPassword },
            },
            {
              label: "auth/email",
              url: `${baseApiUrl}/auth/login`,
              body: { email: dpEmail, password: dpPassword },
            },
            {
              label: "auth/username",
              url: `${baseApiUrl}/auth/login`,
              body: { username: dpEmail, password: dpPassword },
            },
          ];

          let dpToken = "";
          const loginErrors = [];

          for (const attempt of loginAttempts) {
            const res = await toJsonSafe(
              await fetch(attempt.url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                credentials: "include",
                body: JSON.stringify(attempt.body),
              }),
            );

            if (res.ok) {
              dpToken = extractToken(res.parsed || {});
              if (dpToken) break;
            }

            loginErrors.push(
              `${attempt.label} -> HTTP ${res.status} (${(res.raw || "").slice(0, 120)})`,
            );
          }

          if (!dpToken) {
            throw new Error(
              `[BROWSER LOGIN] Gagal token. ${loginErrors.join(" | ")}`,
            );
          }

          // --- Fetch helper ---
          const apiFetch = async (url, options, label) => {
            const res = await toJsonSafe(
              await fetch(url, {
                ...options,
                credentials: "include",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${dpToken}`,
                  Origin: managementOrigin,
                  Referer: `${managementOrigin}/`,
                  ...(options.headers || {}),
                },
              }),
            );

            if (!res.ok) {
              throw new Error(
                `[${label}] HTTP ${res.status}: ${(res.raw || "").slice(0, 240)}`,
              );
            }

            return res.parsed || {};
          };

          // --- Step 2: on-progress task ---
          const taskData = await apiFetch(
            `${baseApiUrl}/daily-reports/on-progress-task`,
            { method: "GET" },
            "BROWSER STEP 2",
          );

          const payloadData = taskData.payload || [];
          if (!Array.isArray(payloadData) || payloadData.length === 0) {
            throw new Error("[BROWSER STEP 2] Data payload kosong.");
          }

          const tasksList = payloadData.map((t) => ({
            dates: `${t.start_date || ""} - ${t.end_date || ""}`,
            task_description: t.task_description || "",
          }));

          // --- Step 3: post new task ---
          const now = new Date();
          const todayDate = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
          ].join("-");

          await apiFetch(
            `${baseApiUrl}/daily-reports/new-task`,
            {
              method: "POST",
              body: JSON.stringify({ daily_date: todayDate, tasks: tasksList }),
            },
            "BROWSER STEP 3",
          );

          // --- Step 4: get report code ---
          const listData = await apiFetch(
            `${baseApiUrl}/daily-reports/list?dates=&employee_position_id=`,
            { method: "GET" },
            "BROWSER STEP 4",
          );

          const group = listData?.payload?.group || {};
          const keys = Object.keys(group);
          if (keys.length === 0)
            throw new Error("[BROWSER STEP 4] Keys length 0.");

          const reportCode = group[keys[keys.length - 1]]?.daily_report_code;
          if (!reportCode)
            throw new Error(
              "[BROWSER STEP 4] daily_report_code tidak ditemukan.",
            );

          // --- Step 5: summary ---
          const summaryData = await apiFetch(
            `${baseApiUrl}/daily-reports/summary-daily-report?code=${reportCode}`,
            { method: "GET" },
            "BROWSER STEP 5",
          );

          const msg =
            summaryData.payload?.message ||
            (typeof summaryData.payload === "string"
              ? summaryData.payload
              : null) ||
            summaryData.data?.message ||
            (summaryData.message?.length > 50 ? summaryData.message : null);

          if (!msg)
            throw new Error("[BROWSER STEP 5] Message laporan tidak ditemukan.");

          return msg;
        },
        { baseApiUrl, managementOrigin, dpEmail, dpPassword },
      );

      return result;
    } finally {
      await page.close().catch(() => { });
      await browser.close().catch(() => { });
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helper
  // ---------------------------------------------------------------------------

  function extractMessage(summaryData, stepLabel) {
    const msg =
      summaryData.payload?.message ||
      (typeof summaryData.payload === "string" ? summaryData.payload : null) ||
      summaryData.data?.message ||
      (summaryData.message?.length > 50 ? summaryData.message : null);

    if (!msg)
      throw new Error(
        `[${stepLabel}] Message laporan tidak ditemukan atau kosong!`,
      );
    return msg;
  }

  // ---------------------------------------------------------------------------
  // Full pipeline
  // ---------------------------------------------------------------------------

  async function fetchDparagonReport(dpApiUrl, dpEmail, dpPassword) {
    const baseApiUrl = normalizeDpApiUrl(dpApiUrl);

    try {
      const { dpToken, tasksList } = await executeStep1And2(
        baseApiUrl,
        dpEmail,
        dpPassword,
      );
      return await executeStep3To5(baseApiUrl, dpToken, tasksList);
    } catch (err) {
      const isCF =
        err.isCloudflareChallengeError || isCloudflareChallengeError(err);
      if (!isCF) throw err;

      console.warn(
        "[fetchDparagonReport] Cloudflare challenge detected, switching to browser fallback...",
      );

      try {
        return await runDailyReportViaBrowser(baseApiUrl, dpEmail, dpPassword);
      } catch (browserErr) {
        throw new Error(
          `[fetchDparagonReport] Browser fallback juga gagal.\n` +
          `  Original  : ${err.message}\n` +
          `  Browser   : ${browserErr.message}`,
        );
      }
    }
  }
}

module.exports = {
  executeStep1And2,
  executeStep3To5,
  fetchDparagonReport,
};

