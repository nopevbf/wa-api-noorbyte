const axios = require("axios");
const { SocksProxyAgent } = require("socks-proxy-agent"); // Ganti library-nya

// <--- [TAMBAHAN 2] Masukin Link Pinggy dari Termux HP lu (buang tulisan tcp://)
// Contoh jadinya: "http://firman:rahasia123@rnq-12-34-56.a.pinggy.link:43210"
const proxyUrl = "socks5://didhv-182-8-226-99.run.pinggy-free.link:35777";
const proxyAgent = new SocksProxyAgent(proxyUrl);

/**
 * STEP 1 & 2: Login ke DParagon dan ambil on-progress task.
 */
async function executeStep1And2(dpApiUrl, dpEmail, dpPassword) {
  // [STEP 1] LOGIN
  const authRes = await axios.post(
    `${dpApiUrl}/login`,
    { email: dpEmail, password: dpPassword },
    { httpsAgent: proxyAgent }, // <--- [TAMBAHAN 3] Suntik Proxy ke Login
  );

  const authData = authRes.data;
  const dpToken =
    authData.access_token ||
    authData.data?.access_token ||
    authData.payload?.access_token;

  if (!dpToken)
    throw new Error("Gagal mendapatkan access_token dari response.");

  // [STEP 2] ON PROGRESS TASK
  const taskRes = await axios.get(
    `${dpApiUrl}/daily-reports/on-progress-task`,
    {
      headers: {
        Authorization: `Bearer ${dpToken}`,
        "Content-Type": "application/json",
      },
      httpsAgent: proxyAgent, // <--- [TAMBAHAN 4] Suntik Proxy
    },
  );

  const payloadData = taskRes.data.payload || [];
  if (payloadData.length === 0)
    throw new Error("Data payload kosong atau tidak ditemukan.");

  const tasksList = payloadData.map((task) => ({
    dates: `${task.start_date || ""} - ${task.end_date || ""}`,
    task_description: task.task_description || "",
  }));

  return { dpToken, tasksList };
}

/**
 * STEP 3-5: Post new task, get report code, get summary message.
 */
async function executeStep3To5(dpApiUrl, dpToken, tasksList) {
  // [STEP 3] POST NEW TASK
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  await axios.post(
    `${dpApiUrl}/daily-reports/new-task`,
    { daily_date: todayDate, tasks: tasksList },
    {
      headers: {
        Authorization: `Bearer ${dpToken}`,
        "Content-Type": "application/json",
      },
      httpsAgent: proxyAgent, // <--- [TAMBAHAN 5] Suntik Proxy
    },
  );

  // [STEP 4] GET REPORT CODE
  const listRes = await axios.get(
    `${dpApiUrl}/daily-reports/list?dates=&employee_position_id=`,
    {
      headers: {
        Authorization: `Bearer ${dpToken}`,
        "Content-Type": "application/json",
      },
      httpsAgent: proxyAgent, // <--- [TAMBAHAN 6] Suntik Proxy
    },
  );

  const group = listRes.data.payload?.group || {};
  const keys = Object.keys(group);
  if (keys.length === 0)
    throw new Error("Tidak ada data report ditemukan (Keys length 0).");

  const lastKey = keys[keys.length - 1];
  const reportCode = group[lastKey]?.daily_report_code;
  if (!reportCode) throw new Error("Key daily_report_code tidak ditemukan.");

  // [STEP 5] GET SUMMARY REPORT
  const summaryRes = await axios.get(
    `${dpApiUrl}/daily-reports/summary-daily-report?code=${reportCode}`,
    {
      headers: {
        Authorization: `Bearer ${dpToken}`,
        "Content-Type": "application/json",
      },
      httpsAgent: proxyAgent, // <--- [TAMBAHAN 7] Suntik Proxy
    },
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
  const { dpToken, tasksList } = await executeStep1And2(
    dpApiUrl,
    dpEmail,
    dpPassword,
  );
  const message = await executeStep3To5(dpApiUrl, dpToken, tasksList);
  return message;
}

module.exports = {
  executeStep1And2,
  executeStep3To5,
  fetchDparagonReport,
};
