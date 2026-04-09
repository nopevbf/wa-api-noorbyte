const axios = require("axios");
const path = require("path");
const puppeteer = require("puppeteer");

const DEFAULT_TIMEOUT_MS = 30000;

function normalizeDpApiUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) {
    throw new Error("Base API URL DParagon kosong.");
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Format Base API URL tidak valid: ${input}`);
  }

  // Auto-correct input umum: management domain sering dipakai user padahal automation butuh API domain.
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

function buildHeaders(token, opts = {}) {
  const { baseApiUrl } = opts;
  const managementOrigin = getManagementOriginFromApiUrl(baseApiUrl || "");

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Origin: managementOrigin,
    Referer: `${managementOrigin}/`,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

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
  const source = String(text || "").toLowerCase();
  return (
    source.includes("just a moment") ||
    source.includes("enable javascript and cookies") ||
    source.includes("__cf_chl_opt") ||
    source.includes("challenge-platform")
  );
}

function isCloudflareChallengeError(err) {
  if (!err) return false;
  return isCloudflareChallengeText(err.message || "");
}

async function requestWithContext(config, stepLabel) {
  try {
    return await axios({ ...config, timeout: DEFAULT_TIMEOUT_MS });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const payload = stringifyErrorPayload(err.response.data);

      if (status === 403) {
        throw new Error(
          `[${stepLabel}] Request ditolak (403 Forbidden). ` +
            `Pastikan Base API URL mengarah ke domain API (bukan management), akun punya akses endpoint daily reports, dan kredensial benar. ` +
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

/**
 * STEP 1 & 2: Login ke DParagon dan ambil on-progress task.
 */
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
        timeout: DEFAULT_TIMEOUT_MS,
      });
      break;
    } catch (err) {
      if (err.response) {
        const payload = stringifyErrorPayload(err.response.data);

        if (err.response.status === 403 && isCloudflareChallengeText(payload)) {
          throw new Error(
            `[STEP 1 LOGIN] Cloudflare challenge terdeteksi pada ${attempt.url}. Request backend direct diblokir.`,
          );
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
      `[STEP 1 LOGIN] Semua percobaan login gagal. URL dasar: ${baseApiUrl}. Detail: ${loginErrors.join(" | ")}`,
    );
  }

  const authData = authRes.data;
  const dpToken =
    authData.access_token ||
    authData.data?.access_token ||
    authData.payload?.access_token;

  if (!dpToken)
    throw new Error("Gagal mendapatkan access_token dari response.");

  // [STEP 2] ON PROGRESS TASK
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

  const browser = await puppeteer.launch({
    headless: "new",
    userDataDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1366,768",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  );
  await page.setExtraHTTPHeaders({
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  });

  try {
    await page.goto(managementOrigin, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Panaskan clearance Cloudflare untuk host API.
    await page.goto(`${baseApiUrl}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const result = await page.evaluate(
      async ({ baseApiUrl, dpEmail, dpPassword }) => {
        const toJsonSafe = async (res) => {
          const text = await res.text();
          try {
            return { parsed: JSON.parse(text), raw: text };
          } catch {
            return { parsed: null, raw: text };
          }
        };

        const extractToken = (authData) =>
          authData?.access_token ||
          authData?.data?.access_token ||
          authData?.payload?.access_token ||
          authData?.token ||
          authData?.payload?.token ||
          "";

        const loginAttempts = [
          {
            label: "login(email,password)",
            url: `${baseApiUrl}/login`,
            body: { email: dpEmail, password: dpPassword },
          },
          {
            label: "login(username,password)",
            url: `${baseApiUrl}/login`,
            body: { username: dpEmail, password: dpPassword },
          },
          {
            label: "auth/login(email,password)",
            url: `${baseApiUrl}/auth/login`,
            body: { email: dpEmail, password: dpPassword },
          },
          {
            label: "auth/login(username,password)",
            url: `${baseApiUrl}/auth/login`,
            body: { username: dpEmail, password: dpPassword },
          },
        ];

        let dpToken = "";
        const loginErrors = [];

        for (const attempt of loginAttempts) {
          const res = await fetch(attempt.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify(attempt.body),
          });

          const body = await toJsonSafe(res);
          if (res.ok) {
            dpToken = extractToken(body.parsed || {});
            if (dpToken) break;
          }

          const rawShort = (body.raw || "").slice(0, 180).replace(/\s+/g, " ");
          loginErrors.push(
            `${attempt.label} -> HTTP ${res.status} (${rawShort})`,
          );
        }

        if (!dpToken) {
          throw new Error(
            `[BROWSER STEP 1 LOGIN] Gagal mendapatkan token. ${loginErrors.join(" | ")}`,
          );
        }

        const apiFetch = async (url, options, stepLabel) => {
          const res = await fetch(url, {
            ...options,
            credentials: "include",
            headers: {
              ...(options.headers || {}),
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${dpToken}`,
            },
          });

          const body = await toJsonSafe(res);
          if (!res.ok) {
            const rawShort = (body.raw || "")
              .slice(0, 240)
              .replace(/\s+/g, " ");
            throw new Error(`[${stepLabel}] HTTP ${res.status}: ${rawShort}`);
          }

          return body.parsed || {};
        };

        const taskData = await apiFetch(
          `${baseApiUrl}/daily-reports/on-progress-task`,
          { method: "GET" },
          "BROWSER STEP 2 ON PROGRESS TASK",
        );

        const payloadData = taskData.payload || [];
        if (!Array.isArray(payloadData) || payloadData.length === 0) {
          throw new Error(
            "[BROWSER STEP 2] Data payload kosong atau tidak ditemukan.",
          );
        }

        const tasksList = payloadData.map((task) => ({
          dates: `${task.start_date || ""} - ${task.end_date || ""}`,
          task_description: task.task_description || "",
        }));

        const now = new Date();
        const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        await apiFetch(
          `${baseApiUrl}/daily-reports/new-task`,
          {
            method: "POST",
            body: JSON.stringify({ daily_date: todayDate, tasks: tasksList }),
          },
          "BROWSER STEP 3 NEW TASK",
        );

        const listData = await apiFetch(
          `${baseApiUrl}/daily-reports/list?dates=&employee_position_id=`,
          { method: "GET" },
          "BROWSER STEP 4 GET REPORT CODE",
        );

        const group = listData?.payload?.group || {};
        const keys = Object.keys(group);
        if (keys.length === 0) {
          throw new Error(
            "[BROWSER STEP 4] Tidak ada data report ditemukan (Keys length 0).",
          );
        }

        const lastKey = keys[keys.length - 1];
        const reportCode = group[lastKey]?.daily_report_code;
        if (!reportCode) {
          throw new Error(
            "[BROWSER STEP 4] Key daily_report_code tidak ditemukan.",
          );
        }

        const summaryData = await apiFetch(
          `${baseApiUrl}/daily-reports/summary-daily-report?code=${reportCode}`,
          { method: "GET" },
          "BROWSER STEP 5 SUMMARY REPORT",
        );

        let rawMessage = null;
        if (summaryData.payload?.message)
          rawMessage = summaryData.payload.message;
        else if (typeof summaryData.payload === "string")
          rawMessage = summaryData.payload;
        else if (summaryData.data?.message)
          rawMessage = summaryData.data.message;
        else if (summaryData.message && summaryData.message.length > 50)
          rawMessage = summaryData.message;

        if (!rawMessage) {
          throw new Error(
            "[BROWSER STEP 5] Message laporan tidak ditemukan atau kosong!",
          );
        }

        return rawMessage;
      },
      { baseApiUrl, dpEmail, dpPassword },
    );

    return result;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * STEP 3-5: Post new task, get report code, get summary message.
 */
async function executeStep3To5(dpApiUrl, dpToken, tasksList) {
  const baseApiUrl = normalizeDpApiUrl(dpApiUrl);

  // [STEP 3] POST NEW TASK
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  await requestWithContext(
    {
      method: "post",
      url: `${baseApiUrl}/daily-reports/new-task`,
      data: { daily_date: todayDate, tasks: tasksList },
      headers: buildHeaders(dpToken, { baseApiUrl }),
    },
    "STEP 3 NEW TASK",
  );

  // [STEP 4] GET REPORT CODE
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

  // [STEP 5] GET SUMMARY REPORT
  const summaryRes = await requestWithContext(
    {
      method: "get",
      url: `${baseApiUrl}/daily-reports/summary-daily-report?code=${reportCode}`,
      headers: buildHeaders(dpToken, { baseApiUrl }),
    },
    "STEP 5 SUMMARY REPORT",
  );

  const summaryData = summaryRes.data;
  let rawMessage = null;
  if (summaryData.payload?.message) rawMessage = summaryData.payload.message;
  else if (typeof summaryData.payload === "string")
    rawMessage = summaryData.payload;
  else if (summaryData.data?.message) rawMessage = summaryData.data.message;
  else if (summaryData.message && summaryData.message.length > 50)
    rawMessage = summaryData.message;

  if (!rawMessage)
    throw new Error("Message laporan tidak ditemukan atau kosong!");

  return rawMessage;
}

/**
 * Full pipeline: Step 1-5 (fetch all data and return the message)
 */
async function fetchDparagonReport(dpApiUrl, dpEmail, dpPassword) {
  const baseApiUrl = normalizeDpApiUrl(dpApiUrl);

  try {
    const { dpToken, tasksList } = await executeStep1And2(
      baseApiUrl,
      dpEmail,
      dpPassword,
    );
    const message = await executeStep3To5(baseApiUrl, dpToken, tasksList);
    return message;
  } catch (err) {
    if (!isCloudflareChallengeError(err)) {
      throw err;
    }

    return runDailyReportViaBrowser(baseApiUrl, dpEmail, dpPassword);
  }
}

module.exports = {
  executeStep1And2,
  executeStep3To5,
  fetchDparagonReport,
};
