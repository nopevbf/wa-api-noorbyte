const axios = require("axios");

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

function buildHeaders(token) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
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

  // [STEP 1] LOGIN
  const authRes = await requestWithContext(
    {
      method: "post",
      url: `${baseApiUrl}/login`,
      headers: buildHeaders(),
      data: {
        email: dpEmail,
        password: dpPassword,
      },
    },
    "STEP 1 LOGIN",
  );

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
      headers: buildHeaders(dpToken),
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
      headers: buildHeaders(dpToken),
    },
    "STEP 3 NEW TASK",
  );

  // [STEP 4] GET REPORT CODE
  const listRes = await requestWithContext(
    {
      method: "get",
      url: `${baseApiUrl}/daily-reports/list?dates=&employee_position_id=`,
      headers: buildHeaders(dpToken),
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
      headers: buildHeaders(dpToken),
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
  const { dpToken, tasksList, baseApiUrl } = await executeStep1And2(
    dpApiUrl,
    dpEmail,
    dpPassword,
  );
  const message = await executeStep3To5(baseApiUrl, dpToken, tasksList);
  return message;
}

module.exports = {
  executeStep1And2,
  executeStep3To5,
  fetchDparagonReport,
};
