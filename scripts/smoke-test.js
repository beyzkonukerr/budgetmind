const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const TEST_PORT = 3099;

function req({ method, path: p, data, headers = {} }) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const reqHttp = http.request(
      {
        hostname: "localhost",
        port: TEST_PORT,
        method,
        path: p,
        headers: {
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          ...headers
        }
      },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          let parsed = {};
          try {
            parsed = chunks ? JSON.parse(chunks) : {};
          } catch (_e) {
            parsed = {};
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    reqHttp.on("error", reject);
    if (body) reqHttp.write(body);
    reqHttp.end();
  });
}

const samples = [
  {
    income: 5000,
    expense: 4000,
    tracking: 1,
    budgetPlan: 1,
    saving: 0.5,
    s11: 3,
    s12: 2,
    s13: 3,
    s14: 3,
    consent: true
  },
  {
    income: 3000,
    expense: 5000,
    tracking: 0,
    budgetPlan: 0,
    saving: 0,
    s11: 5,
    s12: 5,
    s13: 4,
    s14: 5,
    consent: true
  },
  {
    income: 7000,
    expense: 6500,
    tracking: 0.5,
    budgetPlan: 0.5,
    saving: 1,
    s11: 2,
    s12: 2,
    s13: 2,
    s14: 2,
    consent: true
  },
  {
    income: 9000,
    expense: 9000,
    tracking: 1,
    budgetPlan: 1,
    saving: 0.5,
    s11: 4,
    s12: 3,
    s13: 4,
    s14: 4,
    consent: true
  },
  {
    income: 2000,
    expense: 1500,
    tracking: 0.5,
    budgetPlan: 0.5,
    saving: 0.5,
    s11: 1,
    s12: 2,
    s13: 1,
    s14: 2,
    consent: true
  }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const root = path.join(__dirname, "..");
  const server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: String(TEST_PORT) }
  });

  const shutdown = () => {
    try {
      server.kill("SIGTERM");
    } catch (_e) {
      /* ignore */
    }
  };

  process.on("exit", shutdown);

  await sleep(3000);

  try {
    const health = await req({ method: "GET", path: "/api/health" });
    if (health.status !== 200 || !health.body.ok) {
      throw new Error("Health endpoint basarisiz.");
    }

    for (const payload of samples) {
      const analyze = await req({
        method: "POST",
        path: "/api/analyze",
        data: payload
      });
      if (analyze.status !== 200 || !analyze.body.result) {
        throw new Error("Analyze endpoint basarisiz.");
      }
    }

    const adminPass = process.env.ADMIN_PASSWORD || "admin123";
    const full = await req({
      method: "GET",
      path: "/api/admin/analytics/full",
      headers: { "x-admin-password": adminPass }
    });
    if (full.status !== 200 || full.body.n === undefined) {
      throw new Error(
        `Analytics full endpoint basarisiz: status=${full.status} body=${JSON.stringify(full.body)}`
      );
    }
    if (full.body.n < 3) {
      throw new Error("Analytics icin yeterli kayit yok.");
    }

    const insights = await req({
      method: "GET",
      path: "/api/admin/analytics/insights?window=7",
      headers: { "x-admin-password": adminPass }
    });
    if (insights.status !== 200 || insights.body.n === undefined) {
      throw new Error(
        `Insights endpoint basarisiz: status=${insights.status} body=${JSON.stringify(insights.body)}`
      );
    }
    if (insights.body.actionScore === undefined) {
      throw new Error("Insights yanitinda actionScore eksik.");
    }

    const simulate = await req({
      method: "POST",
      path: "/api/admin/analytics/simulate?window=7",
      data: { budgetPressurePct: -10, stressNormPct: 0, behaviorScorePts: 0.05 },
      headers: { "x-admin-password": adminPass }
    });
    if (simulate.status !== 200 || simulate.body.baseline === undefined) {
      throw new Error(
        `Simulate endpoint basarisiz: status=${simulate.status} body=${JSON.stringify(simulate.body)}`
      );
    }
    if (simulate.body.delta === undefined || simulate.body.simulated === undefined) {
      throw new Error("Simulate yanitinda baseline/delta eksik.");
    }

    const summary = await req({
      method: "GET",
      path: "/api/admin/summary?limit=10",
      headers: { "x-admin-password": adminPass }
    });
    if (summary.status !== 200 || !summary.body.fsiHistogram || !summary.body.appliedFilter) {
      throw new Error(
        `Summary endpoint (histogram/filtre) basarisiz: status=${summary.status}`
      );
    }

    const tsMonth = await req({
      method: "GET",
      path: "/api/admin/timeseries?groupBy=month",
      headers: { "x-admin-password": adminPass }
    });
    if (tsMonth.status !== 200 || tsMonth.body.groupBy !== "month") {
      throw new Error("Timeseries month gruplama basarisiz.");
    }

    console.log("Smoke test basarili (analiz + istatistik + insights + simulate + ozet).");
  } finally {
    shutdown();
    await sleep(500);
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
